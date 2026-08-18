(() => {
'use strict';
const VERSION='1.0-ort-web';
const SCRIPT='./assets/vendor/ort.min.js?v=15.30';
const REMOTE='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/ort.min.js';
const WASM_PATH='./assets/onnx/';
let promise=null,lastError='';
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
  // Safari/iPhone is more stable with a single WASM thread. WebGPU remains opt-in for future models.
  window.ort.env.wasm.numThreads=1;
  window.ort.env.wasm.simd=true;
  window.ort.env.wasm.wasmPaths=WASM_PATH;
  lastError='';
}
async function healthCheck(){
  try{await load();return {...status(),ok:true};}
  catch(err){return {...status(),ok:false,error:String(err?.message||err)};}
}
window.PhotoONNX={version:VERSION,load,status,healthCheck};
})();
