(() => {
'use strict';
const VERSION='1.0.0';
const $=id=>document.getElementById(id);
const api=()=>window.PhotoIA;
const state={
  module:null,fileset:null,imageSegmenter:null,interactiveSegmenter:null,loading:false,
  mask:null,maskKind:'',maskOverlay:null,tapMode:false,workCanvas:null
};
const MEDIAPIPE_ESM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm';
const MEDIAPIPE_WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const PERSON_MODEL='https://storage.googleapis.com/mediapipe-assets/deeplabv3.tflite?generation=1661875711618421';
const INTERACTIVE_MODEL='https://storage.googleapis.com/mediapipe-tasks/interactive_segmenter/ptm_512_hdt_ptm_woid.tflite';
const PERSON_CLASS_ID=15; // DeepLab/PASCAL VOC person category.

function setStatus(text,kind=''){
  const el=$('segment-status'); if(!el)return;
  el.textContent=text; el.className=`segment-status ${kind}`.trim();
}
function updateUI(){
  const ready=!!api()?.state?.photo;
  ['segment-person','segment-tap','segment-show','segment-hide','segment-clear','segment-cutout'].forEach(id=>{
    const el=$(id); if(!el)return;
    if(id==='segment-person'||id==='segment-tap')el.disabled=!ready||state.loading;
    else el.disabled=!state.mask;
  });
  const badge=$('segment-badge');
  if(badge)badge.textContent=state.mask?'Máscara lista':state.tapMode?'Toca la foto':'Sin máscara';
}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No pude leer la fotografía.'));img.src=src;});}
async function getWorkCanvas(){
  const photo=api()?.state?.photo;
  if(!photo)throw new Error('Abre una foto primero.');
  const img=await loadImage(api().state.originalDataUrl);
  const max=720,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,canvas.width,canvas.height);
  state.workCanvas=canvas;
  return canvas;
}
async function loadModule(){
  if(state.module)return state.module;
  if(state.loading){while(state.loading)await new Promise(r=>setTimeout(r,100));if(state.module)return state.module;}
  state.loading=true; updateUI(); setStatus('Cargando motor de segmentación…','loading');
  try{
    state.module=await import(MEDIAPIPE_ESM);
    state.fileset=await state.module.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    return state.module;
  }catch(err){
    console.error(err); throw new Error('No pude cargar MediaPipe. Revisa tu conexión.');
  }finally{state.loading=false;updateUI();}
}
async function ensurePersonSegmenter(){
  await loadModule();
  if(state.imageSegmenter)return state.imageSegmenter;
  setStatus('Preparando segmentación de persona…','loading');
  state.imageSegmenter=await state.module.ImageSegmenter.createFromOptions(state.fileset,{
    baseOptions:{modelAssetPath:PERSON_MODEL,delegate:'GPU'},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false
  }).catch(async()=>state.module.ImageSegmenter.createFromOptions(state.fileset,{
    baseOptions:{modelAssetPath:PERSON_MODEL,delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false
  }));
  return state.imageSegmenter;
}
async function ensureInteractiveSegmenter(){
  await loadModule();
  if(state.interactiveSegmenter)return state.interactiveSegmenter;
  setStatus('Preparando selección inteligente…','loading');
  state.interactiveSegmenter=await state.module.InteractiveSegmenter.createFromOptions(state.fileset,{
    baseOptions:{modelAssetPath:INTERACTIVE_MODEL,delegate:'GPU'},outputCategoryMask:false,outputConfidenceMasks:true
  }).catch(async()=>state.module.InteractiveSegmenter.createFromOptions(state.fileset,{
    baseOptions:{modelAssetPath:INTERACTIVE_MODEL,delegate:'CPU'},outputCategoryMask:false,outputConfidenceMasks:true
  }));
  return state.interactiveSegmenter;
}
function resultPromise(run){return new Promise((resolve,reject)=>{try{run(resolve);}catch(err){reject(err);}});}
function closeResult(result){
  try{result?.categoryMask?.close?.();}catch(_){ }
  try{result?.confidenceMasks?.forEach(m=>m.close?.());}catch(_){ }
}
async function segmentPerson(){
  if(!api()?.state?.photo)return api()?.toast('Abre una foto primero.');
  api().processing(true,'Separando a la persona…'); setStatus('Analizando píxel por píxel…','loading');
  try{
    const [segmenter,work]=await Promise.all([ensurePersonSegmenter(),getWorkCanvas()]);
    const result=await resultPromise(done=>segmenter.segment(work,done));
    const maskObj=result.categoryMask;
    if(!maskObj)throw new Error('El modelo no devolvió una máscara.');
    const values=maskObj.getAsUint8Array();
    const mask=new Uint8Array(values.length);
    let selected=0;
    for(let i=0;i<values.length;i++){if(values[i]===PERSON_CLASS_ID){mask[i]=255;selected++;}}
    closeResult(result);
    if(selected<100)throw new Error('No encontré una persona claramente. Prueba “Tocar objeto”.');
    await setMask(mask,work.width,work.height,'Persona');
    setStatus('Persona segmentada. Puedes quitar el fondo.','ready');
    api().toast('Máscara de persona lista');
  }catch(err){console.error(err);setStatus(err.message||'No pude segmentar la persona.','error');api().toast(err.message||'Error de segmentación');}
  finally{api().processing(false);updateUI();}
}
function canvasPointToNormalized(pointer){
  const photo=api().state.photo;
  const bounds=photo.getBoundingRect(true,true);
  const x=(pointer.x-bounds.left)/bounds.width;
  const y=(pointer.y-bounds.top)/bounds.height;
  return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),inside:x>=0&&x<=1&&y>=0&&y<=1};
}
async function segmentAtPoint(x,y){
  api().processing(true,'Creando selección inteligente…');setStatus('Buscando los bordes del objeto…','loading');
  try{
    const [segmenter,work]=await Promise.all([ensureInteractiveSegmenter(),getWorkCanvas()]);
    const result=await resultPromise(done=>segmenter.segment(work,{keypoint:{x,y}},done));
    const maskObj=result.confidenceMasks?.[0];
    if(!maskObj)throw new Error('El modelo no devolvió una selección.');
    const values=maskObj.getAsFloat32Array();
    const mask=new Uint8Array(values.length);let selected=0;
    for(let i=0;i<values.length;i++){const v=values[i];if(v>=0.48){mask[i]=Math.min(255,Math.round(v*255));selected++;}}
    closeResult(result);
    if(selected<80)throw new Error('No pude separar ese objeto. Toca más cerca del centro.');
    await setMask(mask,work.width,work.height,'Objeto');
    setStatus('Objeto seleccionado con máscara.','ready');api().toast('Selección inteligente lista');
  }catch(err){console.error(err);setStatus(err.message||'No pude crear la selección.','error');api().toast(err.message||'Error de selección');}
  finally{api().processing(false);updateUI();}
}
function beginTapMode(){
  if(!api()?.state?.photo)return api()?.toast('Abre una foto primero.');
  state.tapMode=true;setStatus('Toca el objeto que quieres seleccionar.','ready');updateUI();
  api().toast('Ahora toca el objeto en la foto');
}
async function handleCanvasTap(opt){
  if(!state.tapMode)return;
  const p=api().state.canvas.getPointer(opt.e);
  const norm=canvasPointToNormalized(p);
  if(!norm.inside){api().toast('Toca dentro de la fotografía.');return;}
  state.tapMode=false;updateUI();
  await segmentAtPoint(norm.x,norm.y);
}
function maskCanvas(mask,width,height,mode='overlay'){
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d');const img=ctx.createImageData(width,height);
  for(let i=0;i<mask.length;i++){
    const a=mask[i];const j=i*4;
    if(mode==='overlay'){img.data[j]=0;img.data[j+1]=210;img.data[j+2]=255;img.data[j+3]=Math.round(a*.55);}
    else{img.data[j]=255;img.data[j+1]=255;img.data[j+2]=255;img.data[j+3]=a;}
  }
  ctx.putImageData(img,0,0);return c;
}
function removeMaskOverlay(){
  const canvas=api()?.state?.canvas;if(!canvas)return;
  canvas.getObjects().filter(o=>o.layerType==='vision-mask').forEach(o=>canvas.remove(o));
  state.maskOverlay=null;canvas.requestRenderAll();api().renderLayers?.();
}
async function setMask(mask,width,height,label){
  removeMaskOverlay();state.mask={data:mask,width,height,label};state.maskKind=label;
  const url=maskCanvas(mask,width,height,'overlay').toDataURL('image/png');
  await new Promise((resolve,reject)=>fabric.Image.fromURL(url,img=>{
    if(!img)return reject(new Error('No pude mostrar la máscara.'));
    const photo=api().state.photo;
    img.set({left:photo.left,top:photo.top,originX:'center',originY:'center',angle:photo.angle||0,flipX:!!photo.flipX,
      scaleX:photo.getScaledWidth()/width,scaleY:photo.getScaledHeight()/height,selectable:false,evented:false,excludeFromExport:true,opacity:.9});
    img.layerId=`mask-${Date.now()}`;img.layerName=`Máscara: ${label}`;img.layerType='vision-mask';
    api().state.canvas.add(img);api().state.canvas.bringToFront(img);state.maskOverlay=img;api().state.canvas.requestRenderAll();api().renderLayers?.();resolve();
  },{crossOrigin:'anonymous'}));
  updateUI();
}
function showMask(show=true){if(!state.maskOverlay)return;state.maskOverlay.visible=show;api().state.canvas.requestRenderAll();setStatus(show?'Máscara visible':'Máscara oculta',show?'ready':'');}
function clearMask(){removeMaskOverlay();state.mask=null;state.maskKind='';state.tapMode=false;setStatus('Sin máscara');updateUI();}
async function createCutout(){
  if(!state.mask||!state.workCanvas)return api()?.toast('Primero crea una máscara.');
  api().processing(true,'Quitando el fondo…');
  try{
    const {data,width,height}=state.mask;const src=state.workCanvas;const out=document.createElement('canvas');out.width=width;out.height=height;
    const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height);
    for(let i=0;i<data.length;i++)pixels.data[i*4+3]=data[i]>=110?data[i]:0;
    ctx.putImageData(pixels,0,0);
    const url=out.toDataURL('image/png');
    await new Promise((resolve,reject)=>fabric.Image.fromURL(url,img=>{
      if(!img)return reject(new Error('No pude crear el recorte.'));
      const photo=api().state.photo;
      img.set({left:photo.left,top:photo.top,originX:'center',originY:'center',angle:photo.angle||0,flipX:!!photo.flipX,
        scaleX:photo.getScaledWidth()/width,scaleY:photo.getScaledHeight()/height,selectable:true,evented:true});
      img.layerId=api().nextLayerId();img.layerName=`${state.maskKind||'Objeto'} sin fondo`;img.layerType='segmented-cutout';
      photo.visible=false;removeMaskOverlay();api().state.canvas.add(img);api().state.canvas.setActiveObject(img);api().state.canvas.requestRenderAll();api().snapshot();api().renderLayers?.();resolve();
    },{crossOrigin:'anonymous'}));
    setStatus('Fondo eliminado. La selección es una nueva capa.','ready');api().toast('Fondo eliminado');
  }catch(err){console.error(err);setStatus(err.message||'No pude quitar el fondo.','error');api().toast('No pude quitar el fondo');}
  finally{api().processing(false);updateUI();}
}
function command(raw){
  const t=String(raw||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/segmenta.*persona|selecciona.*persona completa|separa.*persona/.test(t)){segmentPerson();return true;}
  if(/seleccion inteligente|toca.*objeto|segmenta.*objeto/.test(t)){beginTapMode();return true;}
  if(/quita.*fondo|elimina.*fondo|fondo transparente/.test(t)){if(state.mask)createCutout();else segmentPerson().then(()=>state.mask&&createCutout());return true;}
  if(/muestra.*mascara/.test(t)){showMask(true);return true;}
  if(/oculta.*mascara/.test(t)){showMask(false);return true;}
  if(/limpia.*mascara|borra.*mascara/.test(t)){clearMask();return true;}
  return false;
}
function boot(){
  if(!$('segment-person'))return;
  $('segment-person').onclick=segmentPerson;$('segment-tap').onclick=beginTapMode;$('segment-show').onclick=()=>showMask(true);
  $('segment-hide').onclick=()=>showMask(false);$('segment-clear').onclick=clearMask;$('segment-cutout').onclick=createCutout;
  api().state.canvas.on('mouse:down',handleCanvasTap);
  api().state.canvas.on('object:added',e=>{if(e.target?.photoRole==='main')clearMask();});
  updateUI();setStatus('La primera segmentación descarga el modelo.');
  if(window.PhotoBrain?.register)window.PhotoBrain.register({name:'segmentation',score:t=>/segmenta|seleccion inteligente|toca.*objeto|quita.*fondo|elimina.*fondo|mascara/.test(t)?220:0,run:t=>command(t)});
}
window.PhotoSegmentation={version:VERSION,segmentPerson,beginTapMode,createCutout,clearMask,showMask,command,get mask(){return state.mask}};
let started=false;function safeBoot(){if(started)return;if(window.PhotoIA?.state?.canvas){started=true;boot();}else setTimeout(safeBoot,120)}
window.addEventListener('photoia-ready',safeBoot,{once:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',safeBoot,{once:true});else safeBoot();
})();
