const {withApp,fixture,assert}=require('./helpers.cjs');
withApp(async p=>{
 const original=await fixture(p,4032,3024);const r=await p.evaluate(async data=>{
 const {EngineClient}=await import('/next/engine-client.js');const c=new EngineClient(),timings={};let t=performance.now();await c.start();timings.boot=performance.now()-t;
 try{t=performance.now();const info=await c.openImage(new Uint8Array(data).buffer);timings.open=performance.now()-t;const renderTimes=[];for(let i=0;i<5;i++){t=performance.now();await c.request('renderPreview');renderTimes.push(performance.now()-t)}
 await c.request('exposure',{ev:.5});const layerInfo=await c.request('addLayer',{name:'Capa de prueba'});const layer=layerInfo.layers.at(-1);await c.request('setLayerVisibility',{layer:layer.id,visible:false});await c.request('undo');await c.request('redo');
 const project=await c.request('serialize');await c.openProject(project.bytes);const recovered=await c.request('inspect');const frame=await c.request('renderPreview');t=performance.now();const image=await c.request('exportImage');timings.export=performance.now()-t;
 const bitmap=await createImageBitmap(new Blob([image.bytes],{type:image.mime})),canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(bitmap,0,0,1,1,0,0,1,1);const alpha=canvas.getContext('2d').getImageData(0,0,1,1).data[3];bitmap.close();
 renderTimes.sort((a,b)=>a-b);timings.previewP50=renderTimes[2];timings.previewP95=renderTimes[4];return {info,recovered,width:image.width,height:image.height,alpha,wasmBytes:frame.wasmBytes,timings};
 }finally{c.dispose()}
 },[...original]);assert.equal(r.width,4032);assert.equal(r.height,3024);assert.equal(r.alpha,0);assert.equal(r.recovered.layers.length,2);assert.equal(r.recovered.layers.at(-1).visible,false);require('node:fs').writeFileSync('/tmp/photoia-next-metrics.json',JSON.stringify(r,null,2));console.log('PASS native 12MP PhotoCraft edit/layers/undo/save/reopen/export; metrics',JSON.stringify(r.timings));
}).catch(e=>{console.error(e);process.exitCode=1});
