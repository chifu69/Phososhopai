(() => {
'use strict';
const VERSION='1.1.1-ort-web-migan-ios';
const SCRIPT='./assets/vendor/ort.min.js?v=15.40.2';
const ORT_DIST='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/';
const REMOTE=ORT_DIST+'ort.min.js';
const ORT_MJS=ORT_DIST+'ort-wasm-simd-threaded.mjs';
const ORT_WASM=ORT_DIST+'ort-wasm-simd-threaded.wasm';
const MODEL_LOCAL='./assets/models/migan_pipeline_v2.onnx';
const MODEL_REMOTE='https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
const MODEL_SHA256='6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b';
const MODEL_CACHE='photoia-models-migan-v1';
let promise=null,lastError='',inpaintSession=null,sessionPromise=null,modelSource='';
function status(){return {version:VERSION,loaded:!!window.ort,loading:!!promise&&!window.ort,error:lastError||'',backend:'wasm',threads:1};}
async function load(){
  if(window.ort){configure();return window.ort;}
  if(promise)return promise;
  promise=new Promise((resolve,reject)=>{
    const tryScript=(src,fallback)=>{const s=document.createElement('script');s.src=src;s.async=true;
      s.onload=()=>{try{configure();resolve(window.ort);}catch(err){lastError=String(err?.message||err);reject(err)}};
      s.onerror=()=>{s.remove();if(fallback)tryScript(fallback,null);else{lastError='No pude cargar ONNX Runtime Web.';promise=null;reject(new Error(lastError));}};
      document.head.appendChild(s);};
    tryScript(SCRIPT,REMOTE);
  }).catch(err=>{promise=null;throw err});
  return promise;
}
function configure(){
  if(!window.ort?.env)return;
  // iOS/Safari can fail when the ORT glue module is resolved through a newly
  // activated service worker. Point ORT at absolute, version-matched CDN URLs
  // for its .mjs + .wasm pair. The service worker caches these exact URLs for
  // later reuse, while inference itself still runs entirely on-device.
  window.ort.env.wasm.numThreads=1;
  window.ort.env.wasm.simd=true;
  window.ort.env.wasm.proxy=false;
  window.ort.env.wasm.wasmPaths={mjs:ORT_MJS,wasm:ORT_WASM};
  lastError='';
}
async function healthCheck(){try{await load();return {...status(),ok:true};}catch(err){return {...status(),ok:false,error:String(err?.message||err)}}}
function localModelRequest(){return new Request(new URL(MODEL_LOCAL,location.href).href,{method:'GET'});}
async function sha256Hex(buffer){
  if(!crypto?.subtle)return '';
  const digest=await crypto.subtle.digest('SHA-256',buffer),a=new Uint8Array(digest);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function verifyModel(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20*1024*1024)throw new Error('El archivo MI-GAN está incompleto.');
  const hash=await sha256Hex(buffer);
  if(hash&&hash!==MODEL_SHA256)throw new Error('La verificación SHA-256 de MI-GAN falló.');
  return buffer;
}
async function cachedModel(){
  if(!('caches' in window))return null;
  try{const hit=await caches.match(localModelRequest());if(!hit||!hit.ok)return null;return verifyModel(await hit.arrayBuffer())}catch(_){return null}
}
async function saveModel(buffer){
  if(!('caches' in window))return;
  try{const c=await caches.open(MODEL_CACHE);await c.put(localModelRequest(),new Response(buffer.slice(0),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(buffer.byteLength),'X-PhotoIA-Model':'MI-GAN'}}))}catch(err){console.warn('PHOTO IA: no pude guardar MI-GAN en CacheStorage',err)}
}
async function fetchBuffer(url,timeout=180000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const r=await fetch(url,{cache:'no-store',signal:controller.signal,mode:'cors'});if(!r.ok)throw new Error(`${r.status} al descargar MI-GAN`);return await r.arrayBuffer()}finally{clearTimeout(timer)}
}
async function getModelBuffer(){
  let b=await cachedModel();if(b){modelSource='cache';return b}
  try{b=await verifyModel(await fetchBuffer(MODEL_LOCAL,180000));modelSource='local';await saveModel(b);return b}catch(localErr){
    console.info('PHOTO IA: MI-GAN no estaba en la ruta local, usando fuente oficial.',localErr?.message||localErr);
  }
  b=await verifyModel(await fetchBuffer(MODEL_REMOTE,240000));modelSource='official-download';await saveModel(b);return b;
}
async function inpaintStatus(){const c=await cachedModel();return {cached:!!c,session:!!inpaintSession,source:modelSource,modelBytes:c?.byteLength||0};}
async function ensureInpaintSession(){
  if(inpaintSession)return inpaintSession;if(sessionPromise)return sessionPromise;
  sessionPromise=(async()=>{
    const ort=await load(),model=await getModelBuffer();
    // MI-GAN pipeline contains preprocessing ops that are most consistently
    // supported by ORT Web's WASM backend on Safari/iPhone.
    const s=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    inpaintSession=s;lastError='';return s;
  })().catch(err=>{lastError=String(err?.message||err);sessionPromise=null;throw err});
  return sessionPromise;
}
function imageToCHW(imageData){
  const {width:w,height:h,data}=imageData,out=new Uint8Array(w*h*3),n=w*h;
  for(let i=0,p=0;i<n;i++,p+=4){out[i]=data[p];out[n+i]=data[p+1];out[n*2+i]=data[p+2]}
  return out;
}
function tensorToImageData(tensor,width,height){
  const d=tensor.data,n=width*height,out=new ImageData(width,height),od=out.data;
  if(!d||d.length<n*3)throw new Error('MI-GAN devolvió una salida inesperada.');
  for(let i=0,p=0;i<n;i++,p+=4){od[p]=d[i];od[p+1]=d[n+i];od[p+2]=d[n*2+i];od[p+3]=255}
  return out;
}
async function inpaint(imageData,holeMask){
  if(!(imageData instanceof ImageData))throw new Error('AI Fill necesita ImageData.');
  const w=imageData.width,h=imageData.height,n=w*h;if(!holeMask||holeMask.length!==n)throw new Error('La máscara de AI Fill no coincide con la imagen.');
  const session=await ensureInpaintSession(),ort=window.ort;
  const imageTensor=new ort.Tensor('uint8',imageToCHW(imageData),[1,3,h,w]);
  const knownMask=new Uint8Array(n);for(let i=0;i<n;i++)knownMask[i]=holeMask[i]>0?0:255;
  const maskTensor=new ort.Tensor('uint8',knownMask,[1,1,h,w]);
  const feeds={};
  const imageName=session.inputNames.find(n=>/image|img/i.test(n))||session.inputNames[0];
  const maskName=session.inputNames.find(n=>/mask/i.test(n))||session.inputNames[1];
  feeds[imageName]=imageTensor;feeds[maskName]=maskTensor;
  let result;
  try{result=await session.run(feeds)}finally{try{imageTensor.dispose?.();maskTensor.dispose?.()}catch(_){}}
  const output=result[session.outputNames[0]]||Object.values(result)[0];if(!output)throw new Error('MI-GAN no devolvió imagen.');
  const dims=output.dims||[],ow=dims.at(-1)||w,oh=dims.at(-2)||h;
  if(ow!==w||oh!==h)throw new Error(`MI-GAN devolvió ${ow}×${oh}; esperaba ${w}×${h}.`);
  const out=tensorToImageData(output,w,h);try{output.dispose?.()}catch(_){}return out;
}
window.PhotoONNX={version:VERSION,load,status,healthCheck,inpaintStatus,ensureInpaintSession,inpaint,model:{local:MODEL_LOCAL,remote:MODEL_REMOTE,sha256:MODEL_SHA256}};
})();
