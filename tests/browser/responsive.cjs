const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async p=>{
 await importPhoto(p,800,1200);
 for(const [width,height] of [[320,740],[390,844],[844,390],[1440,1000]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(350);
  for(const dark of [false,true]){
   await p.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
   const r=await p.evaluate(()=>{const p=PhotoIA.state.photo,c=PhotoIA.state.canvas,r=p.getBoundingRect(true,true),save=document.getElementById('project-save-status'),rect=save.getBoundingClientRect();return {left:r.left,top:r.top,right:r.left+r.width,bottom:r.top+r.height,width:c.width,height:c.height,saveVisible:!!save.getClientRects().length&&rect.bottom<innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}});
   assert(r.left>=-1&&r.top>=-1&&r.right<=r.width+1&&r.bottom<=r.height+1,JSON.stringify(r));assert(r.saveVisible,'save status hidden');assert(!r.overflow,'horizontal overflow');
  }
  if(width===390)await p.screenshot({path:'/tmp/photo-project-mobile.png'});
 }
 console.log('PASS complete portrait and visible save state at 320, 390, landscape and desktop, light/dark');
}).catch(e=>{console.error(e);process.exitCode=1});
