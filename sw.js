const CACHE='photo-ia-15-16-classic-worker-mediapipe';
const VERSION='15.23';
const CORE=[
 './','./index.html','./styles.css?v=15.23-worker','./ui-layout.js?v=15.23-worker','./app.js?v=15.23-worker',
 './creative-tools.js?v=15.23-worker','./brain.js?v=15.23-worker',
 './opencv-engine.js?v=15.23-worker','./smart-core.js?v=15.23-worker','./wardrobe-engine.js?v=15.23-worker','./ai-studio.js?v=15.23-worker',
 './vision.js?v=15.23-worker','./onnx-engine.js?v=15.23-worker','./segmentation.js?v=15.23-worker','./segmentation-worker.js?v=15.23','./manifest.webmanifest'
];
const ASSETS=[
 {local:'./assets/vendor/fabric.min.js?v=15.23-worker',remote:'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js',name:'Editor de capas',required:true},
 {local:'./assets/vendor/cropper.min.js?v=15.23-worker',remote:'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js',name:'Herramienta de recorte',required:true},
 {local:'./assets/vendor/cropper.min.css?v=15.23-worker',remote:'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css',name:'Estilos de recorte',required:true},
 {local:'./assets/vendor/tf.min.js?v=15.23-worker',remote:'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',name:'TensorFlow móvil',required:false},
 {local:'./assets/vendor/coco-ssd.min.js?v=15.23-worker',remote:'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',name:'Detector de objetos',required:false},
 {local:'./assets/vendor/opencv.js?v=15.23-worker',remote:'https://docs.opencv.org/4.x/opencv.js',name:'OpenCV avanzado',required:false},
 {local:'./assets/mediapipe/vision_bundle.mjs?v=15.23',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs',name:'MediaPipe Vision ESM 1.0.1',required:false,timeout:30000},
 {local:'./assets/mediapipe/wasm/vision_wasm_internal.js',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_internal.js',name:'WASM SIMD',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_internal.wasm',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_internal.wasm',name:'Motor WASM SIMD',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_nosimd_internal.js',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_nosimd_internal.js',name:'WASM compatible',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_nosimd_internal.wasm',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_nosimd_internal.wasm',name:'Motor WASM compatible',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_module_internal.js',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_module_internal.js',name:'WASM module loader',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_module_internal.wasm',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_module_internal.wasm',name:'WASM module runtime',required:false},
 {local:'./assets/models/selfie_segmenter_landscape.tflite',remote:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',name:'Modelo de persona opcional',required:false},
 {local:'./assets/models/interactive_segmentation.task',remote:'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task',name:'Modelo interactivo MediaPipe',required:false},
 {local:'./assets/models/selfie_multiclass_256x256.tflite',remote:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',name:'MediaPipe multiclase: cabello, piel, rostro y ropa',required:false,timeout:60000},
 {local:'./assets/models/face_landmarker.task',remote:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',name:'Face Landmarker',required:false,timeout:60000},
 {local:'./assets/vendor/ort.min.js?v=15.15',remote:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/ort.min.js',name:'ONNX Runtime Web',required:false,timeout:30000},
 {local:'./assets/onnx/ort-wasm-simd-threaded.mjs',remote:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/ort-wasm-simd-threaded.mjs',name:'ONNX WASM loader',required:false,timeout:30000},
 {local:'./assets/onnx/ort-wasm-simd-threaded.wasm',remote:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/ort-wasm-simd-threaded.wasm',name:'ONNX WASM runtime',required:false,timeout:30000}
];
const localKey=url=>new URL(url,self.registration.scope).href;
async function fetchWithTimeout(url,ms=25000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),ms);
 try{return await fetch(url,{mode:'cors',cache:'no-store',signal:controller.signal});}
 finally{clearTimeout(timer)}
}
async function cacheRemote(asset){
 const response=await fetchWithTimeout(asset.remote,asset.timeout|| (asset.required?25000:12000));
 if(!response.ok) throw new Error(`${response.status} ${asset.remote}`);
 const cache=await caches.open(CACHE);
 await cache.put(localKey(asset.local),response.clone());
}
async function notify(data){
 const clients=await self.clients.matchAll({includeUncontrolled:true,type:'window'});
 clients.forEach(c=>c.postMessage(data));
}
async function installLocalCore(){
 const cache=await caches.open(CACHE);
 const results=[];
 let done=0;
 for(const asset of ASSETS){
  let status='cached',error='';
  try{
   const existing=await cache.match(localKey(asset.local));
   if(!existing){await cacheRemote(asset);status='downloaded'}
  }catch(err){status='failed';error=String(err?.message||err)}
  done++;
  results.push({name:asset.name,local:asset.local,required:asset.required,status,error});
  await notify({type:'LOCAL_CORE_PROGRESS',done,total:ASSETS.length,label:status==='failed'?`${asset.name}: no disponible`:`${asset.name}: listo`,item:results.at(-1)});
 }
 const missingRequired=results.filter(r=>r.required&&r.status==='failed');
 const missingOptional=results.filter(r=>!r.required&&r.status==='failed');
 await notify({type:'LOCAL_CORE_READY',version:VERSION,results,missingRequired,missingOptional,degraded:missingRequired.length>0});
}
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(CORE.map(x=>c.add(x)))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{
 if(e.data?.type==='INSTALL_LOCAL_CORE') e.waitUntil(installLocalCore().catch(async err=>notify({type:'LOCAL_CORE_FATAL',message:String(err)})));
 if(e.data?.type==='SKIP_LOCAL_INSTALL') e.waitUntil(notify({type:'LOCAL_CORE_READY',version:VERSION,results:[],missingRequired:[],missingOptional:[],degraded:true,skipped:true}));
});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET') return;
 const url=new URL(e.request.url);
 if(url.origin!==location.origin) return;
 e.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(e.request.mode==='navigate'){
   try{const fresh=await fetch(e.request,{cache:'no-store'});if(fresh.ok){cache.put('./index.html',fresh.clone());return fresh;}}catch(_){ }
   return (await cache.match('./index.html'))||new Response('Offline',{status:503});
  }
  const isVersionedCore=/\.(?:js|mjs|css)$/.test(url.pathname)&&url.searchParams.has('v');
  if(isVersionedCore){
   try{const fresh=await fetch(e.request,{cache:'no-store'});if(fresh.ok){cache.put(e.request,fresh.clone());return fresh;}}catch(_){ }
  }
  const cached=await cache.match(e.request,{ignoreSearch:false}) || await cache.match(url.href);
  if(cached) return cached;
  const scopePath=new URL(self.registration.scope).pathname;
  const relative='./'+url.pathname.slice(scopePath.length)+(url.search||'');
  const asset=ASSETS.find(a=>a.local===relative);
  if(asset){
   try{await cacheRemote(asset);return (await cache.match(localKey(relative)));}
   catch(err){return new Response('',{status:204})}
  }
  try{const r=await fetch(e.request);if(r.ok) cache.put(e.request,r.clone());return r}
  catch(err){return (await cache.match('./index.html'))||new Response('Offline',{status:503})}
 })());
});
