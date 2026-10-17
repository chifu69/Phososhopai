import {workingCopy} from './image-working-copy.js?v=0.2.1';
// Interaction only: PhotoCraft owns the source pixels, masks and composition.
export function attachMontage({controller,canvas,viewport,run,error,update,closePanels,scheduleSave}){
 const $=id=>document.getElementById(id),source=$('source-canvas'),ctx=source.getContext('2d');
 let active=false,mode='',params,dimensions,sourceImage,version=0,timer,running=false,dirty=false,valid=true,drag,originalFile;
 const controls=['scale','angle','opacity','ev','temperature','feather'];
 function paint(frame,target){target.width=frame.width;target.height=frame.height;target.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.rgba),frame.width,frame.height),0,0)}
 function layout(){if(!active||mode!=='source')return;const stage=$('stage'),s=Math.min((stage.clientWidth-16)/source.width,(stage.clientHeight-16)/source.height);source.style.width=`${Math.max(1,source.width*s)}px`;source.style.height=`${Math.max(1,source.height*s)}px`}
 new ResizeObserver(layout).observe($('stage'));
 function setMode(next){mode=next;document.body.dataset.montage=next;source.hidden=next!=='source';canvas.hidden=next==='source';$('source-options').hidden=next!=='source';$('placement-options').hidden=next!=='place';$('place-head').hidden=next!=='source';$('apply-montage').hidden=next!=='place';$('back-source').hidden=next!=='place';$('montage-title').textContent=next==='source'?'Seleccionar cabeza':'Colocar e integrar';$('montage-help').textContent=next==='source'?'Arrastra un óvalo alrededor de la cabeza. Contorno: toca los puntos del borde.':'Arrastra la cabeza sobre el cuerpo. Ajusta tamaño, giro y luz.';if(params?.originalSize)$('montage-help').textContent+=' Copia de trabajo reducida; el archivo original se conserva.';layout();viewport.fit()}
 function sync(){for(const k of controls){$('montage-'+k).value=params[k];$('value-'+k).textContent=Number(params[k]).toFixed(k==='scale'||k==='opacity'?2:1)}$('montage-flip').checked=params.flip}
 function draw(){ctx.clearRect(0,0,source.width,source.height);ctx.drawImage(sourceImage,0,0);const sx=source.width/dimensions.width,sy=source.height/dimensions.height;ctx.save();ctx.scale(sx,sy);ctx.fillStyle='#12182099';ctx.beginPath();ctx.rect(0,0,dimensions.width,dimensions.height);const [x,y,w,h]=params.crop;
  if(params.points.length>=3){ctx.moveTo(...params.points[0]);for(const p of params.points.slice(1))ctx.lineTo(...p);ctx.closePath()}else{ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2)}ctx.fill('evenodd');ctx.beginPath();if(params.points.length){ctx.moveTo(...params.points[0]);for(const p of params.points.slice(1))ctx.lineTo(...p);if(params.points.length>=3)ctx.closePath()}else ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.strokeStyle='#65b5ff';ctx.lineWidth=2/sx;ctx.stroke();
  for(const p of params.points){ctx.beginPath();ctx.arc(p[0],p[1],3/sx,0,7);ctx.fillStyle='#a8d6ff';ctx.fill()}
  for(const s of params.strokes){ctx.beginPath();ctx.arc(s.x,s.y,s.radius,0,7);ctx.fillStyle=s.restore?'#4adba64d':'#ff62624d';ctx.fill();ctx.strokeStyle=s.restore?'#4adba6':'#ff6262';ctx.stroke()}ctx.restore();
 }
 async function start(edit=false){
  const file=$('head-file').files[0];if(!edit&&!file)return;if(file?.size>64*1024*1024)throw Object.assign(Error(),{code:'LIMIT_EXCEEDED'});
  const available=16000000-controller.info.width*controller.info.height;
  const copy=edit?null:await workingCopy(file,Math.min(2000000,Math.max(64000,Math.floor(available/8))));
  const result=edit?await controller.client.request('editMontage'):await controller.client.request('beginMontage',{bytes:await copy.file.arrayBuffer()});
  try{
   const frame=await controller.client.request('montageSource');dimensions=result;params=structuredClone(result.params);originalFile=edit?null:file;if(copy?.resized)params.originalSize={width:copy.width,height:copy.height};sourceImage=document.createElement('canvas');paint(frame,sourceImage);source.width=frame.width;source.height=frame.height;
   active=true;valid=true;version++;controller.previewVersion++;closePanels();$('montage-panel').hidden=false;viewport.setEnabled(false);$('selection-mode').value=params.points.length?'polygon':'oval';sync();setMode('source');draw();update();
  }catch(e){await controller.client.request('cancelMontage');throw e}
  finally{$('head-file').value=''}
 }
 function requestPreview(){clearTimeout(timer);version++;valid=false;buttons();dirty=true;timer=setTimeout(flush,130)}
 async function flush(){if(running||!active||mode!=='place')return;running=true;dirty=false;const token=version,p=structuredClone(params);
  try{const frame=await controller.client.request('previewMontage',p);if(active&&mode==='place'&&token===version){controller.emit('preview',frame);valid=true}}
  catch(e){if(active&&token===version){valid=false;error(e)}}finally{running=false;buttons();if(dirty&&active&&mode==='place')timer=setTimeout(flush,30)}
 }
 function buttons(){$('apply-montage').disabled=!valid||running;$('montage-preview-status').textContent=running||dirty&&mode==='place'?'Preparando vista previa…':''}
 function change(){sync();if(mode==='source')draw();else requestPreview()}
 function finish(){originalFile=null;sourceImage=null;source.width=source.height=1;active=false;mode='';version++;dirty=false;clearTimeout(timer);controller.previewVersion++;document.body.dataset.montage='';$('montage-panel').hidden=true;source.hidden=true;canvas.hidden=false;viewport.setEnabled(true);viewport.fit();update()}
 $('montage-button').onclick=()=>{$('head-file').click()};
 $('head-file').onchange=()=>run(()=>start());$('edit-montage').onclick=()=>run(()=>start(true));
 $('place-head').onclick=()=>{if($('selection-mode').value==='polygon'&&params.points.length<3){error({code:'INVALID_INPUT'});return}setMode('place');requestPreview()};
 $('back-source').onclick=()=>{version++;dirty=false;clearTimeout(timer);setMode('source');draw()};
 $('cancel-montage').onclick=()=>run(async()=>{finish();await controller.client.request('cancelMontage');await controller.render()});
 $('apply-montage').onclick=()=>run(async()=>{if(!valid||running)return;const p=structuredClone(params);await controller.apply('commitMontage',p);if(originalFile)controller.montageOriginals[controller.info.activeLayer]=originalFile;finish();scheduleSave()});
 for(const k of controls)$('montage-'+k).oninput=()=>{params[k]=Number($('montage-'+k).value);change()};
 $('montage-flip').onchange=()=>{params.flip=$('montage-flip').checked;change()};
 $('selection-mode').onchange=()=>{if(['oval','polygon'].includes($('selection-mode').value)){params.points=[];params.strokes=[]}draw()};
 $('undo-point').onclick=()=>{if(params.strokes.length)params.strokes.pop();else params.points.pop();draw()};
 $('reset-mask').onclick=()=>{params.points=[];params.strokes=[];$('selection-mode').value='oval';draw()};
 function point(e,target,w,h){const r=target.getBoundingClientRect();return [Math.max(0,Math.min(w,(e.clientX-r.left)*w/r.width)),Math.max(0,Math.min(h,(e.clientY-r.top)*h/r.height))]}
 source.onpointerdown=e=>{if(!active||mode!=='source')return;source.setPointerCapture(e.pointerId);const p=point(e,source,dimensions.width,dimensions.height),tool=$('selection-mode').value;
  if(tool==='polygon'){if(params.points.length<128)params.points.push(p);draw();return}
  drag={start:p,tool,id:e.pointerId};if(tool==='hide'||tool==='restore')stroke(p,tool);e.preventDefault();
 };
 function stroke(p,tool){if(params.strokes.length>=256)return;const radius=Math.max(1,Math.min(dimensions.width,dimensions.height)*Number($('mask-size').value)/100);const last=drag?.last;if(last&&Math.hypot(last[0]-p[0],last[1]-p[1])<radius/3)return;if(drag)drag.last=p;params.strokes.push({x:p[0],y:p[1],radius,restore:tool==='restore'});draw()}
 source.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const p=point(e,source,dimensions.width,dimensions.height);if(drag.tool==='oval'){params.points=[];params.strokes=[];params.crop=[Math.min(p[0],drag.start[0]),Math.min(p[1],drag.start[1]),Math.max(1,Math.abs(p[0]-drag.start[0])),Math.max(1,Math.abs(p[1]-drag.start[1]))];draw()}else stroke(p,drag.tool)};
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])source.addEventListener(ev,()=>drag=null);
 canvas.addEventListener('pointerdown',e=>{if(!active||mode!=='place')return;canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,start:[e.clientX,e.clientY],x:params.x,y:params.y};e.preventDefault()});
 canvas.addEventListener('pointermove',e=>{if(!active||mode!=='place'||drag?.id!==e.pointerId)return;const r=canvas.getBoundingClientRect(),d=controller.info;params.x=Math.max(-d.width,Math.min(d.width*2,drag.x+(e.clientX-drag.start[0])*d.width/r.width));params.y=Math.max(-d.height,Math.min(d.height*2,drag.y+(e.clientY-drag.start[1])*d.height/r.height));requestPreview()});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>drag=null);
 return {get active(){return active}};
}
