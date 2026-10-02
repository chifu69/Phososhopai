/* Shared mobile interaction for local adjustments and sampled repairs. */
(() => {
'use strict';
let active=null,opening=0,frame=0;
const $=id=>document.getElementById(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function range(id,label,min,max,value,step=1){return `<label class="local-control">${label}<input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output for="${id}">${value}</output></label>`}
function panel(kind){
 const root=document.createElement('section');root.className='local-retouch-panel';
 root.innerHTML=`<p class="project-note">${kind==='local-adjust'?'Pinta solo la zona que quieres mejorar.':'Elige una muestra limpia y pinta sobre un detalle pequeño.'}</p>
 ${kind==='local-repair'?'<label class="local-control">Modo<select id="local-repair-mode"><option value="heal">Corrector</option><option value="clone">Clonar</option></select></label><button id="local-source" type="button" class="secondary wide">Elegir origen</button>':''}
 <div class="local-controls">${range('local-size','Tamaño (%)',1,30,8)}${range('local-softness','Suavidad (%)',0,100,65)}${range('local-intensity','Intensidad (%)',0,100,100)}
 ${kind==='local-adjust'?range('local-exposure','Luz (EV)',-2,2,.35,.05)+range('local-temperature','Temperatura',-100,100,0)+range('local-saturation','Saturación',-100,100,0):''}</div>
 <div class="local-options"><label><input id="local-erase" type="checkbox"> Borrar zona</label><label><input id="local-show-zone" type="checkbox"> Mostrar zona</label>${kind==='local-adjust'?'<label><input id="local-selection" type="checkbox"> Limitar a selección IA</label>':''}</div>
 <p id="local-status" class="project-note" role="status">Preparando fotografía…</p>
 <div class="local-actions"><button id="local-cancel" class="secondary" type="button">Cancelar</button><button id="local-apply" class="primary" type="button" disabled>Aplicar</button></div>`;
 return root;
}
function message(text){const el=$('local-status');if(el)el.textContent=text}
function params(s){return s.kind==='local-adjust'?{exposure:Number($('local-exposure').value),temperature:Number($('local-temperature').value),saturation:Number($('local-saturation').value),intensity:Number($('local-intensity').value)/100}:{mode:$('local-repair-mode').value,intensity:Number($('local-intensity').value)/100}}
function recipe(s){return {kind:s.kind,strokes:s.strokes,params:params(s),...($('local-selection')?.checked&&s.selection?{selection:{assetId:s.selection.assetId,width:s.selection.width,height:s.selection.height}}:{})}}
function removeOverlay(s){if(s.overlay){s.canvas.remove(s.overlay);s.overlay=null}s.photo.visible=s.visible;s.photo.dirty=true}
function syncOverlay(){const s=active;if(!s?.overlay)return;const p=s.photo;s.overlay.set({left:p.left,top:p.top,originX:p.originX,originY:p.originY,angle:p.angle,flipX:p.flipX,flipY:p.flipY,scaleX:p.width*p.scaleX/s.width,scaleY:p.height*p.scaleY/s.height,clipPath:p.clipPath});s.overlay.setCoords();s.canvas.requestRenderAll()}
function preview(){
 frame=0;const s=active;if(!s?.source||!PhotoProject.valid(s.token))return;
 const r=recipe(s),selection=r.selection?s.selection:null,result=PhotoLocalRetouchCore.render(s.source,r,selection);
 if($('local-show-zone').checked){const mask=PhotoLocalRetouchCore.mask(s.width,s.height,s.strokes);for(let i=0;i<mask.length;i++){let a=mask[i]*.4;if(selection){const x=i%s.width,y=Math.floor(i/s.width);a*=selection.data[Math.min(selection.height-1,Math.floor(y*selection.height/s.height))*selection.width+Math.min(selection.width-1,Math.floor(x*selection.width/s.width))]/255}const j=i*4;result.data[j]+= (80-result.data[j])*a;result.data[j+1]+=(180-result.data[j+1])*a;result.data[j+2]+=(255-result.data[j+2])*a}}
 s.preview.getContext('2d').putImageData(new ImageData(result.data,s.width,s.height),0,0);
 if(!s.overlay){s.overlay=new fabric.Image(s.preview,{selectable:false,evented:false,objectCaching:false});s.overlay.photoRole='preview-overlay';s.overlay.excludeFromExport=true;s.canvas.add(s.overlay);s.canvas.moveTo(s.overlay,s.canvas.getObjects().indexOf(s.photo)+1)}
 s.photo.visible=false;s.overlay.dirty=true;syncOverlay();$('local-apply').disabled=!s.strokes.some(x=>!x.erase);
}
function schedule(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(preview)}
function point(event){const s=active;if(!s?.source)return null;const p=s.canvas.getPointer(event),inv=fabric.util.invertTransform(s.photo.calcTransformMatrix()),v=fabric.util.transformPoint(new fabric.Point(p.x,p.y),inv);return {x:(v.x+s.photo.width/2)/s.photo.width,y:(v.y+s.photo.height/2)/s.photo.height}}
function guide(point,source=false){const s=active;if(!s)return;const node=source?s.cross:s.cursor;if(!point){node.hidden=true;return}const p=s.photo,v=fabric.util.transformPoint(new fabric.Point((point.x-.5)*p.width,(point.y-.5)*p.height),p.calcTransformMatrix());node.hidden=false;node.style.left=`${v.x}px`;node.style.top=`${v.y}px`;if(!source){const radius=Number($('local-size').value)/100*Math.min(p.width,p.height)*Math.abs(p.scaleX);node.style.width=node.style.height=`${radius*2}px`}}
function down(e){
 const s=active,p=point(e.e);if(!s?.source||!p||p.x<0||p.x>1||p.y<0||p.y>1)return;
 if(s.chooseSource){s.origin=p;s.chooseSource=false;guide(p,true);message('Muestra elegida. Pinta sobre la zona que quieres reparar.');return}
 const erase=$('local-erase').checked;
 if(s.kind==='local-repair'&&!s.origin&&!erase){message('Pulsa Elegir origen y toca una zona limpia.');return}
 s.stroke={points:[p],radius:Number($('local-size').value)/100,softness:Number($('local-softness').value)/100,opacity:1,erase,...(s.origin?{offset:{x:s.origin.x-p.x,y:s.origin.y-p.y}}:{})};s.strokes.push(s.stroke);guide(p);schedule();
}
function move(e){const s=active,p=point(e.e);if(!s||!p)return;guide(p);if(!s.stroke)return;s.stroke.points.push({x:clamp(p.x,0,1),y:clamp(p.y,0,1)});schedule()}
function up(){if(active)active.stroke=null}
function interrupted(){const s=active;if(s?.stroke){s.strokes.pop();s.stroke=null;schedule()}if(s)s.cursor.hidden=true}
function cleanup(s){
 cancelAnimationFrame(frame);frame=0;s.canvas.off('mouse:down',down);s.canvas.off('mouse:move',move);s.canvas.off('mouse:up',up);s.canvas.upperCanvasEl.removeEventListener('pointercancel',interrupted);s.canvas.upperCanvasEl.removeEventListener('pointerleave',up);
 removeOverlay(s);s.cursor.remove();s.cross.remove();s.preview.width=s.preview.height=1;s.canvas.requestRenderAll();PhotoProject.markPreview(false);if(document.body.dataset.canvasMode==='local-retouch')PhotoIA.setCanvasMode('move',{openPanel:false,announce:false});
}
function cancel(){++opening;const s=active;active=null;if(s)cleanup(s)}
async function open(kind){
 cancel();if(!PhotoIA.state.photo){PhotoIA.toast('Abre una fotografía primero.');return}
 if(PhotoProject.previewing)await PhotoProject.cancelPreview();PhotoProject.snapshot();const token=PhotoProject.token(),doc=PhotoIA.getDocument(),root=panel(kind);
 PhotoWorkspace.showPanel(kind==='local-adjust'?'Pincel de luz y color':'Corrector y clonar',root);
 const seq=++opening,canvas=PhotoIA.state.canvas,photo=PhotoIA.state.photo,wrap=$('canvas-wrap'),cursor=document.createElement('div'),cross=document.createElement('div');cursor.className='local-brush-cursor';cross.className='local-source-cross';cross.textContent='+';cursor.hidden=cross.hidden=true;wrap.append(cursor,cross);
 const s={kind,canvas,photo,visible:photo.visible,token,root,strokes:[],cursor,cross,preview:document.createElement('canvas'),chooseSource:false};active=s;PhotoIA.setCanvasMode('local-retouch',{openPanel:false,announce:false});PhotoProject.markPreview(true);
 $('local-cancel').onclick=()=>{cancel();PhotoWorkspace.closePanel()};$('local-apply').onclick=()=>apply().catch(e=>{PhotoIA.toast(e.code==='STALE_RESULT'?'La fotografía cambió. Vuelve a abrir el retoque.':e.message);message('No se pudo aplicar; la fotografía se conserva.')});
 root.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',()=>{const out=input.parentElement.querySelector('output');if(out)out.textContent=input.value;schedule()}));
 if($('local-source'))$('local-source').onclick=()=>{s.chooseSource=true;message('Toca la zona limpia que quieres copiar.')};
 try{
  const c=await PhotoRenderer.renderPhotoPixels(doc,PhotoProject.resolveAsset,{maxDimension:1200});
  if(active!==s||seq!==opening||!PhotoProject.valid(token)){c.width=c.height=1;if(active===s)cancel();return}
  s.width=c.width;s.height=c.height;s.source=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height);c.width=c.height=1;s.preview.width=s.width;s.preview.height=s.height;
  if(doc.selection){const a=await PhotoProject.resolveAsset(doc.selection.assetId);s.selection={...doc.selection,data:new Uint8Array(await a.blob.arrayBuffer())}}
  if(active!==s||seq!==opening||!PhotoProject.valid(token)){if(active===s)cancel();return}
  if($('local-selection')){$('local-selection').disabled=!s.selection;$('local-selection').parentElement.title=s.selection?'':'Crea primero una selección IA.'}
  canvas.on('mouse:down',down);canvas.on('mouse:move',move);canvas.on('mouse:up',up);canvas.upperCanvasEl.addEventListener('pointercancel',interrupted);canvas.upperCanvasEl.addEventListener('pointerleave',up);
  message(kind==='local-adjust'?'Pinta sobre la foto. Aplicar guardará este retoque.':'Pulsa Elegir origen y toca una zona limpia.');
 }catch(e){if(active===s){cancel();message('No se pudo preparar la fotografía.');PhotoIA.toast(e.message)}}
}
async function apply(){const s=active;if(!s?.source||!s.strokes.some(x=>!x.erase))return false;if(!PhotoProject.valid(s.token)){cancel();throw PhotoRenderer.error('STALE_RESULT')}
 const r=structuredClone(recipe(s));active=null;cleanup(s);PhotoIA.processing(true,'Aplicando retoque local…');try{await PhotoProject.commitOperation({kind:s.kind,params:{recipe:r}},s.token);PhotoWorkspace.closePanel();PhotoIA.toast('Retoque aplicado. Puedes deshacerlo.');return true}finally{PhotoIA.processing(false)}
}
document.addEventListener('photoia:panel-closing',cancel);
document.addEventListener('photoia:document-changed',cancel);
document.addEventListener('photoia:canvas-mode-changed',e=>{if(active&&e.detail.mode!=='local-retouch')cancel()});
window.addEventListener('photoia:workspace-layout',()=>{requestAnimationFrame(()=>{syncOverlay();if(active?.origin)guide(active.origin,true)})});
window.PhotoLocalRetouch={open,apply,cancel,get active(){return !!active}};
})();
