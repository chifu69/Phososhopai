(() => {
'use strict';
const VERSION='15.33';
const $=id=>document.getElementById(id);
const controls=[...document.querySelectorAll('button[disabled],input[disabled]')];
const sliders=['brightness','contrast','saturation','temperature','sharpness','blur'];
const state={canvas:null,photo:null,originalDataUrl:'',originalMime:'image/jpeg',originalName:'',history:[],future:[],cropper:null,compare:false,compareOverlay:null,compareVisibility:null,loading:false,cvReady:false,layerSeq:0,processingScrollY:0,resizing:false};

function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}
function processing(on,label='Procesando…'){
 state.loading=on;
 const overlay=$('processing');
 overlay.hidden=!on;
 overlay.querySelector('b').textContent=label;
 if(on){
   if(!document.body.classList.contains('processing-lock')){
     state.processingScrollY=window.scrollY||0;
     document.body.style.top=`-${state.processingScrollY}px`;
     document.body.classList.add('processing-lock');
   }
 }else if(document.body.classList.contains('processing-lock')){
   document.body.classList.remove('processing-lock');
   document.body.style.top='';
   window.scrollTo(0,state.processingScrollY||0);
 }
}
function setEnabled(enabled){document.querySelectorAll('[data-command],[data-preset],#command-input,#command-btn,#compare-btn,#reset-btn,#new-photo-btn,#rotate-left,#rotate-right,#flip-x,#crop-btn,#add-text,#add-sticker,#download-btn,.slider-list input,#create-text,#draw-pencil,#draw-marker,#draw-off,#clear-drawing,[data-add-shape],[data-sticker],[data-text-preset],[data-canvas-mode]').forEach(el=>el.disabled=!enabled)}
function normalize(text){return String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}
function getPhotoDisplayRatio(){
 const p=state.photo;
 if(!p)return 1;
 const angle=((p.angle||0)%360+360)%360;
 const swap=angle===90||angle===270;
 const w=swap?p.height:p.width;
 const h=swap?p.width:p.height;
 return Math.max(.15,Math.min(6,w/Math.max(1,h)));
}
function fitCanvas(){
 const wrap=$('canvas-wrap');
 const w=Math.max(280,Math.round(wrap.clientWidth));
 let h;
 if(state.photo){
   const ratio=getPhotoDisplayRatio();
   const ideal=Math.round(w/ratio);
   const maxH=Math.max(360,Math.min(window.innerHeight*.72,760));
   const minH=Math.min(300,Math.max(220,window.innerHeight*.28));
   h=Math.round(Math.max(minH,Math.min(ideal,maxH)));
 }else{
   h=Math.max(360,Math.min(window.innerHeight*.52,620));
 }
 const oldW=state.canvas?.width||w,oldH=state.canvas?.height||h;
 const oldPhotoScale=state.photo?.scaleX||1;
 const extras=state.photo?state.canvas.getObjects().filter(o=>o!==state.photo&&o.photoRole!=='preview-overlay'):[];
 state.resizing=true;
 state.canvas.setDimensions({width:w,height:h});
 if(state.photo){
   fitPhoto();
   // Keep editable layers registered to the photograph when the phone rotates or the viewport changes.
   const ratio=(state.photo.scaleX||1)/Math.max(.0001,oldPhotoScale);
   if(Number.isFinite(ratio)&&oldW>0&&oldH>0&&(Math.abs(w-oldW)>.5||Math.abs(h-oldH)>.5)){
     extras.forEach(o=>{
       const ox=(Number(o.left)||0)-oldW/2,oy=(Number(o.top)||0)-oldH/2;
       o.set({left:w/2+ox*ratio,top:h/2+oy*ratio,scaleX:(o.scaleX||1)*ratio,scaleY:(o.scaleY||1)*ratio});
       o.setCoords();
     });
   }
 }
 state.canvas.calcOffset();
 state.canvas.requestRenderAll();
 state.resizing=false;
}
function fitPhoto(){
 const p=state.photo;if(!p)return;
 const pad=Math.max(4,Math.min(10,Math.round(Math.min(state.canvas.width,state.canvas.height)*.012)));
 const angle=((p.angle||0)%360+360)%360;
 const swap=angle===90||angle===270;
 const displayW=swap?p.height:p.width;
 const displayH=swap?p.width:p.height;
 const scale=Math.min((state.canvas.width-pad*2)/displayW,(state.canvas.height-pad*2)/displayH);
 p.scale(Math.max(.01,scale));
 p.set({left:state.canvas.width/2,top:state.canvas.height/2,originX:'center',originY:'center'});
 p.setCoords();
}
function snapshot(){if(!state.photo||state.resizing||state.compare)return;const json=state.canvas.toJSON(['photoRole','layerId','layerName','layerType','userLocked','shapeSettings','photoAdjustments']);const prev=state.history[state.history.length-1];if(prev&&JSON.stringify(prev)===JSON.stringify(json)){updateHistoryButtons();renderLayers();return}state.history.push(json);if(state.history.length>40)state.history.shift();state.future=[];updateHistoryButtons();renderLayers()}
function updateHistoryButtons(){$('undo-btn').disabled=state.history.length<2;$('redo-btn').disabled=!state.future.length}
function rehydratePhotoAdjustments(){
 if(!state.photo)return;
 const byType={Brightness:'brightness',Contrast:'contrast',Saturation:'saturation',BlendColor:'temperature',Blur:'blur',Convolute:'sharpness'};
 (state.photo.filters||[]).forEach(f=>{if(!f.__key&&byType[f.type])f.__key=byType[f.type]});
 resetSliderUI();
 const a=state.photo.photoAdjustments||{};
 sliders.forEach(id=>{if(!(id in a))return;const v=Number(a[id])||0;const el=$(id),out=$(`${id}-out`);if(el)el.value=String(v);if(out)out.textContent=String(v)});
}
function restoreJSON(json){state.canvas.loadFromJSON(json,()=>{state.photo=state.canvas.getObjects().find(o=>o.photoRole==='main')||null;rehydratePhotoAdjustments();state.canvas.requestRenderAll();updateHistoryButtons();renderLayers()})}
function undo(){if(state.history.length<2)return;state.future.push(state.history.pop());restoreJSON(state.history[state.history.length-1])}
function redo(){if(!state.future.length)return;const next=state.future.pop();state.history.push(next);restoreJSON(next)}
function restoreHistoryIndex(index){
 const i=Math.max(0,Math.min(state.history.length-1,Number(index)||0));if(!state.history.length)return;
 const selected=state.history[i],after=state.history.slice(i+1);
 state.history=state.history.slice(0,i+1);state.future=after.reverse();restoreJSON(selected);updateHistoryButtons();
}

async function fileToImage(file){
 if(!file||!file.type.startsWith('image/'))throw new Error('Selecciona un archivo de imagen.');
 const url=URL.createObjectURL(file);
 try{
   const img=new Image();img.decoding='async';img.src=url;
   if(img.decode) await img.decode(); else await new Promise((res,rej)=>{img.onload=res;img.onerror=rej});
   return img;
 } finally {setTimeout(()=>URL.revokeObjectURL(url),2000)}
}
async function loadFile(file){
 processing(true,'Abriendo fotografía…');
 try{
   const img=await fileToImage(file);
   const max=2000;const ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
   const off=document.createElement('canvas');off.width=Math.max(1,Math.round(img.naturalWidth*ratio));off.height=Math.max(1,Math.round(img.naturalHeight*ratio));
   const preserveAlpha=/png|webp/i.test(file.type||'');
   const ctx=off.getContext('2d',{alpha:preserveAlpha});
   if(!preserveAlpha){ctx.fillStyle='#fff';ctx.fillRect(0,0,off.width,off.height)}
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,off.width,off.height);
   const mime=file.type==='image/png'?'image/png':file.type==='image/webp'?'image/webp':'image/jpeg';
   const data=mime==='image/png'?off.toDataURL(mime):off.toDataURL(mime,.96);
   state.originalDataUrl=data;state.originalMime=mime;state.originalName=file.name||'camera.jpg';
   await setMainImage(data,file.name||'camera.jpg');
   toast('Foto abierta correctamente');
 }catch(err){console.error(err);toast('No pude abrir la foto. Intenta otra vez.')}finally{processing(false)}
}
function fabricImageFromURL(url){return new Promise((resolve,reject)=>fabric.Image.fromURL(url,img=>img?resolve(img):reject(new Error('Fabric no cargó la imagen')),{crossOrigin:'anonymous'}))}
async function setMainImage(dataUrl,name='image.jpg'){
 const img=await fabricImageFromURL(dataUrl);
 state.canvas.clear();img.photoRole='main';img.layerId='layer-photo';img.layerName='Fotografía';img.layerType='photo';img.photoAdjustments={};img.set({selectable:false,evented:false,objectCaching:false,opacity:1,visible:true});img.globalCompositeOperation='source-over';state.photo=img;state.canvas.add(img);state.canvas.sendToBack(img);fitCanvas();
 $('empty-state').hidden=true;$('project-title').textContent=name;$('image-info').textContent=`${img.width} × ${img.height}px`;setEnabled(true);resetSliderUI();state.history=[];state.future=[];snapshot();normalizePhotoVisualState();document.dispatchEvent(new CustomEvent('photoia:image-loaded',{detail:{name,width:img.width,height:img.height}}));
}


function getPhotoAnalysisCanvas(max=900){
 if(!state.photo)throw new Error('Abre una foto primero.');
 const source=state.photo._filteredEl||state.photo._element||state.photo.getElement?.()||state.photo._originalElement;
 if(!source)throw new Error('No pude leer la fotografía original.');
 const sw=source.naturalWidth||source.videoWidth||source.width||state.photo.width;
 const sh=source.naturalHeight||source.videoHeight||source.height||state.photo.height;
 const ratio=Math.min(1,max/Math.max(sw,sh));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(sw*ratio));canvas.height=Math.max(1,Math.round(sh*ratio));
 const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(source,0,0,sw,sh,0,0,canvas.width,canvas.height);
 return canvas;
}

async function getOriginalAnalysisCanvas(max=1800){
 if(!state.originalDataUrl)throw new Error('Abre una foto primero.');
 const img=await new Promise((resolve,reject)=>{const im=new Image();im.decoding='async';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('No pude leer la fotografía original.'));im.src=state.originalDataUrl});
 const sw=img.naturalWidth||img.width,sh=img.naturalHeight||img.height,ratio=Math.min(1,max/Math.max(sw,sh));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*ratio));canvas.height=Math.max(1,Math.round(sh*ratio));
 const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,sw,sh,0,0,canvas.width,canvas.height);return canvas;
}

function normalizePhotoVisualState(){
 if(!state.photo)return;
 state.photo.set({opacity:1,visible:true});
 state.photo.globalCompositeOperation='source-over';
 if(state.canvas?.contextContainer)state.canvas.contextContainer.globalAlpha=1;
 state.canvas?.getObjects().forEach(o=>{if(o.photoRole==='preview-overlay')state.canvas.remove(o)});
 state.photo.dirty=true;state.canvas.requestRenderAll();
}
function clearCurrentPhoto(){
 if(!state.photo)return;
 if(!confirm('¿Borrar la foto actual y comenzar una nueva edición?'))return;
 state.canvas.clear();state.photo=null;state.originalDataUrl='';state.originalMime='image/jpeg';state.originalName='';state.history=[];state.future=[];
 resetSliderUI();setEnabled(false);$('empty-state').hidden=false;$('project-title').textContent='Nueva edición';$('image-info').textContent='Sin imagen';
 $('file-input').value='';$('camera-input').value='';
 document.dispatchEvent(new CustomEvent('photoia:image-cleared'));
 updateHistoryButtons();renderLayers();toast('Listo para una nueva foto');
}
function resetSliderUI(){sliders.forEach(id=>{$(id).value=0;$(`${id}-out`).textContent='0'})}
function getFilters(){return state.photo?.filters||[]}
function replaceFilter(key,filter){const list=getFilters().filter(f=>f.__key!==key);if(filter){filter.__key=key;list.push(filter)}state.photo.filters=list;state.photo.applyFilters();state.canvas.requestRenderAll()}
function applySlider(id,value,commit=false){if(!state.photo)return;const v=Number(value);$(`${id}-out`).textContent=v;state.photo.photoAdjustments={...(state.photo.photoAdjustments||{}),[id]:v};const F=fabric.Image.filters;let filter=null;
 if(id==='brightness')filter=new F.Brightness({brightness:v/100});
 if(id==='contrast')filter=new F.Contrast({contrast:v/100});
 if(id==='saturation')filter=new F.Saturation({saturation:v/100});
 if(id==='temperature'){const warm=v/100;filter=new F.BlendColor({color:warm>=0?'#ff9a48':'#63a6ff',mode:'tint',alpha:Math.abs(warm)*.28})}
 if(id==='blur')filter=v?new F.Blur({blur:Math.min(.8,v/20*.6)}):null;
 if(id==='sharpness')filter=v?new F.Convolute({matrix:[0,-v/200,0,-v/200,1+v/50,-v/200,0,-v/200,0]}):null;
 replaceFilter(id,Math.abs(v)>0?filter:null);if(commit)snapshot()
}
function applyAdaptiveAdjustments(values={}, commit=true){
 if(!state.photo)throw new Error('Abre una foto primero.');
 const F=fabric?.Image?.filters;
 if(!F)throw new Error('El motor de filtros todavía no está listo.');
 const allowed=['brightness','contrast','saturation','temperature','sharpness','blur'];
 const normalized={};
 for(const id of allowed){
  const el=$(id);const min=Number(el?.min??-100),max=Number(el?.max??100);
  const raw=(id in values)?values[id]:Number(el?.value||0);
  const v=Math.max(min,Math.min(max,Math.round(Number(raw)||0)));
  normalized[id]=v;
  if(el)el.value=String(v);const out=$(`${id}-out`);if(out)out.textContent=String(v);
 }
 // Construye toda la receta de una sola vez. Safari es mucho más estable así
 // que llamando applyFilters seis veces durante la misma pulsación.
 const keep=(state.photo.filters||[]).filter(f=>!allowed.includes(f.__key));
 const add=(key,filter)=>{if(filter){filter.__key=key;keep.push(filter)}};
 normalized.brightness=Math.max(-18,Math.min(18,normalized.brightness));normalized.contrast=Math.max(-16,Math.min(28,normalized.contrast));
 const b=normalized.brightness,c=normalized.contrast,s=normalized.saturation,t=normalized.temperature,sh=normalized.sharpness,bl=normalized.blur;
 if(b&&F.Brightness)add('brightness',new F.Brightness({brightness:b/100}));
 if(c&&F.Contrast)add('contrast',new F.Contrast({contrast:c/100}));
 if(s&&F.Saturation)add('saturation',new F.Saturation({saturation:s/100}));
 if(t&&F.BlendColor)add('temperature',new F.BlendColor({color:t>=0?'#ff9a48':'#63a6ff',mode:'tint',alpha:Math.abs(t/100)*.28}));
 if(bl&&F.Blur)add('blur',new F.Blur({blur:Math.min(.8,bl/20*.6)}));
 if(sh&&F.Convolute)add('sharpness',new F.Convolute({matrix:[0,-sh/200,0,-sh/200,1+sh/50,-sh/200,0,-sh/200,0]}));
 state.photo.filters=keep;state.photo.photoAdjustments={...normalized};state.photo.dirty=true;
 state.photo.applyFilters();normalizePhotoVisualState();
 if(commit)snapshot();
 return normalized;
}

async function applySmartPixelRecipe(recipe={}, commit=true){
 if(!state.photo||!state.originalDataUrl)throw new Error('Abre una foto primero.');
 processing(true,'Aplicando mejora profesional…');
 try{
  const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=state.originalDataUrl});
  const max=1800,ratio=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const w=Math.max(1,Math.round((img.naturalWidth||img.width)*ratio)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*ratio));
  const c=document.createElement('canvas');c.width=w;c.height=h;const preserveAlpha=state.originalMime==='image/png';const ctx=c.getContext('2d',{alpha:preserveAlpha,willReadFrequently:true});
  if(!preserveAlpha){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h)}ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,w,h);
  const im=ctx.getImageData(0,0,w,h),d=im.data;
  const exposure=Math.pow(2,Number(recipe.exposure||0));
  const shadows=Number(recipe.shadows||0)/100,highlights=Number(recipe.highlights||0)/100;
  const contrast=Number(recipe.contrast||0)/100,vibrance=Number(recipe.vibrance||0)/100;
  const warmth=Number(recipe.warmth||0)/100,clarity=Number(recipe.clarity||0)/100;
  const blackPoint=Number(recipe.blackPoint||0)/255,whitePoint=Number(recipe.whitePoint||255)/255,gamma=Math.max(.75,Math.min(1.3,Number(recipe.gamma||1))),denoise=Math.max(0,Number(recipe.denoise||0))/100;
  const clamp8=v=>v<0?0:v>255?255:v;
  for(let i=0;i<d.length;i+=4){
   let r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
   // Adaptive black/white normalization from the actual photo histogram.
   const span=Math.max(.18,whitePoint-blackPoint);
   r=Math.max(0,Math.min(1,(r-blackPoint)/span));
   g=Math.max(0,Math.min(1,(g-blackPoint)/span));
   b=Math.max(0,Math.min(1,(b-blackPoint)/span));
   r=Math.pow(r,1/gamma)*exposure;g=Math.pow(g,1/gamma)*exposure;b=Math.pow(b,1/gamma)*exposure;
   let l=.2126*r+.7152*g+.0722*b;
   const sw=(1-Math.min(1,l))**2,hw=Math.min(1,l)**2;
   const lift=shadows*.30*sw,rec=highlights*.26*hw;
   r=r+lift-rec;g=g+lift-rec;b=b+lift-rec;
   // Smooth S-curve contrast around perceptual mid gray.
   const cf=1+contrast*.82;r=.5+(r-.5)*cf;g=.5+(g-.5)*cf;b=.5+(b-.5)*cf;
   l=.2126*r+.7152*g+.0722*b;
   const mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx>0?(mx-mn)/mx:0;
   const vf=1+vibrance*(1-sat)*1.35;
   r=l+(r-l)*vf;g=l+(g-l)*vf;b=l+(b-l)*vf;
   r+=warmth*.055;g+=warmth*.012;b-=warmth*.055;
   d[i]=clamp8(r*255);d[i+1]=clamp8(g*255);d[i+2]=clamp8(b*255);
  }
  ctx.putImageData(im,0,0);
  // Lightweight edge-preserving noise cleanup. It is intentionally modest on iPhone.
  if(denoise>0.01){
   const src=ctx.getImageData(0,0,w,h),out=ctx.createImageData(w,h),sd=src.data,od=out.data;od.set(sd);
   const mix=Math.min(.24,denoise*.55);
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=(y*w+x)*4;
    for(let ch=0;ch<3;ch++){
     const avg=(sd[p-4+ch]+sd[p+4+ch]+sd[p-w*4+ch]+sd[p+w*4+ch])/4;
     const diff=Math.abs(sd[p+ch]-avg);
     od[p+ch]=diff<22?clamp8(sd[p+ch]*(1-mix)+avg*mix):sd[p+ch];
    }
    od[p+3]=sd[p+3];
   }
   ctx.putImageData(out,0,0);
  }
  // modest local clarity/sharpening after tone and color processing
  if(clarity>0.01){
   const src=ctx.getImageData(0,0,w,h),out=ctx.createImageData(w,h),sd=src.data,od=out.data;
   const amount=Math.min(.55,clarity*.55);
   od.set(sd);
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=(y*w+x)*4;
    for(let ch=0;ch<3;ch++){
     const blur=(sd[p-4+ch]+sd[p+4+ch]+sd[p-w*4+ch]+sd[p+w*4+ch]+sd[p+ch]*4)/8;
     od[p+ch]=clamp8(sd[p+ch]+(sd[p+ch]-blur)*amount);
    }
    od[p+3]=sd[p+3];
   }
   ctx.putImageData(out,0,0);
  }
  const data=preserveAlpha?c.toDataURL('image/png'):c.toDataURL('image/jpeg',.97);
  const old=state.photo;
  const props={left:old.left,top:old.top,scaleX:old.scaleX,scaleY:old.scaleY,angle:old.angle,flipX:old.flipX,flipY:old.flipY,originX:old.originX,originY:old.originY};
  const next=await fabricImageFromURL(data);next.photoRole='main';next.layerId='layer-photo';next.layerName='Fotografía';next.layerType='photo';next.photoAdjustments={};next.set({...props,selectable:false,evented:false,objectCaching:false,opacity:1,visible:true});
  state.canvas.remove(old);state.photo=next;state.canvas.add(next);state.canvas.sendToBack(next);next.setCoords();state.canvas.requestRenderAll();
  resetSliderUI();normalizePhotoVisualState();if(commit)snapshot();
  return recipe;
 }finally{processing(false)}
}


async function applyProcessedImageDataUrl(dataUrl,commit=true,guard=null,options={}){
 if(!state.photo)throw new Error('Abre una foto primero.');
 const old=state.photo;
 const preserveFilters=!!options?.preserveFilters;
 const keptFilters=preserveFilters?(old.filters||[]).slice():[];
 const keptAdjustments=preserveFilters?{...(old.photoAdjustments||{})}:{};
 const displayedW=Math.max(1,old.getScaledWidth?.()||old.width*(old.scaleX||1));
 const displayedH=Math.max(1,old.getScaledHeight?.()||old.height*(old.scaleY||1));
 const props={left:old.left,top:old.top,angle:old.angle,flipX:old.flipX,flipY:old.flipY,originX:old.originX,originY:old.originY};
 const next=await fabricImageFromURL(dataUrl);
 if(guard&&!guard())return false;
 const nextScaleX=displayedW/Math.max(1,next.width),nextScaleY=displayedH/Math.max(1,next.height);
 next.photoRole='main';next.layerId='layer-photo';next.layerName='Fotografía';next.layerType='photo';next.photoAdjustments=keptAdjustments;
 next.filters=keptFilters;
 next.set({...props,scaleX:nextScaleX,scaleY:nextScaleY,selectable:false,evented:false,objectCaching:false,opacity:1,visible:true});
 if(preserveFilters&&next.filters.length)next.applyFilters();
 state.canvas.remove(old);state.photo=next;state.canvas.add(next);state.canvas.sendToBack(next);next.setCoords();
 if(preserveFilters)rehydratePhotoAdjustments();else resetSliderUI();
 normalizePhotoVisualState();state.canvas.requestRenderAll();if(commit)snapshot();return true;
}

async function applyPreset(name){
 if(!state.photo||!state.originalDataUrl)return;
 processing(true,'Aplicando mejora…');
 try{
  // Siempre parte de la fotografía base. Pulsar el mismo botón varias veces
  // produce exactamente el mismo resultado y nunca acumula filtros.
  const previous=state.photo;
  const props={left:previous.left,top:previous.top,scaleX:previous.scaleX,scaleY:previous.scaleY,angle:previous.angle,flipX:previous.flipX,flipY:previous.flipY,originX:previous.originX,originY:previous.originY};
  const fresh=await fabricImageFromURL(state.originalDataUrl);
  fresh.photoRole='main';fresh.layerId='layer-photo';fresh.layerName='Fotografía';fresh.layerType='photo';fresh.photoAdjustments={brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0};
  fresh.set({...props,selectable:false,evented:false,objectCaching:false,opacity:1,visible:true});
  fresh.filters=[];const F=fabric.Image.filters;
  const add=(key,f)=>{f.__key=key;fresh.filters.push(f)};
  if(name==='bw')add('preset',new F.Grayscale());
  if(name==='vivid'){add('brightness',new F.Brightness({brightness:.035}));add('contrast',new F.Contrast({contrast:.10}));add('saturation',new F.Saturation({saturation:.24}))}
  if(name==='portrait'){add('brightness',new F.Brightness({brightness:.035}));add('contrast',new F.Contrast({contrast:.025}));add('saturation',new F.Saturation({saturation:.035}));add('blur',new F.Blur({blur:.012}))}
  if(name==='auto'||name==='professional'){
    add('brightness',new F.Brightness({brightness:.028}));
    add('contrast',new F.Contrast({contrast:.075}));
    add('saturation',new F.Saturation({saturation:.09}));
    add('sharpness',new F.Convolute({matrix:[0,-.07,0,-.07,1.28,-.07,0,-.07,0]}));
  }
  if(name==='vivid')fresh.photoAdjustments={brightness:4,contrast:10,saturation:24,temperature:0,sharpness:0,blur:0};
  if(name==='portrait')fresh.photoAdjustments={brightness:4,contrast:3,saturation:4,temperature:0,sharpness:0,blur:1};
  if(name==='auto'||name==='professional')fresh.photoAdjustments={brightness:3,contrast:8,saturation:9,temperature:0,sharpness:14,blur:0};
  fresh.applyFilters();
  state.canvas.remove(previous);state.photo=fresh;state.canvas.add(fresh);state.canvas.sendToBack(fresh);fresh.setCoords();
  resetSliderUI();normalizePhotoVisualState();state.canvas.requestRenderAll();snapshot();
  document.dispatchEvent(new CustomEvent('photoia:preset-applied',{detail:{name}}));
  toast(name==='bw'?'Blanco y negro aplicado':'Mejora aplicada desde la foto original');
 }finally{processing(false)}
}
async function executeCommand(raw){
 const t=normalize(raw);
 if(!t)return toast('Escribe una instrucción.');
 const handledBySmart=await window.PhotoSmartCore?.understand?.(raw);
 if(handledBySmart)return true;
 if(window.PhotoSegmentation?.command?.(raw))return true;

 // Nombres internos usados por los botones. Se ejecutan directamente y nunca
 // dependen del intérprete de lenguaje natural.
 const direct={
   professional:()=>applyPreset('professional'),
   profesional:()=>applyPreset('professional'),
   auto:()=>applyPreset('professional'),
   enhance:()=>applyPreset('professional'),
   portrait:()=>applyPreset('portrait'),
   retrato:()=>applyPreset('portrait'),
   vivid:()=>applyPreset('vivid'),
   vibrante:()=>applyPreset('vivid'),
   bw:()=>applyPreset('bw'),
   grayscale:()=>applyPreset('bw')
 };
 if(direct[t])return direct[t]();

 if(/blanco y negro|escala de grises|sin color|monocrom|grayscale|black and white|\bb&w\b|\bbw\b/.test(t))return applyPreset('bw');
 if(/hazla profesional|foto profesional|mejora(r)?|mejor calidad|enhance|auto(matic[oa]?)?/.test(t))return applyPreset('professional');
 if(/retrato|portrait|suaviza.*cara|mejora.*rostro/.test(t))return applyPreset('portrait');
 if(/vibrante|mas color|sube.*color|saturacion|colores vivos|vivid/.test(t))return applyPreset('vivid');
 if(/mas brillo|sube.*brillo|brillante|aclara|mas luz/.test(t)){const v=Math.min(100,Number($('brightness').value)+20);$('brightness').value=v;applySlider('brightness',v,true);return toast('Brillo aumentado')}
 if(/menos brillo|baja.*brillo|oscurece|menos luz/.test(t)){const v=Math.max(-100,Number($('brightness').value)-20);$('brightness').value=v;applySlider('brightness',v,true);return toast('Brillo reducido')}
 if(/mas contraste|sube.*contraste/.test(t)){const v=Math.min(100,Number($('contrast').value)+20);$('contrast').value=v;applySlider('contrast',v,true);return toast('Contraste aumentado')}
 if(/menos contraste|baja.*contraste/.test(t)){const v=Math.max(-100,Number($('contrast').value)-20);$('contrast').value=v;applySlider('contrast',v,true);return toast('Contraste reducido')}
 if(/mas nitidez|enfoca|sharpen/.test(t)){const v=Math.min(100,Number($('sharpness').value)+20);$('sharpness').value=v;applySlider('sharpness',v,true);return toast('Nitidez aumentada')}
 if(/desenfoca|blur/.test(t)){const v=Math.min(20,Number($('blur').value)+5);$('blur').value=v;applySlider('blur',v,true);return toast('Desenfoque aplicado')}
 if(/cuadrad|1:1|recort/.test(t))return openCrop(1);
 if(/gira.*derecha|rotate right/.test(t))return rotate(90);
 if(/gira.*izquierda|rotate left/.test(t))return rotate(-90);
 if(/espejo|mirror|voltea/.test(t))return flip();
 if(/ropa|cabello|pelo|peinado|cara|rostro|cuerpo|fondo|face swap|outfit/.test(t))return toast('Esa función necesita conectar el motor de IA generativa.');
 toast('No entendí esa instrucción todavía. Prueba “hazla profesional”, “más brillo” o “blanco y negro”.')
}
function nextLayerId(){state.layerSeq+=1;return `layer-${Date.now()}-${state.layerSeq}`}
function objectLabel(obj){
 if(obj.layerName)return obj.layerName;
 if(obj.photoRole==='main')return 'Fotografía';
 if(obj.type==='i-text'||obj.type==='text')return 'Texto';
 if(obj.type==='image')return 'Imagen';
 return 'Capa';
}
function objectTypeLabel(obj){
 if(obj.photoRole==='main')return 'Fondo';
 if(obj.layerType==='sticker')return 'Sticker';
 if(obj.type==='i-text'||obj.type==='text')return 'Texto editable';
 if(obj.type==='image')return 'Imagen';
 return obj.type||'Objeto';
}
function layerIcon(obj){
 if(obj.photoRole==='main')return '🖼️';
 if(obj.layerType==='sticker')return '⭐';
 if(obj.type==='i-text'||obj.type==='text')return '🔤';
 if(obj.type==='image')return '📷';
 return '◆';
}
function selectedLayer(){return state.canvas?.getActiveObject()||null}
function layerControlsEnabled(){
 const obj=selectedLayer();
 const usable=!!obj&&obj.photoRole!=='main';
 ['layer-up','layer-down','layer-duplicate','layer-delete'].forEach(id=>$(id).disabled=!usable);
}
function renderLayers(){
 const list=$('layers-list');if(!list||!state.canvas)return;
 const objects=[...state.canvas.getObjects()].reverse();
 $('layer-count').textContent=`${objects.length} ${objects.length===1?'capa':'capas'}`;
 if(!objects.length){list.innerHTML='<p class="layers-empty">Abre una foto para comenzar.</p>';layerControlsEnabled();return}
 const active=selectedLayer();list.innerHTML='';
 objects.forEach(obj=>{
   if(!obj.layerId)obj.layerId=nextLayerId();
   const row=document.createElement('div');row.className='layer-row';
   if(active===obj)row.classList.add('active');if(obj.selectable===false&&obj.photoRole!=='main')row.classList.add('locked');if(obj.visible===false)row.classList.add('hidden-layer');
   row.dataset.layerId=obj.layerId;
   const eye=document.createElement('button');eye.type='button';eye.title=obj.visible===false?'Mostrar capa':'Ocultar capa';eye.textContent=obj.visible===false?'🙈':'👁';
   eye.onclick=e=>{e.stopPropagation();obj.visible=obj.visible===false;state.canvas.requestRenderAll();snapshot()};
   const lock=document.createElement('button');lock.type='button';lock.title=obj.selectable===false?'Desbloquear capa':'Bloquear capa';lock.textContent=obj.photoRole==='main'?'🔒':(obj.selectable===false?'🔒':'🔓');lock.disabled=obj.photoRole==='main';
   lock.onclick=e=>{e.stopPropagation();const willLock=!obj.userLocked;obj.userLocked=willLock;obj.set({selectable:!willLock,evented:!willLock});if(willLock)state.canvas.discardActiveObject();state.canvas.requestRenderAll();snapshot();renderLayers()};
   const main=document.createElement('div');main.className='layer-main';main.innerHTML=`<strong>${escapeHTML(objectLabel(obj))}</strong><small>${escapeHTML(objectTypeLabel(obj))}</small>`;
   main.onclick=()=>{if(obj.photoRole==='main'||obj.userLocked)return toast(obj.photoRole==='main'?'La fotografía base permanece bloqueada.':'Desbloquea la capa para editarla.');window.PhotoIA?.setCanvasMode?.('move',{openPanel:false,announce:false});state.canvas.setActiveObject(obj);state.canvas.requestRenderAll();renderLayers()};
   main.ondblclick=()=>{if(obj.photoRole==='main')return;const name=prompt('Nombre de la capa:',objectLabel(obj));if(name&&name.trim()){obj.layerName=name.trim().slice(0,40);snapshot()}};
   const thumb=document.createElement('div');thumb.className='layer-thumb';thumb.textContent=layerIcon(obj);
   row.append(eye,lock,main,thumb);list.appendChild(row);
 });
 layerControlsEnabled();
}
function moveLayer(direction){const obj=selectedLayer();if(!obj||obj.photoRole==='main')return;direction>0?state.canvas.bringForward(obj):state.canvas.sendBackwards(obj);if(state.photo)state.canvas.sendToBack(state.photo);state.canvas.requestRenderAll();snapshot()}
function duplicateLayer(){const obj=selectedLayer();if(!obj||obj.photoRole==='main')return;obj.clone(clone=>{clone.set({left:(obj.left||0)+18,top:(obj.top||0)+18});clone.layerId=nextLayerId();clone.layerName=`${objectLabel(obj)} copia`;clone.layerType=obj.layerType;state.canvas.add(clone);state.canvas.setActiveObject(clone);state.canvas.requestRenderAll();snapshot()})}
function deleteLayer(){const obj=selectedLayer();if(!obj||obj.photoRole==='main')return;state.canvas.remove(obj);state.canvas.discardActiveObject();state.canvas.requestRenderAll();snapshot();toast('Capa eliminada')}
function escapeHTML(value){return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}

function rotate(deg){
 if(!state.photo)return;
 const cx=state.canvas.width/2,cy=state.canvas.height/2,rad=deg*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad);
 state.canvas.getObjects().filter(o=>o.photoRole!=='preview-overlay').forEach(o=>{
   const x=(Number(o.left)||cx)-cx,y=(Number(o.top)||cy)-cy;
   o.set({left:cx+x*cs-y*sn,top:cy+x*sn+y*cs,angle:(Number(o.angle)||0)+deg});o.setCoords();
 });
 fitCanvas();snapshot();
}
function flip(){if(!state.photo)return;state.photo.set('flipX',!state.photo.flipX);state.canvas.requestRenderAll();snapshot()}
function addText(){const text=new fabric.IText('Tu texto',{left:state.canvas.width/2,top:state.canvas.height/2,originX:'center',originY:'center',fontSize:42,fontWeight:'bold',fill:'#ffffff',stroke:'#111111',strokeWidth:1});text.layerId=nextLayerId();text.layerName='Texto';text.layerType='text';state.canvas.add(text);state.canvas.setActiveObject(text);state.canvas.requestRenderAll();snapshot()}
function addSticker(){const text=new fabric.Text('⭐',{left:state.canvas.width/2,top:state.canvas.height/2,originX:'center',originY:'center',fontSize:72});text.layerId=nextLayerId();text.layerName='Sticker';text.layerType='sticker';state.canvas.add(text);state.canvas.setActiveObject(text);state.canvas.requestRenderAll();snapshot()}
function renderExportDataUrl({photoOnly=false,format=null,quality=null}={}){
 if(!state.photo)return '';
 state.canvas.discardActiveObject();
 const objects=state.canvas.getObjects();
 const hidden=objects.filter(o=>o!==state.photo&&(photoOnly||o.layerType==='vision-detection'||o.layerType==='vision-mask'||o.excludeFromExport===true));
 const visibility=hidden.map(o=>o.visible);hidden.forEach(o=>o.visible=false);state.canvas.requestRenderAll();
 try{
   const rect=state.photo.getBoundingRect(true,true);
   const angle=((state.photo.angle||0)%360+360)%360,swap=angle===90||angle===270;
   const targetW=swap?state.photo.height:state.photo.width,targetH=swap?state.photo.width:state.photo.height;
   const mx=Math.max(.25,Math.min(6,Math.min(targetW/Math.max(1,rect.width),targetH/Math.max(1,rect.height))));
   const mime=format||$('format').value,q=quality??Number($('quality').value)/100;
   return state.canvas.toDataURL({format:mime.split('/')[1],quality:q,multiplier:mx,left:rect.left,top:rect.top,width:rect.width,height:rect.height});
 }finally{hidden.forEach((o,i)=>o.visible=visibility[i]);state.canvas.requestRenderAll()}
}
function exportDataUrl(){return renderExportDataUrl({photoOnly:false})}
function exportPhotoDataUrl(){return renderExportDataUrl({photoOnly:true,format:'image/png',quality:1})}
function download(){const url=exportDataUrl();const a=document.createElement('a');a.href=url;a.download=`PHOTO-IA-${Date.now()}.${$('format').value.split('/')[1].replace('jpeg','jpg')}`;a.click();toast('Imagen preparada para guardar')}
async function compare(showOriginal){
 if(!state.photo)return;
 if(showOriginal){
   if(state.compare)return;state.compare=true;
   state.compareVisibility=state.canvas.getObjects().filter(o=>o!==state.photo).map(o=>[o,o.visible]);
   state.compareVisibility.forEach(([o])=>o.visible=false);
   const base=await fabricImageFromURL(state.originalDataUrl);if(!state.compare)return;
   base.photoRole='preview-overlay';base.layerType='preview';base.selectable=false;base.evented=false;base.objectCaching=false;
   const p=state.photo,displayedW=p.getScaledWidth(),displayedH=p.getScaledHeight();
   base.set({left:p.left,top:p.top,originX:p.originX,originY:p.originY,angle:p.angle,flipX:p.flipX,flipY:p.flipY,scaleX:displayedW/Math.max(1,base.width),scaleY:displayedH/Math.max(1,base.height)});
   state.compareOverlay=base;state.canvas.add(base);state.canvas.bringToFront(base);state.canvas.requestRenderAll();
 }else{
   state.compare=false;if(state.compareOverlay){state.canvas.remove(state.compareOverlay);state.compareOverlay=null}
   (state.compareVisibility||[]).forEach(([o,v])=>o.visible=v);state.compareVisibility=null;state.canvas.requestRenderAll();
 }
}
function reset(){if(!state.originalDataUrl||!state.photo)return;processing(true,'Restableciendo…');applyProcessedImageDataUrl(state.originalDataUrl,true).finally(()=>{processing(false);toast('Fotografía restablecida; tus capas se conservaron')})}

function openCrop(ratio=NaN){if(!state.photo)return;if(!window.Cropper){toast('La herramienta de recorte todavía no está disponible. Revisa la conexión y vuelve a intentar.');return}const editable=state.canvas.getObjects().filter(o=>o!==state.photo&&o.photoRole!=='preview-overlay'&&!o.excludeFromExport);if(editable.length){toast('Recorte protegido: elimina o exporta las capas antes de recortar para no aplanarlas.');return}const modal=$('crop-modal');$('crop-image').src=exportPhotoDataUrl();modal.hidden=false;setTimeout(()=>{state.cropper?.destroy();state.cropper=new Cropper($('crop-image'),{viewMode:1,autoCropArea:1,responsive:true,background:false,aspectRatio:ratio})},50)}
function closeCrop(){state.cropper?.destroy();state.cropper=null;$('crop-modal').hidden=true}
async function applyCrop(){if(!state.cropper)return;processing(true,'Aplicando recorte…');try{const c=state.cropper.getCroppedCanvas({maxWidth:2000,maxHeight:2000,imageSmoothingEnabled:true,imageSmoothingQuality:'high'});const data=state.originalMime==='image/png'?c.toDataURL('image/png'):c.toDataURL('image/jpeg',.96);closeCrop();state.originalDataUrl=data;await setMainImage(data,$('project-title').textContent);toast('Recorte aplicado')}finally{processing(false)}}

let initAttempts=0;
function init(){
 $('crop-modal').hidden=true;
 $('processing').hidden=true;
 document.body.classList.remove('modal-open');
 if(!window.fabric){if(initAttempts++<40){setTimeout(init,200);return}toast('No se pudo cargar el editor de capas. Conéctate una vez a Internet y vuelve a abrir PHOTO IA.');return}
 state.canvas=new fabric.Canvas('editor-canvas',{selection:true,preserveObjectStacking:true});fitCanvas();window.addEventListener('resize',()=>setTimeout(fitCanvas,120));state.canvas.on('selection:created',renderLayers);state.canvas.on('selection:updated',renderLayers);state.canvas.on('selection:cleared',renderLayers);state.canvas.on('object:modified',()=>snapshot());
 let lastCanvasTap=0;
 state.canvas.on('mouse:down',()=>{
   const now=Date.now();
   if(now-lastCanvasTap<340&&state.photo){fitCanvas();toast('Foto ajustada al lienzo');lastCanvasTap=0;return;}
   lastCanvasTap=now;
 });
 $('file-input').addEventListener('change',e=>loadFile(e.target.files[0]));$('camera-input').addEventListener('change',e=>loadFile(e.target.files[0]));
 sliders.forEach(id=>{$(id).addEventListener('input',e=>applySlider(id,e.target.value,false));$(id).addEventListener('change',()=>snapshot())});
 document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>{const command=b.dataset.command;const presetMap={professional:'professional',portrait:'portrait',vivid:'vivid',bw:'bw'};if(presetMap[command])applyPreset(presetMap[command]);else executeCommand(command)});
 const dispatchCommand=raw=>window.PhotoBrain?.execute?window.PhotoBrain.execute(raw):executeCommand(raw);
 $('command-btn').onclick=()=>dispatchCommand($('command-input').value);$('command-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();dispatchCommand(e.target.value)}});
 $('rotate-left').onclick=()=>rotate(-90);$('rotate-right').onclick=()=>rotate(90);$('flip-x').onclick=flip;$('crop-btn').onclick=()=>openCrop(NaN);$('add-text').onclick=addText;$('add-sticker').onclick=addSticker;$('layer-up').onclick=()=>moveLayer(1);$('layer-down').onclick=()=>moveLayer(-1);$('layer-duplicate').onclick=duplicateLayer;$('layer-delete').onclick=deleteLayer;
 $('undo-btn').onclick=undo;$('redo-btn').onclick=redo;$('download-btn').onclick=download;$('reset-btn').onclick=reset;$('new-photo-btn').onclick=clearCurrentPhoto;
 $('compare-btn').addEventListener('pointerdown',()=>compare(true));['pointerup','pointerleave','pointercancel'].forEach(ev=>$('compare-btn').addEventListener(ev,()=>compare(false)));
 $('crop-close').onclick=closeCrop;$('crop-apply').onclick=applyCrop;document.querySelectorAll('[data-ratio]').forEach(b=>b.onclick=()=>state.cropper?.setAspectRatio(Number(b.dataset.ratio)));
 $('theme-btn').onclick=()=>{document.documentElement.classList.toggle('dark');localStorage.setItem('photoIATheme',document.documentElement.classList.contains('dark')?'dark':'light')};if(localStorage.getItem('photoIATheme')==='dark')document.documentElement.classList.add('dark');
 document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files?.[0];if(f)loadFile(f)});
 if('serviceWorker' in navigator && window.isSecureContext){navigator.serviceWorker.register('./sw.js?v='+VERSION,{updateViaCache:'none'}).then(r=>r.update()).catch(console.warn);}
 window.dispatchEvent(new CustomEvent('photoia-ready'));
}
window.addEventListener('opencv-script-loaded',()=>{const wait=()=>{if(window.cv&&cv.Mat){state.cvReady=true;$('engine-badge').textContent='Fabric + OpenCV listo';$('engine-badge').classList.add('ready')}else setTimeout(wait,250)};wait()});

window.PhotoIA={
  get state(){return state},
  snapshot,toast,processing,nextLayerId,renderLayers,fitCanvas,fitPhoto,restoreJSON,restoreHistoryIndex,undo,redo,reset,download,
  setEnabled,selectedLayer,layerControlsEnabled,applyPreset,applySlider,applyAdaptiveAdjustments,applySmartPixelRecipe,applyProcessedImageDataUrl,normalizePhotoVisualState,clearCurrentPhoto,rotate,flip,openCrop,addText,exportDataUrl,exportPhotoDataUrl,getPhotoAnalysisCanvas,getOriginalAnalysisCanvas,setMainImage,loadFile,executeLegacyCommand:executeCommand
};
document.addEventListener('DOMContentLoaded',init);
})();
