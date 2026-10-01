const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async(p)=>{
 await importPhoto(p,4032,3024);
 const before=await p.evaluate(async()=>{const p=PhotoIA.state.photo,o=new fabric.Rect({left:p.left-50,top:p.top-20,width:30,height:20,fill:'#00ff00',angle:15});o.layerId='rect';PhotoIA.state.canvas.add(o);PhotoIA.snapshot();const e=await PhotoIA.exportDocument();return {w:e.width,h:e.height,data:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await e.blob.arrayBuffer()))]}});
 await p.setViewportSize({width:1440,height:1000});await p.waitForTimeout(300);
 const after=await p.evaluate(async()=>{const e=await PhotoIA.exportDocument();return {w:e.width,h:e.height,data:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await e.blob.arrayBuffer()))]}});assert.equal(after.w,4032);assert.equal(after.h,3024);assert.deepEqual(after,before,'viewport changed export pixels');
 const cases=await p.evaluate(async()=>{
  const check=(v,m)=>{if(!v)throw Error(m)};
  PhotoIA.applyAdaptiveAdjustments({brightness:10},true);const bright=await PhotoIA.exportDocument();const brightImage=await PhotoRenderer.decodeSource(bright.blob),sample=document.createElement('canvas');sample.width=sample.height=1;sample.getContext('2d').drawImage(brightImage.image,3500,2800,1,1,0,0,1,1);brightImage.dispose();const rgb=sample.getContext('2d').getImageData(0,0,1,1).data;check(rgb[0]>=80&&rgb[0]<=83&&rgb[3]===255,'native filters outside GPU tile');await PhotoIA.undo();
  PhotoIA.rotate(90);await PhotoIA.commitOperation({kind:'crop',params:{x:0,y:0,width:.5,height:.5}},PhotoIA.getDocumentToken());let e=await PhotoIA.exportDocument();check(e.width===1512&&e.height===2016,'rotated crop dimensions');
  const c=document.createElement('canvas');c.width=120;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,60,80);const png=await new Promise(r=>c.toBlob(r));await PhotoIA.loadFile(new File([png],'alpha.png',{type:'image/png'}));e=await PhotoIA.exportDocument();let d=await PhotoRenderer.decodeSource(e.blob);ctx.clearRect(0,0,120,80);ctx.drawImage(d.image,0,0);d.dispose();check(ctx.getImageData(90,40,1,1).data[3]===0,'PNG alpha lost');
  e=await PhotoIA.exportDocument({format:'image/jpeg'});d=await PhotoRenderer.decodeSource(e.blob);ctx.clearRect(0,0,120,80);ctx.drawImage(d.image,0,0);d.dispose();const pixel=ctx.getImageData(90,40,1,1).data;check(pixel[0]>250&&pixel[1]>250&&pixel[2]>250&&pixel[3]===255,'JPEG background');
  const jpg=await new Promise(r=>c.toBlob(r,'image/jpeg')),raw=new Uint8Array(await jpg.arrayBuffer());
  // APP1 Exif: little-endian TIFF, orientation=6 (90 clockwise).
  const exif=Uint8Array.from([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
  const file=new File([raw.slice(0,2),exif,raw.slice(2)],'rotated.jpg',{type:'image/jpeg'});await PhotoIA.loadFile(file);check(PhotoIA.getDocument().source.width===80&&PhotoIA.getDocument().source.height===120,'EXIF oriented dimensions');e=await PhotoIA.exportDocument();check(e.width===80&&e.height===120,'EXIF double rotation');
  let missing=false;const doc=PhotoIA.getDocument();doc.source.assetId='missing';try{await PhotoRenderer.renderExport(doc,PhotoIA.resolveAsset)}catch(e){missing=e.code==='MISSING_ASSET'}check(missing,'missing asset ignored');
  let memory=false;doc.size={width:20000,height:20000};try{await PhotoRenderer.renderExport(doc,PhotoIA.resolveAsset)}catch(e){memory=e.code==='EXPORT_TOO_LARGE'}check(memory,'memory error missing');return true;
 });assert.equal(cases,true);console.log('PASS full-size viewport-invariant export, rotated crop, alpha, JPEG white, EXIF and typed errors');
}).catch(e=>{console.error(e);process.exitCode=1});
