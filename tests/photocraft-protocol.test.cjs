const test=require('node:test'),assert=require('node:assert/strict');
let EngineClient;test.before(async()=>{({EngineClient}=await import('../next/engine-client.js'))});
class FakeWorker{
 constructor(){this.listeners={};queueMicrotask(()=>this.emit('message',{data:{type:'ready'}}))}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
 emit(k,v){for(const f of this.listeners[k]||[])f(v)}
 postMessage(m){this.last=m;this.sent??=[];this.sent.push(m)}
 answer(m,result={},revision=1){this.emit('message',{data:{protocol:1,id:m.id,epoch:m.epoch,revision,ok:true,result}})}
 terminate(){this.terminated=true}
}
const tick=()=>new Promise(r=>setImmediate(r));
test('serial revision and stale navigation',async()=>{const w=new FakeWorker(),c=new EngineClient(()=>w);await c.start();const open=c.openImage(new Uint8Array([1]).buffer);await tick();w.answer(w.last,{id:'A'},1);await open;
 const edit=c.request('exposure',{ev:1});await tick();const old=w.last;const next=c.openImage(new Uint8Array([2]).buffer);await assert.rejects(edit,{code:'STALE_RESULT'});await tick();w.answer(old,{id:'A'},2);await tick();assert.equal(w.last.action,'openImage');w.answer(w.last,{id:'B'},1);assert.equal((await next).id,'B');assert.equal(c.revision,1);c.dispose()});
test('worker failure rejects pending and blocks further edits',async()=>{const w=new FakeWorker(),c=new EngineClient(()=>w);await c.start();const pending=c.request('inspect');await tick();w.emit('error',{message:'crash',preventDefault(){}});await assert.rejects(pending,{code:'ENGINE_UNAVAILABLE'});await assert.rejects(c.request('inspect'),{code:'ENGINE_UNAVAILABLE'});c.dispose()});
test('wrong epoch cannot complete pending request',async()=>{const w=new FakeWorker(),c=new EngineClient(()=>w);await c.start();const p=c.request('inspect');await tick();const m=w.last;w.answer({...m,epoch:999},{wrong:true},55);w.answer(m,{right:true},0);assert.deepEqual(await p,{right:true});assert.equal(c.revision,0);c.dispose()});
