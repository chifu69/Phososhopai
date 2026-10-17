const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('legacy worker does not intercept studio navigation or generated assets',()=>{
 const handlers={};const sandbox={URL,location:{origin:'https://example.test'},self:{registration:{scope:'https://example.test/photo/'},addEventListener:(k,f)=>handlers[k]=f},caches:{open:async()=>{throw Error('legacy cache touched')}},Response};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),sandbox);
 for(const path of ['next/','next/editor.js?v=0.2.0','next/engine/photoia_photocraft_bridge_bg.wasm?v=0.2.0']){
  let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://example.test/photo/'+path,mode:'navigate'},respondWith:()=>{intercepted=true}});assert.equal(intercepted,false,path);
 }
});
