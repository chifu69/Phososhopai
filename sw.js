const CACHE='photo-ia-8.6.0-local-first-core';
const CORE=[
 './','./index.html','./styles.css?v=8.6.0-local-first-core','./app.js?v=8.6.0-local-first-core',
 './creative-tools.js?v=8.6.0-local-first-core','./brain.js?v=8.6.0-local-first-core',
 './smart-core.js?v=8.6.0-local-first-core','./ai-studio.js?v=8.6.0-local-first-core',
 './vision.js?v=8.6.0-local-first-core','./segmentation.js?v=8.6.0-local-first-core','./manifest.webmanifest'
];
const LOCAL_ASSETS={
 './assets/vendor/fabric.min.js?v=8.6.0':'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js',
 './assets/vendor/cropper.min.js?v=8.6.0':'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js',
 './assets/vendor/cropper.min.css?v=8.6.0':'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css',
 './assets/vendor/tf.min.js?v=8.6.0':'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
 './assets/vendor/coco-ssd.min.js?v=8.6.0':'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',
 './assets/vendor/opencv.js?v=8.6.0':'https://docs.opencv.org/4.x/opencv.js',
 './assets/mediapipe/tasks-vision.esm.js':'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm',
 './assets/mediapipe/wasm/vision_wasm_internal.js':'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.js',
 './assets/mediapipe/wasm/vision_wasm_internal.wasm':'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_internal.wasm',
 './assets/mediapipe/wasm/vision_wasm_nosimd_internal.js':'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_nosimd_internal.js',
 './assets/mediapipe/wasm/vision_wasm_nosimd_internal.wasm':'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/vision_wasm_nosimd_internal.wasm',
 './assets/models/selfie_segmenter_landscape.tflite':'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
 './assets/models/interactive_segmenter.tflite':'https://storage.googleapis.com/mediapipe-tasks/interactive_segmenter/ptm_512_hdt_ptm_woid.tflite'
};
const localKey=url=>new URL(url,self.registration.scope).href;
async function cacheRemoteAsLocal(local,remote){
 const response=await fetch(remote,{mode:'cors',cache:'no-store'});
 if(!response.ok) throw new Error(`${response.status} ${remote}`);
 const cache=await caches.open(CACHE);
 await cache.put(localKey(local),response.clone());
}
async function notify(data){
 const clients=await self.clients.matchAll({includeUncontrolled:true,type:'window'});
 clients.forEach(c=>c.postMessage(data));
}
async function installLocalCore(){
 const entries=Object.entries(LOCAL_ASSETS), total=entries.length;
 let done=0;
 for(const [local,remote] of entries){
  const cache=await caches.open(CACHE);
  const existing=await cache.match(localKey(local));
  if(!existing) await cacheRemoteAsLocal(local,remote);
  done++;
  await notify({type:'LOCAL_CORE_PROGRESS',done,total,label:`Guardando herramienta ${done} de ${total}…`});
 }
 await notify({type:'LOCAL_CORE_READY'});
}
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{
 if(e.data?.type==='INSTALL_LOCAL_CORE') e.waitUntil(installLocalCore().catch(async err=>{console.error(err);await notify({type:'LOCAL_CORE_ERROR',message:String(err)})}));
});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET') return;
 const url=new URL(e.request.url);
 if(url.origin!==location.origin) return;
 e.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const cached=await cache.match(e.request,{ignoreSearch:false}) || await cache.match(url.href);
  if(cached) return cached;
  const relative='./'+url.pathname.slice(new URL(self.registration.scope).pathname.length)+(url.search||'');
  const remote=LOCAL_ASSETS[relative];
  if(remote){
   try{await cacheRemoteAsLocal(relative,remote);return (await cache.match(localKey(relative)));}
   catch(err){return new Response('PHOTO IA local asset unavailable',{status:503,headers:{'Content-Type':'text/plain'}})}
  }
  try{
   const r=await fetch(e.request); if(r.ok) cache.put(e.request,r.clone()); return r;
  }catch(err){return (await cache.match('./index.html')) || new Response('Offline',{status:503});}
 })());
});
