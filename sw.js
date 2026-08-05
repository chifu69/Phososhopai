const CACHE='photo-ia-13-0-professional-adaptive';
const VERSION='13.0';
const CORE=[
 './','./index.html','./styles.css?v=13.0-professional-adaptive','./ui-layout.js?v=13.0-professional-adaptive','./app.js?v=13.0-professional-adaptive',
 './creative-tools.js?v=13.0-professional-adaptive','./brain.js?v=13.0-professional-adaptive',
 './opencv-engine.js?v=13.0-professional-adaptive','./smart-core.js?v=13.0-professional-adaptive','./ai-studio.js?v=13.0-professional-adaptive',
 './vision.js?v=13.0-professional-adaptive','./segmentation.js?v=13.0-professional-adaptive','./manifest.webmanifest'
];
const ASSETS=[
 {local:'./assets/vendor/fabric.min.js?v=13.0-professional-adaptive',remote:'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js',name:'Editor de capas',required:true},
 {local:'./assets/vendor/cropper.min.js?v=13.0-professional-adaptive',remote:'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js',name:'Herramienta de recorte',required:true},
 {local:'./assets/vendor/cropper.min.css?v=13.0-professional-adaptive',remote:'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css',name:'Estilos de recorte',required:true},
 {local:'./assets/vendor/tf.min.js?v=13.0-professional-adaptive',remote:'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',name:'TensorFlow móvil',required:false},
 {local:'./assets/vendor/coco-ssd.min.js?v=13.0-professional-adaptive',remote:'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',name:'Detector de objetos',required:false},
 {local:'./assets/vendor/opencv.js?v=13.0-professional-adaptive',remote:'https://docs.opencv.org/4.x/opencv.js',name:'OpenCV avanzado',required:false},
 {local:'./assets/mediapipe/tasks-vision.esm.js',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm',name:'MediaPipe opcional',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_internal.js',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.js',name:'WASM SIMD',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_internal.wasm',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.wasm',name:'Motor WASM SIMD',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_nosimd_internal.js',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_nosimd_internal.js',name:'WASM compatible',required:false},
 {local:'./assets/mediapipe/wasm/vision_wasm_nosimd_internal.wasm',remote:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_nosimd_internal.wasm',name:'Motor WASM compatible',required:false},
 {local:'./assets/models/selfie_segmenter_landscape.tflite',remote:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',name:'Modelo de persona opcional',required:false},
 {local:'./assets/models/interactive_segmenter.tflite',remote:'https://storage.googleapis.com/mediapipe-tasks/interactive_segmenter/ptm_512_hdt_ptm_woid.tflite',name:'Modelo interactivo opcional',required:false}
];
const localKey=url=>new URL(url,self.registration.scope).href;
async function fetchWithTimeout(url,ms=25000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),ms);
 try{return await fetch(url,{mode:'cors',cache:'no-store',signal:controller.signal});}
 finally{clearTimeout(timer)}
}
async function cacheRemote(asset){
 const response=await fetchWithTimeout(asset.remote,asset.required?25000:12000);
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
