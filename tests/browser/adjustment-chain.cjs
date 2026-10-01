const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async p=>{
 await importPhoto(p,400,300);
 const result=await p.evaluate(async()=>{
  await PhotoSmartCore.applyRecommendations();const a=PhotoIA.getDocument();await PhotoSmartCore.applyRecommendations();const b=PhotoIA.getDocument();
  PhotoIA.applyAdaptiveAdjustments({brightness:10},true);await PhotoSmartCore.applyRecommendations();const c=PhotoIA.getDocument();
  const t=PhotoIA.getDocumentToken();const pending=PhotoIA.commitOperation({kind:'preset',params:{name:'bw'}},t);PhotoIA.addText();let stale=false;try{await pending}catch(e){stale=e.code==='STALE_RESULT'};
  return {first:a.operations.map(o=>o.kind),second:b.operations.map(o=>o.kind),third:c.operations.map(o=>o.kind),stale,objects:PhotoIA.getDocument().view.objects.length};
 });assert.deepEqual(result.first,['smart']);assert.deepEqual(result.second,['smart']);assert.deepEqual(result.third,['smart','filters','smart']);assert.equal(result.stale,true);assert(result.objects>=2);console.log('PASS actual Smart button chain and stale asynchronous commit');
}).catch(e=>{console.error(e);process.exitCode=1});
