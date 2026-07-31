const CACHE='photo-ia-3.0.0';
const SHELL=['./','./index.html','./styles.css?v=3.0.0','./app.js?v=3.0.0','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 const code=url.origin===self.location.origin&&(event.request.mode==='navigate'||/\.(?:html|css|js)$/.test(url.pathname));
 if(code){event.respondWith(fetch(event.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE).then(cache=>cache.put(event.request,c));return r}).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));return;}
 event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request)));
});
