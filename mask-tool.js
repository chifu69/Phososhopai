(() => {
'use strict';
const VERSION='15.40.0';
const $=id=>document.getElementById(id);

function boot(){
  const api=window.PhotoIA;
  if(!api?.state?.canvas) return;
  const canvas=api.state.canvas;

  let active=false;      // true while Mask mode is the current canvas mode
  let target=null;       // the fabric object currently being masked
  let brushMode='hide';  // 'hide' paints transparency, 'reveal' restores it
  let brushSize=40, brushFeather=.6, brushOpacity=1;
  let painting=false, lastPoint=null, strokeDirty=false;

  function maskSize(){return {w:Math.max(1,Math.round(canvas.getWidth())),h:Math.max(1,Math.round(canvas.getHeight()))}}

  // Recreate (or recover) the paintable mask canvas for an object. If the
  // object already has a clipPath — e.g. restored from undo/redo or a
  // reloaded project, where our custom __maskCanvas reference does not
  // survive serialization — repaint the new canvas from that clipPath's
  // current pixels instead of starting over from a blank mask.
  function ensureMaskCanvas(obj){
    const {w,h}=maskSize();
    if(obj.__maskCanvas&&obj.__maskCanvas.width===w&&obj.__maskCanvas.height===h) return obj.__maskCanvas;
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d');
    let recovered=false;
    if(obj.clipPath&&typeof obj.clipPath.getElement==='function'){
      try{const el=obj.clipPath.getElement();if(el){ctx.drawImage(el,0,0,w,h);recovered=true}}catch(_){/* fall through to blank */}
    }
    if(!recovered){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h)} // fully opaque = fully visible
    obj.__maskCanvas=c;
    return c;
  }
  function attachClip(obj){
    const c=ensureMaskCanvas(obj);
    const already=obj.clipPath&&typeof obj.clipPath.getElement==='function'&&obj.clipPath.getElement()===c;
    if(!already){
      obj.clipPath=new fabric.Image(c,{left:0,top:0,originX:'left',originY:'top',absolutePositioned:true,objectCaching:false,selectable:false,evented:false});
    }
    obj.objectCaching=false;
    obj.dirty=true;
    canvas.requestRenderAll();
  }

  function paintAt(x,y){
    if(!target?.__maskCanvas) return;
    const ctx=target.__maskCanvas.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation=brushMode==='hide'?'destination-out':'source-over';
    const inner=Math.max(0,Math.min(.95,1-brushFeather));
    const grad=ctx.createRadialGradient(x,y,0,x,y,Math.max(1,brushSize));
    const color=brushMode==='hide'?'0,0,0':'255,255,255';
    grad.addColorStop(0,`rgba(${color},${brushOpacity})`);
    grad.addColorStop(inner,`rgba(${color},${brushOpacity})`);
    grad.addColorStop(1,`rgba(${color},0)`);
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.arc(x,y,Math.max(1,brushSize),0,Math.PI*2);ctx.fill();
    ctx.restore();
    strokeDirty=true;
  }
  function strokeTo(x,y){
    if(lastPoint){
      const dx=x-lastPoint.x,dy=y-lastPoint.y,dist=Math.hypot(dx,dy);
      const step=Math.max(2,brushSize*.25),steps=Math.max(1,Math.floor(dist/step));
      for(let i=1;i<=steps;i++) paintAt(lastPoint.x+dx*i/steps,lastPoint.y+dy*i/steps);
    }else paintAt(x,y);
    lastPoint={x,y};
  }

  function beginMask(){
    target=canvas.getActiveObject()||api.state.photo;
    if(!target){api.toast('Abre una foto, o selecciona una capa en Move antes de pintar la máscara.');return}
    // Selection handles/border would sit on top of the brush and get in the
    // way while painting; hide them for the duration of the mask session.
    target.__maskPrevControls={hasControls:target.hasControls,hasBorders:target.hasBorders};
    target.hasControls=false;target.hasBorders=false;
    attachClip(target);
    active=true;
    updateButtons();
  }
  function endMask(){
    if(target?.__maskPrevControls){
      target.hasControls=target.__maskPrevControls.hasControls;
      target.hasBorders=target.__maskPrevControls.hasBorders;
      delete target.__maskPrevControls;
      canvas.requestRenderAll();
    }
    active=false;lastPoint=null;painting=false;
    target=null;
  }
  function updateButtons(){
    const has=!!target;
    ['mask-reset','mask-invert','mask-remove'].forEach(id=>{const el=$(id);if(el)el.disabled=!has});
  }

  canvas.on('mouse:down',opt=>{
    if(!active||!target) return;
    painting=true;lastPoint=null;
    const p=canvas.getPointer(opt.e);
    strokeTo(p.x,p.y);
    canvas.requestRenderAll();
  });
  canvas.on('mouse:move',opt=>{
    if(!active||!painting||!target) return;
    const p=canvas.getPointer(opt.e);
    strokeTo(p.x,p.y);
    canvas.requestRenderAll();
  });
  function finishStroke(){
    if(!painting) return;
    painting=false;lastPoint=null;
    if(strokeDirty){strokeDirty=false;api.snapshot()}
  }
  canvas.on('mouse:up',finishStroke);
  canvas.upperCanvasEl?.addEventListener('pointerleave',finishStroke);

  function reset(){
    if(!target) return;
    const c=ensureMaskCanvas(target),ctx=c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
    attachClip(target);
    api.snapshot();
    api.toast('Máscara restablecida: capa totalmente visible');
  }
  function invert(){
    if(!target?.__maskCanvas) return;
    const c=target.__maskCanvas,ctx=c.getContext('2d'),im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
    for(let i=3;i<d.length;i+=4) d[i]=255-d[i]; // invert alpha only
    ctx.putImageData(im,0,0);
    attachClip(target);
    api.snapshot();
    api.toast('Máscara invertida');
  }
  function removeMask(){
    if(!target) return;
    target.clipPath=null;target.__maskCanvas=null;target.dirty=true;
    canvas.requestRenderAll();
    api.snapshot();
    api.toast('Máscara eliminada');
  }

  $('mask-reset')?.addEventListener('click',reset);
  $('mask-invert')?.addEventListener('click',invert);
  $('mask-remove')?.addEventListener('click',removeMask);
  document.querySelectorAll('[data-mask-brush]').forEach(btn=>btn.addEventListener('click',()=>{
    brushMode=btn.dataset.maskBrush;
    document.querySelectorAll('[data-mask-brush]').forEach(b=>b.classList.toggle('active',b===btn));
  }));
  const sizeInput=$('mask-brush-size'),featherInput=$('mask-brush-feather'),opacityInput=$('mask-brush-opacity');
  sizeInput?.addEventListener('input',()=>{brushSize=Number(sizeInput.value);const out=$('mask-brush-size-out');if(out)out.textContent=sizeInput.value});
  featherInput?.addEventListener('input',()=>{brushFeather=Number(featherInput.value)/100;const out=$('mask-brush-feather-out');if(out)out.textContent=featherInput.value+'%'});
  opacityInput?.addEventListener('input',()=>{brushOpacity=Number(opacityInput.value)/100;const out=$('mask-brush-opacity-out');if(out)out.textContent=opacityInput.value+'%'});

  document.addEventListener('photoia:canvas-mode-changed',e=>{
    if(e.detail?.mode==='mask') beginMask();
    else if(active) endMask();
  });
  document.addEventListener('photoia:image-cleared',()=>{active=false;target=null;updateButtons()});
  updateButtons();
}
window.addEventListener('photoia-ready',boot,{once:true});
})();
