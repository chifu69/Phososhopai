const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async(p,{ready})=>{
 await importPhoto(p,1200,900);
 const result=await p.evaluate(async()=>{
  const check=(v,m)=>{if(!v)throw Error(m)},doc=()=>PhotoIA.getDocument();
  const original=doc().source.assetId;
  const text=new fabric.Text('Prueba',{left:PhotoIA.state.canvas.width/2,top:PhotoIA.state.canvas.height/2,fontSize:20,fill:'#ff0000'});text.layerId='test-text';PhotoIA.state.canvas.add(text);PhotoIA.state.canvas.setActiveObject(text);PhotoIA.snapshot();
  const selection=PhotoIA.state.canvas.getActiveObject();const exported=await PhotoIA.exportDocument();check(exported.width===1200&&exported.height===900,'native export');check(PhotoIA.state.canvas.getActiveObject()===selection,'selection changed');
  await PhotoIA.commitOperation({kind:'smart',params:{engine:'local',recipe:{magic:true,exposure:.3}}},PhotoIA.getDocumentToken());
  await PhotoIA.commitOperation({kind:'smart',params:{engine:'local',recipe:{magic:true,exposure:.4}}},PhotoIA.getDocumentToken());check(doc().operations.length===1,'smart accumulated');
  PhotoIA.applyAdaptiveAdjustments({brightness:10},true);
  await PhotoIA.commitOperation({kind:'smart',params:{engine:'local',recipe:{magic:true,exposure:.2}}},PhotoIA.getDocumentToken());check(doc().operations.map(o=>o.kind).join(',')==='smart,filters,smart','adjustment lost');
  const c=document.createElement('canvas');c.width=600;c.height=450;c.getContext('2d').fillStyle='#226699';c.getContext('2d').fillRect(0,0,600,450);const url=c.toDataURL();
  const rev=doc().revision;await PhotoIA.applyProcessedImageDataUrl(url,false);await PhotoProject.cancelPreview();check(doc().revision===rev,'preview persisted');
  await PhotoIA.applyProcessedImageDataUrl(url,true);check(doc().size.width===600,'raster effective size');
  await PhotoIA.commitOperation({kind:'smart',params:{engine:'local',recipe:{magic:true,exposure:.3}}},PhotoIA.getDocumentToken());check(doc().operations.some(o=>o.kind==='raster-result'),'raster lost');
  await PhotoIA.undo();check(doc().operations.at(-1).kind==='raster-result','undo');await PhotoIA.redo();check(doc().operations.at(-1).kind==='smart','redo');
  await PhotoIA.commitOperation({kind:'crop',params:{x:.25,y:0,width:.5,height:1}},PhotoIA.getDocumentToken());check(doc().size.width===300&&doc().source.assetId===original,'crop original');await PhotoIA.undo();check(doc().size.width===600,'crop undo');
  const stale=PhotoIA.getDocumentToken();PhotoIA.addText();let rejected=false;try{await PhotoIA.commitOperation({kind:'preset',params:{name:'bw'}},stale)}catch(e){rejected=e.code==='STALE_RESULT'}check(rejected,'stale token accepted');
  await PhotoProject.saveNow();return {name:doc().name,revision:doc().revision,objects:doc().view.objects.length,operations:doc().operations.length};
 });
 await p.reload({waitUntil:'domcontentloaded'});await ready();await p.locator('#project-recovery').waitFor({state:'visible'});await p.locator('[data-resume]').click();await p.waitForFunction(()=>PhotoIA.getDocument()?.name==='test.png'&&PhotoIA.state.photo);
 const recovered=await p.evaluate(()=>({name:PhotoIA.getDocument().name,revision:PhotoIA.getDocument().revision,objects:PhotoIA.getDocument().view.objects.length,operations:PhotoIA.getDocument().operations.length}));assert.deepEqual(recovered,result);
 console.log('PASS native export, selection, smart chain, raster undo/redo, crop, stale token, reload recovery');
}).catch(e=>{console.error(e);process.exitCode=1});
