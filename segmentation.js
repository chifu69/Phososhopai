(() => {
'use strict';
const VERSION='1.2.0';
const $=id=>document.getElementById(id);
const api=()=>window.PhotoIA;
const TASKS_VERSION='0.10.35';
const MEDIAPIPE_ESM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/+esm`;
const MEDIAPIPE_WASM=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const PERSON_MODEL='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const INTERACTIVE_MODEL='https://storage.googleapis.com/mediapipe-tasks/interactive_segmenter/ptm_512_hdt_ptm_woid.tflite';
const PERSON_CLASS_ID=1;
const LOAD_TIMEOUT=25000;
const RUN_TIMEOUT=45000;
const state={
  module:null,fileset:null,imageSegmenter:null,interactiveSegmenter:null,
  modulePromise:null,loading:false,mask:null,maskKind:'',maskOverlay:null,
  tapMode:false,workCanvas:null,operation:null,operationId:0
};

function setStatus(text,kind=''){
  const el=$('segment-status'); if(!el)return;
  el.textContent=text; el.className=`segment-status ${kind}`.trim();
}
function updateUI(){
  const ready=!!api()?.state?.photo;
  ['segment-person','segment-tap','segment-show','segment-hide','segment-clear','segment-cutout'].forEach(id=>{
    const el=$(id); if(!el)return;
    if(id==='segment-person'||id==='segment-tap')el.disabled=!ready||state.loading;
    else el.disabled=!state.mask||state.loading;
  });
  const cancel=$('segment-cancel'); if(cancel)cancel.disabled=!state.loading;
  const overlayCancel=$('processing-cancel'); if(overlayCancel)overlayCancel.hidden=!state.loading;
  const badge=$('segment-badge');
  if(badge)badge.textContent=state.loading?'Procesando…':state.mask?'Máscara lista':state.tapMode?'Toca la foto':'Sin máscara';
}
function makeError(message,code='SEGMENTATION_ERROR'){
  const err=new Error(message); err.code=code; return err;
}
function timeout(promise,ms,message,operation){
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(makeError(message,'TIMEOUT')),ms)})
  ]).finally(()=>clearTimeout(timer)).then(value=>{
    if(operation?.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    return value;
  });
}
function beginOperation(label){
  cancelCurrent(false);
  const operation={id:++state.operationId,cancelled:false,label};
  state.operation=operation; state.loading=true; updateUI();
  api()?.processing(true,label);
  return operation;
}
function finishOperation(operation){
  if(state.operation!==operation)return;
  state.operation=null;
  state.loading=false; api()?.processing(false); updateUI();
}
function cancelCurrent(showMessage=true){
  if(state.operation)state.operation.cancelled=true;
  state.operation=null; state.loading=false; state.tapMode=false;
  api()?.processing(false); updateUI();
  setStatus(showMessage?'Proceso cancelado.':'Listo para segmentar.',showMessage?'error':'');
  if(showMessage)api()?.toast('Segmentación cancelada');
}
function friendlyError(err){
  if(err?.code==='CANCELLED')return 'Proceso cancelado.';
  if(err?.code==='TIMEOUT')return err.message;
  const text=String(err?.message||err||'').toLowerCase();
  if(text.includes('fetch')||text.includes('network')||text.includes('failed to load'))return 'No se pudo descargar el modelo. Revisa internet e inténtalo otra vez.';
  if(text.includes('memory')||text.includes('out of bounds'))return 'El teléfono se quedó sin memoria. Prueba con una foto más pequeña.';
  if(text.includes('webgl')||text.includes('gpu'))return 'La aceleración gráfica falló. PHOTO IA intentará usar CPU al volver a probar.';
  return err?.message||'No pude completar la segmentación.';
}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(makeError('No pude leer la fotografía.'));img.src=src;});}
async function getWorkCanvas(operation){
  const photo=api()?.state?.photo;if(!photo)throw makeError('Abre una foto primero.');
  const img=await timeout(loadImage(api().state.originalDataUrl),8000,'La fotografía tardó demasiado en abrirse.',operation);
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  const max=isIOS?384:512;
  const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true,alpha:false});
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  state.workCanvas=canvas; return canvas;
}
async function loadModule(operation){
  if(state.module&&state.fileset)return state.module;
  if(!state.modulePromise){
    state.modulePromise=(async()=>{
      setStatus('Descargando motor de segmentación…','loading');
      const mod=await import(MEDIAPIPE_ESM);
      const fileset=await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      state.module=mod;state.fileset=fileset;return mod;
    })().catch(err=>{state.modulePromise=null;state.module=null;state.fileset=null;throw err;});
  }
  return timeout(state.modulePromise,LOAD_TIMEOUT,'El motor tardó demasiado en descargar. Revisa internet y vuelve a intentar.',operation);
}
async function createWithFallback(factory,operation,label){
  setStatus(label,'loading');
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  // En iPhone/iPad el delegate GPU puede quedarse bloqueado dentro de WebGL.
  // CPU es más estable y con los modelos reducidos termina en pocos segundos.
  if(isIOS){
    setStatus(`${label} Usando modo compatible con iPhone…`,'loading');
    return timeout(factory('CPU'),LOAD_TIMEOUT,'No se pudo iniciar el modelo en modo compatible.',operation);
  }
  try{
    return await timeout(factory('GPU'),LOAD_TIMEOUT,'El modelo tardó demasiado en iniciar.',operation);
  }catch(gpuErr){
    if(operation.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    console.warn('GPU unavailable, retrying on CPU',gpuErr);
    setStatus('La GPU no respondió. Reintentando con CPU…','loading');
    return timeout(factory('CPU'),LOAD_TIMEOUT,'No se pudo iniciar el modelo ni con GPU ni con CPU.',operation);
  }
}
async function ensurePersonSegmenter(operation){
  await loadModule(operation);if(state.imageSegmenter)return state.imageSegmenter;
  state.imageSegmenter=await createWithFallback(delegate=>state.module.ImageSegmenter.createFromOptions(state.fileset,{
    baseOptions:{modelAssetPath:PERSON_MODEL,delegate},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false
  }),operation,'Preparando segmentación de persona…');
  return state.imageSegmenter;
}
async function ensureInteractiveSegmenter(operation){
  await loadModule(operation);if(state.interactiveSegmenter)return state.interactiveSegmenter;
  state.interactiveSegmenter=await createWithFallback(delegate=>state.module.InteractiveSegmenter.createFromOptions(state.fileset,{
    baseOptions:{modelAssetPath:INTERACTIVE_MODEL,delegate},outputCategoryMask:false,outputConfidenceMasks:true
  }),operation,'Preparando selección inteligente…');
  return state.interactiveSegmenter;
}
async function letOverlayPaint(){
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,35)));
}
async function runTask(start,operation){
  if(operation?.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
  await letOverlayPaint();
  // MediaPipe puede devolver el resultado directamente. En Safari/Chrome móvil,
  // la variante con callback puede no llamar nunca al callback y dejar la app cargando.
  const result=await timeout(Promise.resolve().then(start),RUN_TIMEOUT,
    'El análisis tardó demasiado. Intenta otra vez o usa una foto más pequeña.',operation);
  if(operation?.cancelled){closeResult(result);throw makeError('Proceso cancelado.','CANCELLED');}
  return result;
}
function closeResult(result){
  try{result?.categoryMask?.close?.();}catch(_){ }
  try{result?.confidenceMasks?.forEach(m=>m.close?.());}catch(_){ }
}
async function segmentPerson(){
  if(!api()?.state?.photo)return api()?.toast('Abre una foto primero.');
  const operation=beginOperation('Separando a la persona…');
  setStatus('Preparando una copia optimizada de la foto…','loading');
  let result;
  try{
    const work=await getWorkCanvas(operation);
    const segmenter=await ensurePersonSegmenter(operation);
    setStatus('Analizando píxel por píxel…','loading');
    result=await runTask(()=>segmenter.segment(work),operation);
    const maskObj=result.categoryMask;if(!maskObj)throw makeError('El modelo no devolvió una máscara.');
    const values=maskObj.getAsUint8Array();const mask=new Uint8Array(values.length);let selected=0;
    for(let i=0;i<values.length;i++){if(values[i]===PERSON_CLASS_ID){mask[i]=255;selected++;}}
    if(selected<100)throw makeError('No encontré una persona claramente. Prueba “Tocar objeto”.');
    await setMask(mask,maskObj.width||work.width,maskObj.height||work.height,'Persona');
    setStatus('Persona segmentada. Ya puedes quitar el fondo.','ready');api().toast('Máscara de persona lista');
  }catch(err){
    const msg=friendlyError(err);console.error(err);setStatus(msg,'error');if(err?.code!=='CANCELLED')api().toast(msg);
  }finally{closeResult(result);finishOperation(operation);}
}
function canvasPointToNormalized(pointer){
  const photo=api().state.photo;const bounds=photo.getBoundingRect(true,true);
  const x=(pointer.x-bounds.left)/bounds.width,y=(pointer.y-bounds.top)/bounds.height;
  return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),inside:x>=0&&x<=1&&y>=0&&y<=1};
}
async function segmentAtPoint(x,y){
  const operation=beginOperation('Creando selección inteligente…');
  setStatus('Preparando una copia optimizada de la foto…','loading');
  let result;
  try{
    const work=await getWorkCanvas(operation);
    const segmenter=await ensureInteractiveSegmenter(operation);
    setStatus('Buscando los bordes del objeto…','loading');
    result=await runTask(()=>segmenter.segment(work,{keypoint:{x,y}}),operation);
    const maskObj=result.confidenceMasks?.[0];if(!maskObj)throw makeError('El modelo no devolvió una selección.');
    const values=maskObj.getAsFloat32Array();const mask=new Uint8Array(values.length);let selected=0;
    for(let i=0;i<values.length;i++){const v=values[i];if(v>=0.48){mask[i]=Math.min(255,Math.round(v*255));selected++;}}
    if(selected<80)throw makeError('No pude separar ese objeto. Toca más cerca del centro.');
    await setMask(mask,maskObj.width||work.width,maskObj.height||work.height,'Objeto');
    setStatus('Objeto seleccionado con máscara.','ready');api().toast('Selección inteligente lista');
  }catch(err){const msg=friendlyError(err);console.error(err);setStatus(msg,'error');if(err?.code!=='CANCELLED')api().toast(msg);}
  finally{closeResult(result);finishOperation(operation);}
}
function beginTapMode(){if(!api()?.state?.photo)return api()?.toast('Abre una foto primero.');if(state.loading)return;state.tapMode=true;setStatus('Toca el objeto que quieres seleccionar.','ready');updateUI();api().toast('Ahora toca el objeto en la foto');}
async function handleCanvasTap(opt){if(!state.tapMode||state.loading)return;const p=api().state.canvas.getPointer(opt.e);const norm=canvasPointToNormalized(p);if(!norm.inside){api().toast('Toca dentro de la fotografía.');return;}state.tapMode=false;updateUI();await segmentAtPoint(norm.x,norm.y);}
function maskCanvas(mask,width,height,mode='overlay'){
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');const img=ctx.createImageData(width,height);
  for(let i=0;i<mask.length;i++){const a=mask[i],j=i*4;if(mode==='overlay'){img.data[j]=0;img.data[j+1]=210;img.data[j+2]=255;img.data[j+3]=Math.round(a*.55);}else{img.data[j]=255;img.data[j+1]=255;img.data[j+2]=255;img.data[j+3]=a;}}
  ctx.putImageData(img,0,0);return c;
}
function removeMaskOverlay(){const canvas=api()?.state?.canvas;if(!canvas)return;canvas.getObjects().filter(o=>o.layerType==='vision-mask').forEach(o=>canvas.remove(o));state.maskOverlay=null;canvas.requestRenderAll();api().renderLayers?.();}
async function setMask(mask,width,height,label){
  removeMaskOverlay();state.mask={data:mask,width,height,label};state.maskKind=label;
  const url=maskCanvas(mask,width,height,'overlay').toDataURL('image/png');
  await new Promise((resolve,reject)=>fabric.Image.fromURL(url,img=>{
    if(!img)return reject(makeError('No pude mostrar la máscara.'));const photo=api().state.photo;
    img.set({left:photo.left,top:photo.top,originX:'center',originY:'center',angle:photo.angle||0,flipX:!!photo.flipX,scaleX:photo.getScaledWidth()/width,scaleY:photo.getScaledHeight()/height,selectable:false,evented:false,excludeFromExport:true,opacity:.9});
    img.layerId=`mask-${Date.now()}`;img.layerName=`Máscara: ${label}`;img.layerType='vision-mask';api().state.canvas.add(img);api().state.canvas.bringToFront(img);state.maskOverlay=img;api().state.canvas.requestRenderAll();api().renderLayers?.();resolve();
  },{crossOrigin:'anonymous'}));updateUI();
}
function showMask(show=true){if(!state.maskOverlay)return;state.maskOverlay.visible=show;api().state.canvas.requestRenderAll();setStatus(show?'Máscara visible':'Máscara oculta',show?'ready':'');}
function clearMask(){removeMaskOverlay();state.mask=null;state.maskKind='';state.tapMode=false;setStatus('Sin máscara');updateUI();}
async function createCutout(){
  if(!state.mask||!state.workCanvas)return api()?.toast('Primero crea una máscara.');
  const operation=beginOperation('Quitando el fondo…');
  try{
    const {data,width,height}=state.mask,src=state.workCanvas,out=document.createElement('canvas');out.width=width;out.height=height;
    const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height);
    for(let i=0;i<data.length;i++){if(operation.cancelled)throw makeError('Proceso cancelado.','CANCELLED');pixels.data[i*4+3]=data[i]>=110?data[i]:0;}
    ctx.putImageData(pixels,0,0);const url=out.toDataURL('image/png');
    await new Promise((resolve,reject)=>fabric.Image.fromURL(url,img=>{
      if(!img)return reject(makeError('No pude crear el recorte.'));const photo=api().state.photo;
      img.set({left:photo.left,top:photo.top,originX:'center',originY:'center',angle:photo.angle||0,flipX:!!photo.flipX,scaleX:photo.getScaledWidth()/width,scaleY:photo.getScaledHeight()/height,selectable:true,evented:true});
      img.layerId=api().nextLayerId();img.layerName=`${state.maskKind||'Objeto'} sin fondo`;img.layerType='segmented-cutout';photo.visible=false;removeMaskOverlay();api().state.canvas.add(img);api().state.canvas.setActiveObject(img);api().state.canvas.requestRenderAll();api().snapshot();api().renderLayers?.();resolve();
    },{crossOrigin:'anonymous'}));
    setStatus('Fondo eliminado. La selección es una nueva capa.','ready');api().toast('Fondo eliminado');
  }catch(err){const msg=friendlyError(err);console.error(err);setStatus(msg,'error');if(err?.code!=='CANCELLED')api().toast(msg);}
  finally{finishOperation(operation);}
}
function command(raw){const t=String(raw||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/segmenta.*persona|selecciona.*persona completa|separa.*persona/.test(t)){segmentPerson();return true;}if(/seleccion inteligente|toca.*objeto|segmenta.*objeto/.test(t)){beginTapMode();return true;}if(/quita.*fondo|elimina.*fondo|fondo transparente/.test(t)){if(state.mask)createCutout();else segmentPerson().then(()=>state.mask&&createCutout());return true;}if(/muestra.*mascara/.test(t)){showMask(true);return true;}if(/oculta.*mascara/.test(t)){showMask(false);return true;}if(/limpia.*mascara|borra.*mascara/.test(t)){clearMask();return true;}if(/cancela.*segment|deten.*segment/.test(t)){cancelCurrent();return true;}return false;}
function boot(){
  if(!$('segment-person'))return;
  $('segment-person').onclick=segmentPerson;$('segment-tap').onclick=beginTapMode;$('segment-show').onclick=()=>showMask(true);$('segment-hide').onclick=()=>showMask(false);$('segment-clear').onclick=clearMask;$('segment-cutout').onclick=createCutout;
  if($('segment-cancel'))$('segment-cancel').onclick=()=>cancelCurrent(true);
  if($('processing-cancel'))$('processing-cancel').onclick=()=>cancelCurrent(true);
  api().state.canvas.on('mouse:down',handleCanvasTap);api().state.canvas.on('object:added',e=>{if(e.target?.photoRole==='main')clearMask();});
  updateUI();setStatus('La primera segmentación descarga el modelo. Puede tardar hasta 25 segundos.');
  if(window.PhotoBrain?.register)window.PhotoBrain.register({name:'segmentation',score:t=>/segmenta|seleccion inteligente|toca.*objeto|quita.*fondo|elimina.*fondo|mascara|cancela.*segment/.test(t)?220:0,run:t=>command(t)});
}
window.PhotoSegmentation={version:VERSION,segmentPerson,beginTapMode,createCutout,clearMask,showMask,cancel:()=>cancelCurrent(true),command,get mask(){return state.mask}};
let started=false;function safeBoot(){if(started)return;if(window.PhotoIA?.state?.canvas){started=true;boot();}else setTimeout(safeBoot,120)}
window.addEventListener('photoia-ready',safeBoot,{once:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',safeBoot,{once:true});else safeBoot();
})();
