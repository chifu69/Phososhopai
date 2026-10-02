const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async p=>{
 await importPhoto(p,640,480);
 await p.evaluate(()=>{PhotoIA.rotate(90);PhotoIA.state.photo.set('flipX',true);PhotoIA.snapshot()});
 await p.evaluate(()=>PhotoLocalRetouch.open('local-adjust'));await p.locator('#local-exposure').fill('1');await p.setViewportSize({width:844,height:390});await p.waitForTimeout(200);
 const loc=await p.evaluate(()=>{const p=PhotoIA.state.photo,c=PhotoIA.state.canvas,r=c.upperCanvasEl.getBoundingClientRect(),v=fabric.util.transformPoint(new fabric.Point((.6-.5)*p.width,(.6-.5)*p.height),p.calcTransformMatrix());return {x:r.left+v.x,y:r.top+v.y}});
 await p.touchscreen.tap(loc.x,loc.y);await p.locator('#local-apply').click();await p.waitForFunction(()=>PhotoIA.getDocument().operations.at(-1)?.kind==='local-adjust');
 const r=await p.evaluate(async()=>{const d=PhotoIA.getDocument(),s=d.operations.at(-1).params.recipe.strokes[0].points[0],c=await PhotoRenderer.renderPhotoPixels(d,PhotoProject.resolveAsset),pixel=[...c.getContext('2d').getImageData(384,288,1,1).data];return {s,pixel}});
 assert(Math.abs(r.s.x-.6)<.015&&Math.abs(r.s.y-.6)<.015,JSON.stringify(r.s));assert.deepEqual(r.pixel,[112,214,255,255]);
 await p.evaluate(()=>PhotoLocalRetouch.open('local-adjust'));await p.evaluate(()=>PhotoProjectGallery.open());assert.equal(await p.evaluate(()=>PhotoLocalRetouch.active),false);assert.equal(await p.evaluate(()=>PhotoProject.previewing),false);
 console.log('PASS real touch mapping on rotated/flipped photo after resize and panel-close cancellation');
},{hasTouch:true}).catch(e=>{console.error(e);process.exitCode=1});
