import {failure} from './protocol.js?v=0.2.0';
const DB='photo-ia-photocraft-dev';
const normalize=e=>failure(e?.name==='QuotaExceededError'?'STORAGE_FULL':'STORAGE_UNAVAILABLE',e?.message);
function open(){return new Promise((resolve,reject)=>{let req;try{req=indexedDB.open(DB,1)}catch(e){reject(normalize(e));return}let abandoned=false;req.onupgradeneeded=()=>req.result.createObjectStore('snapshots');req.onerror=()=>reject(normalize(req.error));req.onblocked=()=>{abandoned=true;reject(failure('STORAGE_UNAVAILABLE'))};req.onsuccess=()=>{if(abandoned){req.result.close();return}req.result.onversionchange=()=>req.result.close();resolve(req.result)}})}
export async function save(snapshot){
 if(!(snapshot?.engineBytes instanceof ArrayBuffer)||!snapshot.engineBytes.byteLength||!(snapshot.original instanceof Blob)||!snapshot.metadata?.id)throw failure('INVALID_INPUT');
 const db=await open();try{return await new Promise((resolve,reject)=>{let tx;try{tx=db.transaction('snapshots','readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(normalize(tx.error));tx.onerror=()=>{};tx.objectStore('snapshots').put({...snapshot,savedAt:Date.now()},'active')}catch(e){tx?.abort();reject(normalize(e))}})}finally{db.close()}
}
export async function loadLatest(){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readonly'),req=tx.objectStore('snapshots').get('active');let result=null;req.onsuccess=()=>result=req.result||null;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(normalize(tx.error))})}finally{db.close()}}
