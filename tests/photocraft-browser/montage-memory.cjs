const {withApp,fixture,assert}=require('./helpers.cjs');
withApp(async p=>{
 const base=[...await fixture(p,1200,1000)],head=[...await fixture(p,1000,1000)];
 const result=await p.evaluate(async({base,head})=>{
  const {EngineClient}=await import('/next/engine-client.js');const c=new EngineClient();await c.start();
  try{await c.openImage(new Uint8Array(base).buffer);const info=await c.request('beginMontage',{bytes:new Uint8Array(head).buffer});let initial,peak=0;
   const times=[];for(let i=0;i<12;i++){const start=performance.now();const f=await c.request('previewMontage',{...info.params,feather:i+1,angle:i});times.push(performance.now()-start);if(i===1)initial=f.wasmBytes;peak=Math.max(peak,f.wasmBytes)}
   await c.request('cancelMontage');return {initial,peak,growth:peak-initial,times};
  }finally{c.dispose()}
 },{base,head});
 assert(result.growth<64*1024*1024,`temporary montage previews retain too much memory: ${JSON.stringify(result)}`);
 require('node:fs').writeFileSync('/tmp/photoia-montage-memory.json',JSON.stringify(result,null,2));console.log('PASS repeated montage preview memory bounded',JSON.stringify({peak:result.peak,growth:result.growth}));
}).catch(e=>{console.error(e);process.exitCode=1});
