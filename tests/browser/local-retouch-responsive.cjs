const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async p=>{
 await importPhoto(p,600,800);
 for(const [width,height] of [[320,740],[390,844],[844,390],[1440,1000]]){
  await p.setViewportSize({width,height});
  for(const dark of [false,true])for(const kind of ['local-adjust','local-repair','gallery']){
   await p.evaluate(({dark,kind})=>{document.documentElement.classList.toggle('dark',dark);return kind==='gallery'?PhotoProjectGallery.open():PhotoLocalRetouch.open(kind)},{dark,kind});await p.waitForTimeout(150);
   const r=await p.evaluate(()=>{const c=PhotoIA.state.canvas,p=PhotoIA.state.photo,b=p.getBoundingRect(true,true),r=c.upperCanvasEl.getBoundingClientRect(),s=document.getElementById('pro-tool-sheet').getBoundingClientRect();return {inside:b.left>=-1&&b.top>=-1&&b.left+b.width<=c.width+1&&b.top+b.height<=c.height+1,overlap:Math.min(r.right,s.right)-Math.max(r.left,s.left)>1&&Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top)>1,overflow:document.documentElement.scrollWidth>innerWidth+1}});
   assert(r.inside,`${width} ${kind} clipped photo`);assert(!r.overlap,`${width} ${kind} overlap`);assert(!r.overflow,`${width} overflow`);
   if(width===390&&!dark)await p.screenshot({path:`/tmp/photo-${kind}.png`});
  }
 }
 console.log('PASS new panels at four viewport sizes, light/dark, complete photo without overlap');
}).catch(e=>{console.error(e);process.exitCode=1});
