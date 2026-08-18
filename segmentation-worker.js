/* PHOTO IA 15.16 — classic isolated MediaPipe worker
 * All MediaPipe inference runs here, never on the UI thread.
 */
const WORKER_VERSION='15.16-classic-worker';
const MP_VERSION='1.0.1';
const ESM_LOCAL='./assets/mediapipe/vision_bundle.mjs?v=15.16';
const ESM_REMOTE=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const WASM_LOCAL='./assets/mediapipe/wasm';
const WASM_REMOTE=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const PERSON_MODEL_LOCAL='./assets/models/selfie_segmenter_landscape.tflite';
const PERSON_MODEL_REMOTE='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';
const MULTICLASS_MODEL_LOCAL='./assets/models/selfie_multiclass_256x256.tflite';
const MULTICLASS_MODEL_REMOTE='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
const FACE_MODEL_LOCAL='./assets/models/face_landmarker.task';
const FACE_MODEL_REMOTE='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
let PERSON_MODEL=PERSON_MODEL_LOCAL,MULTICLASS_MODEL=MULTICLASS_MODEL_LOCAL,FACE_MODEL=FACE_MODEL_LOCAL;
let mp=null,fileset=null;
let diag={worker:'READY',workerVersion:WORKER_VERSION,workerKind:'classic',module:'NOT_LOADED',wasm:'NOT_LOADED',personModel:'NOT_LOADED',multiclassModel:'NOT_LOADED',faceModel:'NOT_LOADED',lastTask:'-',lastPhase:'idle',lastMs:0,input:'-',engine:'MediaPipe Worker',error:''};
const now=()=>performance.now();
function phase(name,extra={}){diag.lastPhase=name;Object.assign(diag,extra);postMessage({type:'phase',phase:name,diag:{...diag}})}
function errText(e){return String(e?.message||e||'Error desconocido')}
async function loadMP(){
  if(mp&&fileset)return;
  const t=now();
  diag.module='LOADING';diag.wasm='NOT_LOADED';
  diag.importScriptsAvailable=typeof importScripts==='function'?'YES':'NO';
  phase('Inicializando Worker clásico…',{module:'LOADING',wasm:'NOT_LOADED',workerKind:'classic',workerVersion:WORKER_VERSION,importScriptsAvailable:diag.importScriptsAvailable});
  if(typeof importScripts!=='function')throw new Error('Worker incorrecto: MediaPipe necesita un Worker clásico con importScripts().');
  let localErr=null;
  try{
    phase('Cargando MediaPipe ESM local…');
    mp=await import(ESM_LOCAL);
    diag.moduleSource='LOCAL';
  }catch(err){
    localErr=err;
    phase('Bundle local no disponible; probando CDN…');
    try{mp=await import(ESM_REMOTE);diag.moduleSource='CDN';}
    catch(remoteErr){diag.module='ERROR';throw new Error(`MediaPipe module local: ${errText(localErr)} | CDN: ${errText(remoteErr)}`);}
  }
  if(!mp?.FilesetResolver||!mp?.ImageSegmenter||!mp?.FaceLandmarker){diag.module='ERROR';throw new Error('El bundle MediaPipe cargó incompleto.');}
  diag.module='READY';phase('MediaPipe módulo READY',{module:'READY'});

  try{
    phase('Cargando MediaPipe WASM local…',{wasm:'LOADING'});
    fileset=await mp.FilesetResolver.forVisionTasks(WASM_LOCAL);
    diag.wasmSource='LOCAL';
  }catch(localWasmErr){
    phase('WASM local no disponible; probando CDN…',{wasm:'LOADING'});
    try{fileset=await mp.FilesetResolver.forVisionTasks(WASM_REMOTE);diag.wasmSource='CDN';}
    catch(remoteWasmErr){diag.wasm='ERROR';throw new Error(`MediaPipe WASM local: ${errText(localWasmErr)} | CDN: ${errText(remoteWasmErr)}`);}
  }
  diag.wasm='READY';diag.loadMs=Math.round(now()-t);
  phase('MediaPipe WASM READY',{module:'READY',wasm:'READY'});
}

async function createSegmenterWithFallback(localPath,remotePath,extra={}){
  try{return await mp.ImageSegmenter.createFromOptions(fileset,{baseOptions:{modelAssetPath:localPath},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false,...extra});}
  catch(localErr){phase('Modelo local no disponible; probando remoto…');return await mp.ImageSegmenter.createFromOptions(fileset,{baseOptions:{modelAssetPath:remotePath},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false,...extra});}
}
async function createFaceWithFallback(){
  const opts=path=>({baseOptions:{modelAssetPath:path},runningMode:'IMAGE',numFaces:1,minFaceDetectionConfidence:.40,minFacePresenceConfidence:.40,minTrackingConfidence:.40,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
  try{return await mp.FaceLandmarker.createFromOptions(fileset,opts(FACE_MODEL_LOCAL));}
  catch(localErr){phase('Face model local no disponible; probando remoto…');return await mp.FaceLandmarker.createFromOptions(fileset,opts(FACE_MODEL_REMOTE));}
}
function closeResult(r){try{r?.categoryMask?.close?.()}catch(_){} try{r?.confidenceMasks?.forEach(m=>m.close?.())}catch(_){}}
function maskBytes(m){if(!m)return null;try{const a=m.getAsUint8Array?.();if(a)return new Uint8Array(a)}catch(_){} try{const a=m.getAsFloat32Array?.();if(a)return Uint8Array.from(a,v=>Math.round(Math.max(0,Math.min(1,v))*255))}catch(_){} return null}
function classMask(cat,ids){const set=new Set(ids),out=new Uint8Array(cat.length);for(let i=0;i<cat.length;i++)if(set.has(cat[i]))out[i]=255;return out}
async function personMask(image){
  await loadMP();const t=now();phase('Selfie Segmentation…');
  phase('Cargando modelo Selfie Segmentation…',{personModel:'LOADING'});const seg=await createSegmenterWithFallback(PERSON_MODEL_LOCAL,PERSON_MODEL_REMOTE);diag.personModel='READY';diag.personModel='READY';phase('Selfie Segmentation READY',{personModel:'READY'});
  let result;try{result=seg.segment(image);const cat=maskBytes(result?.categoryMask);if(!cat)throw new Error('Selfie Segmentation no devolvió máscara');const out=new Uint8Array(cat.length);for(let i=0;i<cat.length;i++)if(cat[i]===1)out[i]=255;diag.personMs=Math.round(now()-t);return out}finally{closeResult(result);try{seg.close?.()}catch(_){}}
}
async function multiclass(image,mode){
  await loadMP();const t=now();phase(`Segmentación multiclase: ${mode}…`);
  phase('Cargando modelo multiclase…',{multiclassModel:'LOADING'});const seg=await createSegmenterWithFallback(MULTICLASS_MODEL_LOCAL,MULTICLASS_MODEL_REMOTE);diag.multiclassModel='READY';phase('Modelo multiclase READY',{multiclassModel:'READY'});
  let result;try{result=seg.segment(image);const cat=maskBytes(result?.categoryMask);if(!cat)throw new Error('Multiclase no devolvió máscara');diag.multiclassMs=Math.round(now()-t);if(mode==='hair')return classMask(cat,[1]);if(mode==='clothing')return classMask(cat,[4]);if(mode==='skin')return classMask(cat,[2,3]);if(mode==='face')return classMask(cat,[3]);return classMask(cat,[1,2,3,4,5])}finally{closeResult(result);try{seg.close?.()}catch(_){}}
}
async function landmarks(image){
  await loadMP();const t=now();phase('Face Landmarker…');
  phase('Cargando Face Landmarker…',{faceModel:'LOADING'});const lm=await createFaceWithFallback();diag.faceModel='READY';phase('Face Landmarker READY',{faceModel:'READY'});
  try{const r=lm.detect(image),pts=r?.faceLandmarks?.[0];if(!pts||pts.length<100)throw new Error('Face Landmarker no encontró el rostro');diag.faceMs=Math.round(now()-t);return pts.map(p=>({x:p.x,y:p.y,z:p.z||0}))}finally{try{lm.close?.()}catch(_){}}
}
function bbox(points,w,h){let minX=1,minY=1,maxX=0,maxY=0;for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)}return{x:minX*w,y:minY*h,w:(maxX-minX)*w,h:(maxY-minY)*h}}
function ycbcr(r,g,b){return{y:.299*r+.587*g+.114*b,cb:128-.168736*r-.331264*g+.5*b,cr:128+.5*r-.418688*g-.081312*b}}
function median(v){if(!v.length)return 0;v=[...v].sort((a,b)=>a-b);const m=(v.length-1)/2;return Number.isInteger(m)?v[m]:(v[Math.floor(m)]+v[Math.ceil(m)])/2}
function mad(v,c){return Math.max(1,median(v.map(x=>Math.abs(x-c))))}
function adaptiveSkin(imageData,person,face){
  const {width:w,height:h,data}=imageData,cx=face.x+face.w*.5,cy=face.y+face.h*.55,rx=Math.max(3,face.w*.30),ry=Math.max(3,face.h*.34),cbs=[],crs=[];
  for(let y=Math.max(0,Math.floor(face.y+face.h*.20));y<Math.min(h,Math.ceil(face.y+face.h*.86));y++)for(let x=Math.max(0,Math.floor(face.x+face.w*.18));x<Math.min(w,Math.ceil(face.x+face.w*.82));x++){const ex=(x-cx)/rx,ey=(y-cy)/ry;if(ex*ex+ey*ey>1)continue;const j=(y*w+x)*4,c=ycbcr(data[j],data[j+1],data[j+2]);if(c.y<45||c.y>238)continue;cbs.push(c.cb);crs.push(c.cr)}
  if(cbs.length<20)throw new Error('No pude aprender el tono de piel');const cb=median(cbs),cr=median(crs),cbm=Math.max(4,mad(cbs,cb)),crm=Math.max(4,mad(crs,cr)),out=new Uint8Array(w*h),faceBottom=face.y+face.h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(person&&person[i]<100)continue;const dx=Math.abs(x-cx),faceZone=dx<face.w*.72&&y>face.y-face.h*.12&&y<faceBottom+face.h*.75,bodyZone=y>=faceBottom+face.h*.15&&y<Math.min(h,faceBottom+face.h*3.2)&&dx<face.w*1.8;if(!faceZone&&!bodyZone)continue;const j=i*4,c=ycbcr(data[j],data[j+1],data[j+2]),dcb=Math.abs(c.cb-cb)/Math.max(8,cbm*3.0),dcr=Math.abs(c.cr-cr)/Math.max(9,crm*3.0),d=Math.sqrt(dcb*dcb+dcr*dcr);if(c.y>28&&c.y<250&&d<1.08)out[i]=255}
  return out
}
function bustMask(person,face,w,h){const out=new Uint8Array(w*h),cx=face.x+face.w*.5,top=Math.max(0,face.y-face.h*.18),bottom=Math.min(h-1,face.y+face.h*2.45);for(let y=Math.floor(top);y<=bottom;y++){let half;if(y<=face.y+face.h*1.02){const t=(y-(face.y-face.h*.18))/(face.h*1.20);half=face.w*(.60+.10*Math.max(0,Math.min(1,t)))}else{const t=(y-(face.y+face.h*1.02))/Math.max(1,bottom-(face.y+face.h*1.02));half=face.w*(.72+1.05*Math.pow(Math.max(0,t),.72))}const l=Math.max(0,Math.floor(cx-half)),r=Math.min(w-1,Math.ceil(cx+half));for(let x=l;x<=r;x++){const i=y*w+x;if(!person||person[i]>70)out[i]=255}}return out}
function faceMask(points,w,h){const b=bbox(points,w,h),out=new Uint8Array(w*h),cx=b.x+b.w*.5,cy=b.y+b.h*.52,rx=b.w*.58,ry=b.h*.62;for(let y=Math.max(0,Math.floor(cy-ry));y<Math.min(h,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(w,Math.ceil(cx+rx));x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1)out[y*w+x]=255}return out}
async function runProfile(mode,imageData){
  const w=imageData.width,h=imageData.height;diag.lastTask=mode;diag.input=`${w}×${h}`;const total=now();let mask,pts,person,face;
  let source=imageData;
  if(typeof OffscreenCanvas!=='undefined'){const c=new OffscreenCanvas(w,h);c.getContext('2d',{alpha:false}).putImageData(imageData,0,0);source=c;}
  if(mode==='person'){mask=await personMask(source)}
  else if(mode==='hair'||mode==='clothing'){mask=await multiclass(source,mode)}
  else if(mode==='face'){pts=await landmarks(source);mask=faceMask(pts,w,h)}
  else if(mode==='bust'){person=await personMask(source);pts=await landmarks(source);face=bbox(pts,w,h);mask=bustMask(person,face,w,h)}
  else if(mode==='skin'){person=await personMask(source);pts=await landmarks(source);face=bbox(pts,w,h);mask=adaptiveSkin(imageData,person,face)}
  else throw new Error(`Modo no soportado: ${mode}`);
  diag.lastMs=Math.round(now()-total);diag.lastPhase='done';diag.error='';return {mask,points:pts||null,diag:{...diag}}
}
self.onmessage=async e=>{
  const {id,type,mode,width,height,rgba}=e.data||{};
  if(type==='ping'){postMessage({type:'pong',id,diag:{...diag}});return}
  if(type!=='profile')return;
  try{const image=new ImageData(new Uint8ClampedArray(rgba),width,height);const result=await runProfile(mode,image);postMessage({type:'result',id,width,height,mask:result.mask.buffer,points:result.points,diag:result.diag},[result.mask.buffer])}
  catch(err){diag.error=errText(err);diag.lastPhase='error';postMessage({type:'error',id,message:diag.error,diag:{...diag}})}
};
postMessage({type:'ready',diag:{...diag}});
