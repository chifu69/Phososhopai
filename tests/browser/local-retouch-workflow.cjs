const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async(p,{ready})=>{
 const original=await importPhoto(p,4032,3024);
 const result=await p.evaluate(async()=>{
  PhotoIA.applyAdaptiveAdjustments({brightness:5},true);
  const stroke={points:[{x:.6,y:.6}],radius:.08,softness:.5,opacity:1};
  await PhotoIA.commitOperation({kind:'local-adjust',params:{recipe:{kind:'local-adjust',strokes:[stroke],params:{exposure:1}}}},PhotoIA.getDocumentToken());
  await PhotoIA.commitOperation({kind:'local-repair',params:{recipe:{kind:'local-repair',strokes:[{...stroke,points:[{x:.8,y:.8}],offset:{x:-.65,y:-.65}}],params:{mode:'clone'}}}},PhotoIA.getDocumentToken());
  const exported=await PhotoIA.exportDocument();
  const image=await PhotoRenderer.decodeSource(exported.blob),c=document.createElement('canvas');c.width=c.height=1;c.getContext('2d').drawImage(image.image,2419,1814,1,1,0,0,1,1);image.dispose();const pixel=[...c.getContext('2d').getImageData(0,0,1,1).data];
  const main=PhotoIA.state.photo,text=new fabric.Text('Capa',{left:main.left,top:main.top,fontSize:12});text.layerId='retouch-label';PhotoIA.state.canvas.add(text);PhotoIA.snapshot();
  await PhotoIA.commitOperation({kind:'smart',params:{engine:'local',recipe:{magic:true,exposure:.1}}},PhotoIA.getDocumentToken());
  await PhotoIA.commitOperation({kind:'crop',params:{x:.1,y:.1,width:.8,height:.8}},PhotoIA.getDocumentToken());
  await PhotoProject.saveNow({strict:true});return {id:PhotoIA.getDocument().id,width:exported.width,height:exported.height,pixel,operations:PhotoIA.getDocument().operations.map(o=>o.kind)};
 });
 assert.equal(result.width,4032);assert.equal(result.height,3024);assert(result.pixel[0]>110);assert.equal(result.pixel[3],255);assert.deepEqual(result.operations,['filters','local-adjust','local-repair','smart','crop']);
 await p.reload({waitUntil:'domcontentloaded'});await ready();await p.evaluate(()=>PhotoProjectGallery.open());await p.locator(`.project-card[data-project-id="${result.id}"] .project-card-preview`).click();await p.waitForFunction(id=>PhotoIA.getDocument()?.id===id,result.id);
 const recovered=await p.evaluate(async()=>{const d=PhotoIA.getDocument(),a=await PhotoProject.resolveAsset(d.source.assetId),e=await PhotoIA.exportDocument();return {original:[...new Uint8Array(await a.blob.arrayBuffer())],width:e.width,height:e.height,layers:d.view.objects.map(o=>o.layerId),overlay:d.view.objects.some(o=>o.photoRole==='preview-overlay')}});
 assert.deepEqual(recovered.original,original);assert.equal(recovered.width,3226);assert.equal(recovered.height,2419);assert(recovered.layers.includes('retouch-label'));assert(!recovered.overlay);
 console.log('PASS native 4032px retouch, filters/repair/Smart/crop, gallery reload, original bytes and retained layers');
}).catch(e=>{console.error(e);process.exitCode=1});
