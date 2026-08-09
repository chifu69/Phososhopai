(() => {
'use strict';
const VERSION='2.1-selection-ia-fix';
const $=id=>document.getElementById(id);
const api=()=>window.PhotoIA;
const TASKS_VERSION='0.10.35';
const MEDIAPIPE_ESM='./assets/mediapipe/tasks-vision.esm.js';
const MEDIAPIPE_WASM='./assets/mediapipe/wasm';
const PERSON_MODEL='./assets/models/selfie_segmenter_landscape.tflite';
const INTERACTIVE_MODEL='./assets/models/interactive_segmenter.tflite';
const PERSON_CLASS_ID=1;
const LOAD_TIMEOUT=30000;
const RUN_TIMEOUT=45000;
const state={
  module:null,fileset:null,imageSegmenter:null,interactiveSegmenter:null,
  modulePromise:null,loading:false,mask:null,maskKind:'',maskOverlay:null,
  tapMode:false,workCanvas:null,operation:null,operationId:0,personModelBuffer:null,interactiveModelBuffer:null,bodyPixNet:null,bodyPixPromise:null
};

const DEBUG_KEY='photoia-segmentation-debug-v830';

// PHOTO IA 8.3 uses a dependency-free local portrait cutout engine.
// It avoids CDN failures and never downloads BodyPix or a model at runtime.
function colorDistance(r1,g1,b1,r2,g2,b2){
  const dr=r1-r2,dg=g1-g2,db=b1-b2;
  return Math.sqrt(dr*dr+dg*dg+db*db);
}
function sampleBorderPalette(rgba,w,h){
  const samples=[];
  const step=Math.max(2,Math.floor(Math.min(w,h)/48));
  const push=(x,y)=>{const i=(y*w+x)*4;samples.push([rgba[i],rgba[i+1],rgba[i+2]]);};
  for(let x=0;x<w;x+=step){push(x,0);push(x,h-1)}
  for(let y=0;y<h;y+=step){push(0,y);push(w-1,y)}
  // Compact the edge colors into a small palette so gradients remain supported.
  const palette=[];
  for(const c of samples){
    let best=-1,bestD=1e9;
    for(let i=0;i<palette.length;i++){
      const p=palette[i],d=colorDistance(c[0],c[1],c[2],p.r,p.g,p.b);
      if(d<bestD){bestD=d;best=i}
    }
    if(best<0||bestD>42){
      if(palette.length<18)palette.push({r:c[0],g:c[1],b:c[2],n:1});
    }else{
      const p=palette[best],n=p.n+1;
      p.r=(p.r*p.n+c[0])/n;p.g=(p.g*p.n+c[1])/n;p.b=(p.b*p.n+c[2])/n;p.n=n;
    }
  }
  return palette;
}
function nearestPaletteDistance(r,g,b,palette){
  let best=442;
  for(const p of palette){const d=colorDistance(r,g,b,p.r,p.g,p.b);if(d<best)best=d;}
  return best;
}
function blurMask(mask,w,h,passes=2){
  let src=mask;
  for(let pass=0;pass<passes;pass++){
    const out=new Uint8Array(src.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let sum=0,weight=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;
        const ww=(dx===0&&dy===0)?4:(dx===0||dy===0?2:1);sum+=src[yy*w+xx]*ww;weight+=ww;
      }
      out[y*w+x]=Math.round(sum/weight);
    }
    src=out;
  }
  return src;
}
function largestCenterComponent(mask,w,h){
  const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let best=[];
  const cx=w/2,cy=h*.48;
  for(let i=0;i<mask.length;i++){
    if(seen[i]||mask[i]<110)continue;
    let head=0,tail=0;queue[tail++]=i;seen[i]=1;const component=[];let centerBonus=0,touches=0;
    while(head<tail){
      const idx=queue[head++],x=idx%w,y=(idx/w)|0;component.push(idx);
      const nd=Math.hypot((x-cx)/(w*.5),(y-cy)/(h*.55));if(nd<.65)centerBonus+=2;
      if(x<2||y<2||x>w-3||y>h-3)touches++;
      const ns=[idx-1,idx+1,idx-w,idx+w];
      for(const ni of ns){if(ni<0||ni>=mask.length||seen[ni]||mask[ni]<110)continue;const nx=ni%w,ny=(ni/w)|0;if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;seen[ni]=1;queue[tail++]=ni;}
    }
    const score=component.length+centerBonus-touches*8;
    if(!best.length||score>best.score){component.score=score;best=component;}
  }
  const out=new Uint8Array(mask.length);
  for(const idx of best)out[idx]=mask[idx];
  return out;
}
function offlinePortraitMask(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height;
  const rgba=ctx.getImageData(0,0,w,h).data,palette=sampleBorderPalette(rgba,w,h);
  const raw=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    const edgeD=nearestPaletteDistance(r,g,b,palette);
    const nx=(x-w/2)/(w/2),ny=(y-h*.48)/(h*.55),rad=Math.sqrt(nx*nx+ny*ny);
    const center=Math.max(0,1-rad);
    const portraitPrior=Math.max(0,1-Math.abs(x-w/2)/(w*.54))*Math.max(0,1-Math.abs(y-h*.52)/(h*.62));
    const score=edgeD+center*30+portraitPrior*24;
    raw[y*w+x]=score>74?255:score>54?Math.round((score-54)/20*255):0;
  }
  let clean=blurMask(raw,w,h,2);
  clean=largestCenterComponent(clean,w,h);
  clean=blurMask(clean,w,h,2);
  let selected=0;for(const v of clean)if(v>110)selected++;
  if(selected<w*h*.035)throw makeError('No pude separar claramente a la persona. Usa “Tocar objeto” o prueba una foto con más contraste.','OFFLINE_MASK_SMALL');
  if(selected>w*h*.90)throw makeError('La persona y el fondo tienen colores demasiado parecidos. Usa “Tocar objeto”.','OFFLINE_MASK_LARGE');
  logDebug('OFFLINE CORE: máscara lista',{width:w,height:h,selected,total:w*h,palette:palette.length});
  return clean;
}
function featherMask(mask,width,height){
  const out=new Uint8Array(mask.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let sum=0,count=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<width&&yy<height){sum+=mask[yy*width+xx];count++;}
    }
    out[y*width+x]=Math.round(sum/count);
  }
  return out;
}

function maskBounds(mask,w,h,threshold=110){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(mask[y*w+x]>=threshold){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}return maxX<0?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};}
function morphology(mask,w,h,kind='dilate',radius=1){
 const out=new Uint8Array(mask.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let v=kind==='erode'?255:0;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h){if(kind==='erode')v=0;continue;}
   const p=mask[yy*w+xx];v=kind==='erode'?Math.min(v,p):Math.max(v,p);
  }
  out[y*w+x]=v;
 }
 return out;
}
function closeMask(mask,w,h,radius=1){return morphology(morphology(mask,w,h,'dilate',radius),w,h,'erode',radius);}
function skinPixel(r,g,b){
 const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
 const cb=128-.168736*r-.331264*g+.5*b;
 const cr=128+.5*r-.418688*g-.081312*b;
 const rgbRule=r>45&&g>28&&b>18&&(mx-mn)>12&&r>g*.92&&r>b*1.04;
 const ycbcrRule=cr>132&&cr<180&&cb>74&&cb<138;
 return rgbRule&&ycbcrRule;
}
function upperSkinComponent(base,w,h,canvas){
 const box=maskBounds(base,w,h,75);if(!box||!canvas)return null;
 const rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
 const candidate=new Uint8Array(base.length);
 const maxY=Math.min(h-1,Math.round(box.y+box.h*.58));
 for(let y=Math.max(0,box.y);y<=maxY;y++)for(let x=Math.max(0,box.x);x<Math.min(w,box.x+box.w);x++){
  const i=y*w+x,j=i*4;if(base[i]>45&&skinPixel(rgba[j],rgba[j+1],rgba[j+2]))candidate[i]=255;
 }
 const comp=largestCenterComponent(candidate,w,h),cb=maskBounds(comp,w,h,110);
 return cb&&cb.w>box.w*.10&&cb.h>box.h*.08?{mask:comp,box:cb}:null;
}
function profileMask(base,w,h,mode='person',canvas=null){
 if(mode==='person')return base;
 const box=maskBounds(base,w,h,75);if(!box)return base;const out=new Uint8Array(base.length);
 if(mode==='bust'){
  // A bust is the REAL person silhouette, cropped below the shoulders/upper torso.
  // Do not replace it with a face/skin rectangle.
  const bottom=Math.min(h-1,Math.round(box.y+box.h*.66));
  for(let y=box.y;y<=bottom;y++)for(let x=box.x;x<Math.min(w,box.x+box.w);x++){const i=y*w+x;if(base[i]>45)out[i]=base[i];}
  return blurMask(closeMask(out,w,h,1),w,h,1);
 }
 if(mode==='face'){
  const detected=upperSkinComponent(base,w,h,canvas);
  let fb=detected?.box;
  if(!fb){fb={x:Math.round(box.x+box.w*.24),y:box.y,w:Math.round(box.w*.52),h:Math.round(box.h*.42)};}
  // Expand detected facial skin just enough to include eyes, lips and ears, but not hair/neck.
  const cx=fb.x+fb.w/2,cy=fb.y+fb.h/2;
  const rx=Math.max(8,fb.w*.64),ry=Math.max(8,fb.h*.62);
  for(let y=Math.max(0,Math.floor(cy-ry));y<Math.min(h,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(w,Math.ceil(cx+rx));x++){
   const i=y*w+x,nx=(x-cx)/rx,ny=(y-cy)/ry;if(nx*nx+ny*ny<=1&&base[i]>20)out[i]=255;
  }
  return blurMask(out,w,h,2);
 }
 if(mode==='skin'&&canvas){
  const rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  for(let y=box.y;y<Math.min(h,box.y+box.h);y++)for(let x=box.x;x<Math.min(w,box.x+box.w);x++){
   const i=y*w+x,j=i*4;if(base[i]>35&&skinPixel(rgba[j],rgba[j+1],rgba[j+2]))out[i]=255;
  }
  return blurMask(closeMask(out,w,h,1),w,h,1);
 }
 return base;
}
async function refineCurrentMask(){
 if(!state.mask)return api()?.toast('Primero crea una máscara.');
 const {data,width,height}=state.mask;
 // Close pinholes, recover one-pixel gaps, then feather only the edge.
 let binary=new Uint8Array(data.length);for(let i=0;i<data.length;i++)binary[i]=data[i]>70?255:0;
 binary=closeMask(binary,width,height,1);
 let refined=blurMask(binary,width,height,2);
 await setMask(refined,width,height,state.maskKind||'Selección refinada');
 setStatus('Máscara refinada: huecos pequeños recuperados y borde suavizado sin cambiar el objeto.','ready');api()?.toast('Máscara refinada');
}
function magicWandMask(canvas,nx,ny){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});const {width:w,height:h}=canvas;
  const rgba=ctx.getImageData(0,0,w,h).data;const sx=Math.max(0,Math.min(w-1,Math.round(nx*(w-1)))),sy=Math.max(0,Math.min(h-1,Math.round(ny*(h-1))));
  const si=(sy*w+sx)*4,sr=rgba[si],sg=rgba[si+1],sb=rgba[si+2];
  const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;queue[tail++]=sy*w+sx;seen[sy*w+sx]=1;
  const seedThreshold=72,localThreshold=38;
  while(head<tail){const idx=queue[head++],x=idx%w,y=(idx/w)|0,pi=idx*4,r=rgba[pi],g=rgba[pi+1],b=rgba[pi+2];mask[idx]=255;
    const ns=[idx-1,idx+1,idx-w,idx+w];
    for(const ni of ns){if(ni<0||ni>=w*h||seen[ni])continue;const nxp=ni%w,nyp=(ni/w)|0;if(Math.abs(nxp-x)+Math.abs(nyp-y)!==1)continue;seen[ni]=1;const qi=ni*4,rr=rgba[qi],gg=rgba[qi+1],bb=rgba[qi+2];
      const ds=Math.hypot(rr-sr,gg-sg,bb-sb),dl=Math.hypot(rr-r,gg-g,bb-b);if(ds<=seedThreshold&&dl<=localThreshold)queue[tail++]=ni;
    }
  }
  if(tail<80)throw makeError('La selección quedó muy pequeña. Toca más cerca del centro del objeto.');
  if(tail>w*h*.92)throw makeError('Se seleccionó casi toda la foto. Toca una zona más definida del objeto.');
  logDebug('MAGIC WAND: máscara lista',{selected:tail,total:w*h});return featherMask(mask,w,h);
}

const debug={entries:[],startedAt:Date.now()};
try{const saved=JSON.parse(localStorage.getItem(DEBUG_KEY)||'null');if(saved?.entries?.length)debug.entries=saved.entries.slice(-250);}catch(_){ }
function serialize(value){
  if(value instanceof Error)return {name:value.name,message:value.message,stack:value.stack,code:value.code};
  if(value===undefined)return 'undefined';
  try{return JSON.parse(JSON.stringify(value));}catch(_){return String(value);}
}
function logDebug(step,data){
  const entry={time:new Date().toISOString(),ms:Date.now()-debug.startedAt,step,data:serialize(data)};
  debug.entries.push(entry); if(debug.entries.length>250)debug.entries.shift();
  try{localStorage.setItem(DEBUG_KEY,JSON.stringify({entries:debug.entries,savedAt:Date.now()}));}catch(_){ }
  console.log('[PHOTO IA DEBUG]',step,data??''); renderDebug();
  return entry;
}
function environmentInfo(){
  return {
    version:VERSION,url:location.href,online:navigator.onLine,userAgent:navigator.userAgent,
    platform:navigator.platform,language:navigator.language,hardwareConcurrency:navigator.hardwareConcurrency,
    deviceMemory:navigator.deviceMemory||'unknown',crossOriginIsolated:self.crossOriginIsolated,
    webAssembly:typeof WebAssembly!=='undefined',webGL:!!document.createElement('canvas').getContext('webgl'),
    webGL2:!!document.createElement('canvas').getContext('webgl2'),screen:`${screen.width}x${screen.height}`
  };
}
function debugText(){return JSON.stringify({environment:environmentInfo(),entries:debug.entries},null,2)}
function renderDebug(){
  const box=$('segment-debug-log');
  if(!box)return;
  box.textContent=debug.entries.map(e=>{
    const details=e.data!==undefined?`\n${JSON.stringify(e.data,null,2)}`:'';
    return `+${(e.ms/1000).toFixed(2)}s  ${e.step}${details}`;
  }).join('\n\n');
  box.scrollTop=box.scrollHeight;
}
async function copyDebug(){
  const text=debugText();
  try{await navigator.clipboard.writeText(text);api()?.toast('Diagnóstico copiado');}
  catch(_){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();api()?.toast('Diagnóstico copiado');}
}
function downloadDebug(){
  const blob=new Blob([debugText()],{type:'application/json'});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`photo-ia-diagnostico-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function probeUrl(name,url){
  logDebug(`PRUEBA ${name}: inicio`,url);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const r=await fetch(url,{method:'GET',cache:'no-store',signal:controller.signal});
    logDebug(`PRUEBA ${name}: respuesta`,{ok:r.ok,status:r.status,type:r.type,contentType:r.headers.get('content-type'),length:r.headers.get('content-length')});
    try{await r.body?.cancel?.();}catch(_){}
    return r.ok;
  }catch(err){logDebug(`PRUEBA ${name}: ERROR`,err);return false;}finally{clearTimeout(timer)}
}
async function runConnectionTests(){
  setStatus('Ejecutando pruebas de conexión…','loading');
  const results=[];
  results.push(await probeUrl('MediaPipe ESM',MEDIAPIPE_ESM));
  results.push(await probeUrl('WASM loader',`${MEDIAPIPE_WASM}/vision_wasm_internal.js`));
  results.push(await probeUrl('WASM SIMD',`${MEDIAPIPE_WASM}/vision_wasm_internal.wasm`));
  results.push(await probeUrl('WASM sin SIMD',`${MEDIAPIPE_WASM}/vision_wasm_nosimd_internal.wasm`));
  results.push(await probeUrl('Modelo persona',PERSON_MODEL));
  results.push(await probeUrl('Modelo interactivo',INTERACTIVE_MODEL));
  setStatus(results.every(Boolean)?'Todas las direcciones respondieron. Prueba Separar persona.':'Una o más descargas fallaron. Abre el diagnóstico.','error');
}
async function fetchModelBuffer(url,operation,label){
  logDebug(`${label}: descarga binaria inicio`,url);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(url,{cache:'force-cache',signal:controller.signal});
    if(!response.ok)throw makeError(`${label}: HTTP ${response.status}`,'MODEL_FETCH');
    const buffer=await response.arrayBuffer();
    logDebug(`${label}: descarga binaria correcta`,{bytes:buffer.byteLength});
    if(operation?.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    return new Uint8Array(buffer);
  }finally{clearTimeout(timer)}
}

window.addEventListener('error',e=>logDebug('ERROR GLOBAL',{message:e.message,source:e.filename,line:e.lineno,column:e.colno,error:serialize(e.error)}));
window.addEventListener('unhandledrejection',e=>logDebug('PROMESA RECHAZADA',e.reason));

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
  logDebug('Timeout armado',{ms,message,operationId:operation?.id});
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>{logDebug('TIMEOUT DISPARADO',{ms,message,operationId:operation?.id});reject(makeError(message,'TIMEOUT'))},ms)})
  ]).finally(()=>clearTimeout(timer)).then(value=>{
    if(operation?.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    return value;
  });
}
function beginOperation(label){
  logDebug('OPERACIÓN INICIADA',label);
  cancelCurrent(false);
  const operation={id:++state.operationId,cancelled:false,label};
  state.operation=operation; state.loading=true; updateUI();
  api()?.processing(true,label);
  return operation;
}
function finishOperation(operation){
  logDebug('OPERACIÓN FINALIZADA',{id:operation?.id,cancelled:operation?.cancelled});
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
  logDebug('Preparando canvas de trabajo');
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
  state.workCanvas=canvas; logDebug('Canvas listo',{width:canvas.width,height:canvas.height,originalWidth:img.naturalWidth,originalHeight:img.naturalHeight}); return canvas;
}
async function loadModule(operation){
  if(state.module&&state.fileset)return state.module;
  if(!state.modulePromise){
    state.modulePromise=(async()=>{
      setStatus('Descargando motor de segmentación…','loading');
      logDebug('IMPORT ESM: inicio',MEDIAPIPE_ESM);
      const mod=await import(MEDIAPIPE_ESM);
      logDebug('IMPORT ESM: correcto',{exports:Object.keys(mod)});
      logDebug('FILESET WASM: inicio',MEDIAPIPE_WASM);
      const fileset=await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      logDebug('FILESET WASM: correcto',fileset);
      state.module=mod;state.fileset=fileset;return mod;
    })().catch(err=>{logDebug('CARGA DEL MOTOR: ERROR',err);state.modulePromise=null;state.module=null;state.fileset=null;throw err;});
  }
  return timeout(state.modulePromise,LOAD_TIMEOUT,'El motor tardó demasiado en descargar. Revisa internet y vuelve a intentar.',operation);
}
async function createWithFallback(factory,operation,label){
  logDebug('CREAR MODELO: entrada',{label,isIOS:/iPad|iPhone|iPod/.test(navigator.userAgent)});
  setStatus(label,'loading');
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  // En iPhone/iPad el delegate GPU puede quedarse bloqueado dentro de WebGL.
  // CPU es más estable y con los modelos reducidos termina en pocos segundos.
  if(isIOS){
    // MediaPipe Web no necesita que se fuerce el texto "CPU". En WebKit esa
    // opción puede dejar createFromOptions pendiente. Sin delegate usa CPU/WASM
    // automáticamente, que es el camino compatible con iPhone.
    setStatus(`${label} Iniciando motor compatible con iPhone…`,'loading');
    logDebug('CREATE FROM OPTIONS: automático/CPU inicio');
    const created=await timeout(factory(null),LOAD_TIMEOUT,'No se pudo iniciar el modelo compatible con iPhone.',operation);
    logDebug('CREATE FROM OPTIONS: automático/CPU correcto');return created;
  }
  try{
    logDebug('CREATE FROM OPTIONS: GPU inicio');
    const created=await timeout(factory('GPU'),LOAD_TIMEOUT,'El modelo tardó demasiado en iniciar.',operation);
    logDebug('CREATE FROM OPTIONS: GPU correcto');return created;
  }catch(gpuErr){
    if(operation.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    logDebug('CREATE FROM OPTIONS: GPU ERROR',gpuErr);console.warn('GPU unavailable, retrying on CPU',gpuErr);
    setStatus('La GPU no respondió. Reintentando con CPU…','loading');
    logDebug('CREATE FROM OPTIONS: CPU inicio');
    const created=await timeout(factory('CPU'),LOAD_TIMEOUT,'No se pudo iniciar el modelo ni con GPU ni con CPU.',operation);
    logDebug('CREATE FROM OPTIONS: CPU correcto');return created;
  }
}
async function ensurePersonSegmenter(operation){
  logDebug('PERSON SEGMENTER: ensure inicio');
  await loadModule(operation);logDebug('PERSON SEGMENTER: módulo listo');if(state.imageSegmenter)return state.imageSegmenter;
  if(!state.personModelBuffer)state.personModelBuffer=await fetchModelBuffer(PERSON_MODEL,operation,'MODELO PERSONA');
  setStatus('Preparando segmentación de persona…','loading');
  logDebug('CREATE FROM MODEL BUFFER: persona inicio',{bytes:state.personModelBuffer?.byteLength});
  state.imageSegmenter=await timeout(
    state.module.ImageSegmenter.createFromModelBuffer(state.fileset,state.personModelBuffer),
    LOAD_TIMEOUT,'No se pudo crear el segmentador de persona.',operation
  );
  logDebug('CREATE FROM MODEL BUFFER: persona correcto');
  logDebug('SET OPTIONS: persona inicio');
  await timeout(state.imageSegmenter.setOptions({
    runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false
  }),LOAD_TIMEOUT,'No se pudieron configurar las opciones de segmentación.',operation);
  logDebug('SET OPTIONS: persona correcto');
  return state.imageSegmenter;
}
async function ensureInteractiveSegmenter(operation){
  await loadModule(operation);if(state.interactiveSegmenter)return state.interactiveSegmenter;
  if(!state.interactiveModelBuffer)state.interactiveModelBuffer=await fetchModelBuffer(INTERACTIVE_MODEL,operation,'MODELO INTERACTIVO');
  setStatus('Preparando selección inteligente…','loading');
  logDebug('CREATE FROM MODEL BUFFER: interactivo inicio',{bytes:state.interactiveModelBuffer?.byteLength});
  state.interactiveSegmenter=await timeout(
    state.module.InteractiveSegmenter.createFromModelBuffer(state.fileset,state.interactiveModelBuffer),
    LOAD_TIMEOUT,'No se pudo crear el segmentador interactivo.',operation
  );
  logDebug('CREATE FROM MODEL BUFFER: interactivo correcto');
  logDebug('SET OPTIONS: interactivo inicio');
  await timeout(state.interactiveSegmenter.setOptions({
    outputCategoryMask:false,outputConfidenceMasks:true
  }),LOAD_TIMEOUT,'No se pudieron configurar las opciones de selección inteligente.',operation);
  logDebug('SET OPTIONS: interactivo correcto');
  return state.interactiveSegmenter;
}
async function letOverlayPaint(){
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,35)));
}
async function runTask(start,operation){
  logDebug('INFERENCIA: inicio');
  if(operation?.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
  await letOverlayPaint();
  // MediaPipe puede devolver el resultado directamente. En Safari/Chrome móvil,
  // la variante con callback puede no llamar nunca al callback y dejar la app cargando.
  const result=await timeout(Promise.resolve().then(start),RUN_TIMEOUT,
    'El análisis tardó demasiado. Intenta otra vez o usa una foto más pequeña.',operation);
  if(operation?.cancelled){closeResult(result);throw makeError('Proceso cancelado.','CANCELLED');}
  logDebug('INFERENCIA: resultado recibido',Object.keys(result||{}));
  return result;
}
function closeResult(result){
  try{result?.categoryMask?.close?.();}catch(_){ }
  try{result?.confidenceMasks?.forEach(m=>m.close?.());}catch(_){ }
}
function resizeMaskNearest(src,sw,sh,dw,dh){
 if(sw===dw&&sh===dh)return src;const out=new Uint8Array(dw*dh);
 for(let y=0;y<dh;y++){const sy=Math.min(sh-1,Math.floor(y*sh/dh));for(let x=0;x<dw;x++){const sx=Math.min(sw-1,Math.floor(x*sw/dw));out[y*dw+x]=src[sy*sw+sx];}}
 return out;
}
function categoryResultMask(result,w,h){
 const m=result?.categoryMask;if(!m)return null;
 let raw=null;try{raw=m.getAsUint8Array?.();}catch(_){ }
 if(!raw?.length)return null;
 const mw=m.width||w,mh=m.height||h;const bin=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bin[i]=raw[i]===PERSON_CLASS_ID||raw[i]>0?255:0;
 return blurMask(resizeMaskNearest(bin,mw,mh,w,h),w,h,1);
}
function confidenceResultMask(result,w,h){
 const masks=result?.confidenceMasks;if(!masks?.length)return null;const m=masks[0];let raw=null;
 try{raw=m.getAsFloat32Array?.();}catch(_){ }
 if(!raw?.length){try{const u=m.getAsUint8Array?.();if(u?.length)raw=Float32Array.from(u,v=>v/255);}catch(_){ }}
 if(!raw?.length)return null;const mw=m.width||w,mh=m.height||h;const bin=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++){const v=raw[i];bin[i]=v>.62?255:v>.38?Math.round((v-.38)/.24*255):0;}
 return blurMask(resizeMaskNearest(bin,mw,mh,w,h),w,h,1);
}
async function intelligentPersonMask(work,operation){
 // Prefer the real semantic model when its optional local core is installed.
 try{
  setStatus('Usando motor IA para separar la persona…','loading');
  const segmenter=await ensurePersonSegmenter(operation);
  const result=await runTask(()=>segmenter.segment(work),operation);
  const mask=categoryResultMask(result,work.width,work.height);closeResult(result);
  if(mask){const n=mask.reduce((a,v)=>a+(v>100),0);if(n>work.width*work.height*.025&&n<work.width*work.height*.95){logDebug('PERSONA: MediaPipe correcto',{selected:n});return mask;}}
  throw makeError('La máscara semántica no fue válida.','MODEL_MASK_INVALID');
 }catch(err){
  if(operation?.cancelled)throw err;
  logDebug('PERSONA: usando respaldo local',err);
  setStatus('Usando selección local compatible…','loading');
  return offlinePortraitMask(work);
 }
}
async function segmentProfile(mode='person'){
  if(!api()?.state?.photo)return api()?.toast('Abre una foto primero.');
  const labels={person:'Persona completa',bust:'Busto para identificación',face:'Rostro',skin:'Piel'};const label=labels[mode]||labels.person;
  const operation=beginOperation(`Seleccionando ${label.toLowerCase()}…`);setStatus('Preparando una copia optimizada de la foto…','loading');
  try{
    const work=await getWorkCanvas(operation);setStatus(`Detectando ${label.toLowerCase()}…`,'loading');await letOverlayPaint();
    const person=await intelligentPersonMask(work,operation);
    const mask=profileMask(person,work.width,work.height,mode,work);
    if(operation.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    const selected=mask.reduce((n,v)=>n+(v>80),0);if(selected<work.width*work.height*.006)throw makeError(`No pude detectar claramente ${label.toLowerCase()}.`,'PROFILE_MASK_SMALL');
    await setMask(mask,work.width,work.height,label);setStatus(`${label} seleccionado. La máscara azul coincide con el área que recibirá la edición.`,'ready');api().toast(`${label} listo`);
  }catch(err){const msg=friendlyError(err);logDebug(`SEGMENTAR ${mode}: ERROR`,err);setStatus(msg,'error');if(err?.code!=='CANCELLED')api().toast(msg);}finally{finishOperation(operation);}
}
const segmentPerson=()=>segmentProfile('person');
const segmentBust=()=>segmentProfile('bust');
const segmentFace=()=>segmentProfile('face');
const segmentSkin=()=>segmentProfile('skin');
function restoreBackground(){const photo=api()?.state?.photo;if(!photo)return;photo.visible=true;api().state.canvas.requestRenderAll();api().snapshot?.();setStatus('Imagen completa visible. Los cambios de las capas permanecen.','ready');api().toast('Fondo restaurado');}
function isolateSelection(){const photo=api()?.state?.photo;if(!photo||!state.mask)return api()?.toast('Primero crea una selección.');createCutout();}
function canvasPointToNormalized(pointer){
  const photo=api().state.photo;const bounds=photo.getBoundingRect(true,true);
  const x=(pointer.x-bounds.left)/bounds.width,y=(pointer.y-bounds.top)/bounds.height;
  return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),inside:x>=0&&x<=1&&y>=0&&y<=1};
}
async function segmentAtPoint(x,y){
  const operation=beginOperation('Creando selección inteligente…');setStatus('Analizando el objeto que tocaste…','loading');
  try{
    const work=await getWorkCanvas(operation);await letOverlayPaint();let mask=null;
    try{
      const segmenter=await ensureInteractiveSegmenter(operation);
      const result=await runTask(()=>segmenter.segment(work,{keypoint:{x,y}}),operation);
      mask=confidenceResultMask(result,work.width,work.height);closeResult(result);
      if(!mask||mask.reduce((n,v)=>n+(v>100),0)<120)throw makeError('Selección semántica insuficiente.','INTERACTIVE_MASK_SMALL');
      logDebug('OBJETO: segmentador interactivo correcto');
    }catch(modelErr){
      if(operation.cancelled)throw modelErr;
      logDebug('OBJETO: respaldo por color/bordes',modelErr);
      setStatus('Usando selección local por bordes…','loading');mask=magicWandMask(work,x,y);
    }
    await setMask(mask,work.width,work.height,'Objeto por toque');
    setStatus('Objeto seleccionado. La máscara azul muestra exactamente lo que editarás.','ready');api().toast('Objeto seleccionado');
  }catch(err){const msg=friendlyError(err);logDebug('SELECCIÓN INTELIGENTE: ERROR',err);setStatus(msg,'error');if(err?.code!=='CANCELLED')api().toast(msg);}
  finally{finishOperation(operation);}
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
function command(raw){const t=String(raw||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/identificacion|credencial|selecciona.*busto/.test(t)){segmentBust();return true;}if(/selecciona.*rostro|solo.*cara|solo.*rostro/.test(t)){segmentFace();return true;}if(/selecciona.*piel|solo.*piel/.test(t)){segmentSkin();return true;}if(/segmenta.*persona|selecciona.*persona completa|separa.*persona/.test(t)){segmentPerson();return true;}if(/seleccion inteligente|toca.*objeto|segmenta.*objeto/.test(t)){beginTapMode();return true;}if(/regresa.*fondo|restaura.*fondo|muestra.*imagen completa/.test(t)){restoreBackground();return true;}if(/refina.*mascara|mejora.*mascara/.test(t)){refineCurrentMask();return true;}if(/quita.*fondo|elimina.*fondo|fondo transparente/.test(t)){if(state.mask)createCutout();else segmentPerson().then(()=>state.mask&&createCutout());return true;}if(/muestra.*mascara/.test(t)){showMask(true);return true;}if(/oculta.*mascara/.test(t)){showMask(false);return true;}if(/limpia.*mascara|borra.*mascara/.test(t)){clearMask();return true;}if(/cancela.*segment|deten.*segment/.test(t)){cancelCurrent();return true;}return false;}
function boot(){
  if(!$('segment-person'))return;
  $('segment-person').onclick=segmentPerson;$('segment-tap').onclick=beginTapMode;$('segment-show').onclick=()=>showMask(true);$('segment-hide').onclick=()=>showMask(false);$('segment-clear').onclick=clearMask;$('segment-cutout').onclick=createCutout;
  if($('segment-cancel'))$('segment-cancel').onclick=()=>cancelCurrent(true);
  if($('segment-debug-copy'))$('segment-debug-copy').onclick=copyDebug;
  if($('segment-debug-download'))$('segment-debug-download').onclick=downloadDebug;
  if($('segment-debug-test'))$('segment-debug-test').onclick=runConnectionTests;
  if($('processing-cancel'))$('processing-cancel').onclick=()=>cancelCurrent(true);
  api().state.canvas.on('mouse:down',handleCanvasTap);api().state.canvas.on('object:added',e=>{if(e.target?.photoRole==='main')clearMask();});
  logDebug('ARRANQUE',environmentInfo());renderDebug();updateUI();setStatus('Motor 8.3 local listo. No descarga BodyPix ni modelos externos.');
  if(window.PhotoBrain?.register)window.PhotoBrain.register({name:'segmentation',score:t=>/segmenta|seleccion inteligente|toca.*objeto|quita.*fondo|elimina.*fondo|mascara|cancela.*segment/.test(t)?220:0,run:t=>command(t)});
}
function exportMaskDataUrl(){
  if(!state.mask)return '';
  const {data,width,height}=state.mask,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),img=ctx.createImageData(width,height);
  for(let i=0;i<data.length;i++){const v=data[i];img.data[i*4]=255;img.data[i*4+1]=255;img.data[i*4+2]=255;img.data[i*4+3]=v;}
  ctx.putImageData(img,0,0);return canvas.toDataURL('image/png');
}
function exportSourceDataUrl(){return state.workCanvas?.toDataURL?.('image/png')||'';}
window.PhotoSegmentation={version:VERSION,segmentPerson,segmentBust,segmentFace,segmentSkin,beginTapMode,createCutout,isolateSelection,restoreBackground,refineCurrentMask,clearMask,showMask,cancel:()=>cancelCurrent(true),command,exportMaskDataUrl,exportSourceDataUrl,get mask(){return state.mask}};
let started=false;function safeBoot(){if(started)return;if(window.PhotoIA?.state?.canvas){started=true;boot();}else setTimeout(safeBoot,120)}
window.addEventListener('photoia-ready',safeBoot,{once:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',safeBoot,{once:true});else safeBoot();
})();
