/* Atomic last-project storage. A failed transaction leaves the previous project intact. */
(() => {
'use strict';
const failure=(code,cause)=>Object.assign(new Error(code),{code,cause});
const normalize=e=>typeof e?.code==='string'?e:failure(e?.name==='QuotaExceededError'?'STORAGE_FULL':'STORAGE_UNAVAILABLE',e);
function validate(s){if(!s?.current||!Array.isArray(s.past)||!Array.isArray(s.future)||s.past.length+s.future.length>39)throw failure('UNSUPPORTED_SCHEMA');for(const d of [s.current,...s.past,...s.future]){if(d.schemaVersion!==1||!d.source?.assetId||!Array.isArray(d.operations)||!Number.isInteger(d.revision)||![d.source.width,d.source.height,d.size?.width,d.size?.height].every(n=>Number.isInteger(n)&&n>0))throw failure('UNSUPPORTED_SCHEMA');}}
function open(){return new Promise((resolve,reject)=>{
 let request;try{request=indexedDB.open('photo-ia-projects',1)}catch(e){reject(normalize(e));return}
 request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('assets',{keyPath:'id'});db.createObjectStore('revisions');db.createObjectStore('metadata')};
 request.onerror=()=>reject(normalize(request.error));request.onblocked=()=>reject(failure('STORAGE_UNAVAILABLE'));
 request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve({close:()=>db.close(),
 save(session,assets){return new Promise((done,fail)=>{let tx;try{validate(session);const wanted=PhotoDocument.assetIds(session),map=new Map(assets.filter(Boolean).map(a=>[a.id,a]));for(const id of wanted)if(!(map.get(id)?.blob instanceof Blob))throw failure('MISSING_ASSET');
 tx=db.transaction(['assets','revisions','metadata'],'readwrite');tx.oncomplete=()=>done();tx.onabort=()=>fail(normalize(tx.error));tx.onerror=()=>{};
 // Only one recoverable project is retained; its complete undo/redo resources remain shared.
 const store=tx.objectStore('assets'),retained=new Set(wanted);const cursor=store.openKeyCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(!retained.has(c.key))store.delete(c.key);c.continue()}};for(const id of wanted){const request=store.getKey(id);request.onsuccess=()=>{if(request.result===undefined)store.put(map.get(id))}};tx.objectStore('revisions').clear();const key=`${session.current.id}:${session.current.revision}`;tx.objectStore('revisions').put(session,key);tx.objectStore('metadata').put(key,'latest');
 }catch(e){if(tx)tx.abort();fail(normalize(e))}})},
 loadLatest(){return new Promise((done,fail)=>{let tx,result=null,problem;try{tx=db.transaction(['assets','revisions','metadata'],'readonly');tx.oncomplete=()=>problem?fail(problem):done(result);tx.onabort=()=>fail(normalize(tx.error));tx.onerror=()=>{};
 const pointer=tx.objectStore('metadata').get('latest');pointer.onsuccess=()=>{if(!pointer.result)return;const read=tx.objectStore('revisions').get(pointer.result);read.onsuccess=()=>{try{validate(read.result);const session=read.result,ids=PhotoDocument.assetIds(session),assets=[];result={session,assets};for(const id of ids){const a=tx.objectStore('assets').get(id);a.onsuccess=()=>{if(!(a.result?.blob instanceof Blob))problem=failure('MISSING_ASSET');else assets.push(a.result)}}}catch(e){problem=normalize(e)}}};
 }catch(e){fail(normalize(e))}})}
 })};
 })}
window.PhotoProjectStore={open};
})();
