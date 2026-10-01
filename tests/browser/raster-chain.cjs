const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async(p,{ready})=>{
 await importPhoto(p,640,480);
 const r=await p.evaluate(async()=>{
  const mask=new Uint8Array(64*48).fill(255);await PhotoSegmentation.replaceMask(mask,64,48,'Ropa');const before=PhotoIA.getDocument();
  const base=PhotoIA.state.photo._originalElement,c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');ctx.drawImage(base,0,0);ctx.fillStyle='#336699';ctx.fillRect(0,240,640,240);await PhotoIA.applyProcessedImageDataUrl(c.toDataURL(),true);
  await PhotoIA.undo();const restored=PhotoSegmentation.mask?.data.length;await PhotoIA.redo();
  await PhotoSmartCore.applyRecommendations();const result=await PhotoIA.exportDocument();const d=await PhotoRenderer.decodeSource(result.blob);ctx.drawImage(d.image,0,0);d.dispose();const pixel=[...ctx.getImageData(320,350,1,1).data];
  await PhotoSegmentation.replaceMask(mask,64,48,'Ropa');await PhotoProject.saveNow();return {selection:!!before.selection,restored,pixel};
 });assert.equal(r.selection,true);assert.equal(r.restored,64*48);assert(r.pixel[2]>r.pixel[0],'Smart erased blue raster');
 await p.reload({waitUntil:'domcontentloaded'});await ready();await p.locator('[data-resume]').click();await p.waitForFunction(()=>PhotoSegmentation.mask?.data.length===64*48);const cutout=await p.evaluate(async()=>{await PhotoSegmentation.createCutout();const layer=PhotoIA.state.canvas.getObjects().find(o=>o.layerType==='segmented-cutout');PhotoIA.snapshot();await PhotoProject.saveNow();return !!layer&&PhotoIA.getDocument().view.objects.some(o=>o.layerType==='segmented-cutout'&&o.assetId)});assert.equal(cutout,true);console.log('PASS raster hue survives Smart, selection undo and persisted mask recovery');
}).catch(e=>{console.error(e);process.exitCode=1});
