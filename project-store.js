/* Project catalogue and shared immutable resources; every mutation is atomic. */
(() => {
'use strict';
const failure=(code,cause)=>Object.assign(new Error(code),{code,cause});
const normalize=e=>typeof e?.code==='string'?e:failure(e?.name==='QuotaExceededError'?'STORAGE_FULL':'STORAGE_UNAVAILABLE',e);
const stores=['assets','revisions','metadata','projects'];
function validate(s){
 if(!s?.current||!Array.isArray(s.past)||!Array.isArray(s.future)||s.past.length+s.future.length>39)throw failure('UNSUPPORTED_SCHEMA');
 for(const d of [s.current,...s.past,...s.future])if(d.schemaVersion!==1||!d.id||!d.source?.assetId||!Array.isArray(d.operations)||!Number.isInteger(d.revision)||![d.source.width,d.source.height,d.size?.width,d.size?.height].every(n=>Number.isInteger(n)&&n>0))throw failure('UNSUPPORTED_SCHEMA');
}
function entry(session,key,thumbnail=null){const d=session.current;return {id:d.id,name:d.name,width:d.size.width,height:d.size.height,revision:d.revision,updatedAt:Date.now(),revisionKey:key,assetIds:PhotoDocument.assetIds(session),thumbnail}}
function originalNames(session){for(const d of [session.current,...session.past,...session.future])d.source.fileName??=d.name;return session}
function open(){return new Promise((resolve,reject)=>{
 let request,abandoned=false;
 try{request=indexedDB.open('photo-ia-projects',2)}catch(e){reject(normalize(e));return}
 request.onupgradeneeded=event=>{
  const db=request.result,tx=request.transaction;
  if(event.oldVersion===0){db.createObjectStore('assets',{keyPath:'id'});db.createObjectStore('revisions');db.createObjectStore('metadata')}
  if(event.oldVersion<2){db.createObjectStore('projects',{keyPath:'id'}).createIndex('updatedAt','updatedAt');
   if(event.oldVersion===1){const pointer=tx.objectStore('metadata').get('latest');pointer.onsuccess=()=>{if(!pointer.result)return;const read=tx.objectStore('revisions').get(pointer.result);read.onsuccess=()=>{try{validate(read.result);const s=originalNames(read.result);tx.objectStore('revisions').put(s,pointer.result);tx.objectStore('projects').put(entry(s,pointer.result));tx.objectStore('metadata').put(s.current.id,'activeProject')}catch(e){tx.abort()}}}}
  }
 };
 request.onerror=()=>reject(normalize(request.error));request.onblocked=()=>{abandoned=true;reject(failure('STORAGE_BLOCKED'))};
 request.onsuccess=()=>{
  const db=request.result;if(abandoned){db.close();return}db.onversionchange=()=>db.close();
  function transaction(mode,work){return new Promise((done,fail)=>{let tx,result,problem;try{tx=db.transaction(stores,mode);tx.oncomplete=()=>done(result);tx.onabort=()=>fail(problem||normalize(tx.error));tx.onerror=()=>{};const abort=e=>{problem=normalize(e);tx.abort()};work(tx,value=>result=value,abort)}catch(e){if(tx)try{tx.abort()}catch(_){}fail(normalize(e))}})}
  function collect(tx){const read=tx.objectStore('projects').getAll();read.onsuccess=()=>{const assets=new Set(read.result.flatMap(p=>p.assetIds)),revisions=new Set(read.result.map(p=>p.revisionKey));for(const [name,keep]of [['assets',assets],['revisions',revisions]]){const store=tx.objectStore(name),cursor=store.openKeyCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(!keep.has(c.key))store.delete(c.key);c.continue()}}}}}
  function loadIn(tx,id,result,abort){const project=tx.objectStore('projects').get(id);project.onsuccess=()=>{if(!project.result){result(null);return}const read=tx.objectStore('revisions').get(project.result.revisionKey);read.onsuccess=()=>{try{validate(read.result);const session=read.result,assets=[];result({session,assets});for(const id of PhotoDocument.assetIds(session)){const a=tx.objectStore('assets').get(id);a.onsuccess=()=>{if(!(a.result?.blob instanceof Blob))abort(failure('MISSING_ASSET'));else assets.push(a.result)}}}catch(e){abort(e)}}}}
  resolve({close:()=>db.close(),
   save(session,assets,{thumbnail}={}){
    try{validate(session)}catch(e){return Promise.reject(e)}
    const captured=originalNames(structuredClone(session)),wanted=PhotoDocument.assetIds(captured),map=new Map(assets.filter(Boolean).map(a=>[a.id,a]));
    if(wanted.some(id=>!(map.get(id)?.blob instanceof Blob)))return Promise.reject(failure('MISSING_ASSET'));
    return transaction('readwrite',(tx,result,abort)=>{
     const projects=tx.objectStore('projects'),old=projects.get(captured.current.id);
     old.onsuccess=()=>{try{
      if(old.result&&old.result.revision>captured.current.revision){abort(failure('STALE_RESULT'));return}
      const key=`${captured.current.id}:${captured.current.revision}`,assetStore=tx.objectStore('assets');
      for(const id of wanted){const read=assetStore.getKey(id);read.onsuccess=()=>{if(read.result===undefined)assetStore.put(map.get(id))}}
      tx.objectStore('revisions').put(captured,key);projects.put(entry(captured,key,thumbnail===undefined?old.result?.thumbnail||null:thumbnail));
      const active=tx.objectStore('metadata').get('activeProject');active.onsuccess=()=>{try{if(!active.result)tx.objectStore('metadata').put(captured.current.id,'activeProject')}catch(e){abort(e)}};collect(tx);
     }catch(e){abort(e)}};
    });
   },
   list(){return transaction('readonly',(tx,result)=>{const r=tx.objectStore('projects').getAll();r.onsuccess=()=>result(r.result.sort((a,b)=>b.updatedAt-a.updatedAt))})},
   load(id){return transaction('readonly',(tx,result,abort)=>loadIn(tx,id,result,abort))},
   loadLatest(){return transaction('readonly',(tx,result,abort)=>{const r=tx.objectStore('metadata').get('activeProject');r.onsuccess=()=>r.result?loadIn(tx,r.result,result,abort):result(null)})},
   activate(id){return transaction('readwrite',(tx,result,abort)=>{const r=tx.objectStore('projects').get(id);r.onsuccess=()=>{if(!r.result){abort(failure('MISSING_PROJECT'));return}tx.objectStore('metadata').put(id,'activeProject')}})},
   rename(id,name){name=String(name||'').trim();if(!name||name.length>80)return Promise.reject(failure('INVALID_NAME'));return transaction('readwrite',(tx,result,abort)=>{const projects=tx.objectStore('projects'),r=projects.get(id);r.onsuccess=()=>{if(!r.result){abort(failure('MISSING_PROJECT'));return}const p=r.result,read=tx.objectStore('revisions').get(p.revisionKey);read.onsuccess=()=>{try{validate(read.result);const s=originalNames(read.result);for(const d of [s.current,...s.past,...s.future])d.name=name;p.name=name;p.updatedAt=Date.now();tx.objectStore('revisions').put(s,p.revisionKey);projects.put(p)}catch(e){abort(e)}}}})},
   remove(id){return transaction('readwrite',(tx,result)=>{tx.objectStore('projects').delete(id);const r=tx.objectStore('metadata').get('activeProject');r.onsuccess=()=>{if(r.result===id){const all=tx.objectStore('projects').getAll();all.onsuccess=()=>{const latest=all.result.sort((a,b)=>b.updatedAt-a.updatedAt)[0];if(latest)tx.objectStore('metadata').put(latest.id,'activeProject');else tx.objectStore('metadata').delete('activeProject')}}};collect(tx)})}
  });
 };
})}
window.PhotoProjectStore={open};
})();
