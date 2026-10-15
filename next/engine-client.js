import {ACTIONS,failure} from './protocol.js';
export class EngineClient{
 constructor(factory=()=>new Worker(new URL('./engine-worker.js',import.meta.url),{type:'module'})){this.factory=factory;this.epoch=0;this.revision=0;this.nextId=0;this.pending=new Map();this.tail=Promise.resolve();this.available=false}
 start(){
  if(this.ready)return this.ready;
  this.ready=new Promise((resolve,reject)=>{this.readyReject=reject;this.worker=this.factory();this.bootTimer=setTimeout(()=>this.fail(),60000);
   this.worker.addEventListener('message',({data:m})=>{
    if(m?.type==='ready'){clearTimeout(this.bootTimer);this.available=true;resolve();return}
    if(m?.type==='fatal'){this.fail();return}
    const p=this.pending.get(m?.id);if(!p||m.protocol!==1||m.epoch!==p.epoch)return;
    this.pending.delete(m.id);clearTimeout(p.timer);
    if(m.epoch!==this.epoch){p.reject(failure('STALE_RESULT'));return}
    if(!m.ok){p.reject(failure(m.error?.code||'INVALID_INPUT',m.error?.message));return}
    if(!Number.isSafeInteger(m.revision)||m.revision<0){p.reject(failure('INVALID_INPUT'));return}
    this.revision=m.revision;p.resolve(m.result);
   });this.worker.addEventListener('error',e=>{e.preventDefault?.();this.fail()});this.worker.addEventListener('messageerror',()=>this.fail());
  });return this.ready;
 }
 fail(){clearTimeout(this.bootTimer);this.available=false;this.readyReject?.(failure('ENGINE_UNAVAILABLE'));for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(failure('ENGINE_UNAVAILABLE'))}this.pending.clear();this.worker?.terminate()}
 request(action,payload={},transfer=[]){
  const epoch=this.epoch;
  const job=this.tail.catch(()=>{}).then(()=>{
   if(epoch!==this.epoch)throw failure('STALE_RESULT');if(!this.available)throw failure('ENGINE_UNAVAILABLE');if(!ACTIONS.has(action))throw failure('INVALID_INPUT');
   return new Promise((resolve,reject)=>{const id=++this.nextId,timer=setTimeout(()=>this.fail(),120000);this.pending.set(id,{resolve,reject,epoch,timer});
    try{this.worker.postMessage({protocol:1,id,epoch,expectedRevision:this.revision,action,payload},transfer)}catch(e){clearTimeout(timer);this.pending.delete(id);reject(failure('INVALID_INPUT',e.message))}
   });
  });this.tail=job.catch(()=>{});return job;
 }
 newEpoch(){this.epoch++;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(failure('STALE_RESULT'))}this.pending.clear()}
 openImage(bytes){this.newEpoch();return this.request('openImage',{bytes},[bytes])}
 openProject(bytes){this.newEpoch();return this.request('openProject',{bytes},[bytes])}
 dispose(){this.newEpoch();this.fail()}
}
