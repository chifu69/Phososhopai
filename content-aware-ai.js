(() => {
'use strict';
const VERSION='15.40.1';

// ---------------------------------------------------------------------------
// Pure helpers. Kept DOM-free so regression tests can require this file.
// ---------------------------------------------------------------------------
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function getMaskBounds(alpha,width,height,threshold=8){
  if(!alpha||!width||!height)return null;
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++){
    const row=y*width;
    for(let x=0;x<width;x++){
      if(alpha[row+x]>threshold){
        if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      }
    }
  }
  return maxX<0?null:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,right:maxX+1,bottom:maxY+1};
}
function expandBounds(bounds,padding,width,height){
  if(!bounds)return null;
  const p=Math.max(0,Math.round(padding||0));
  const x=clamp(Math.floor(bounds.x-p),0,width),y=clamp(Math.floor(bounds.y-p),0,height);
  const r=clamp(Math.ceil(bounds.x+bounds.width+p),0,width),b=clamp(Math.ceil(bounds.y+bounds.height+p),0,height);
  return {x,y,width:Math.max(1,r-x),height:Math.max(1,b-y),right:r,bottom:b};
}
function dilateBinary(src,width,height,radius){
  const r=Math.max(0,Math.round(radius||0));
  if(!r)return Uint8Array.from(src);
  const stride=width+1, integral=new Uint32Array((width+1)*(height+1));
  for(let y=0;y<height;y++){
    let row=0;
    for(let x=0;x<width;x++){
      row+=src[y*width+x]?1:0;
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    }
  }
  const out=new Uint8Array(width*height);
  for(let y=0;y<height;y++){
    const y0=Math.max(0,y-r),y1=Math.min(height-1,y+r);
    for(let x=0;x<width;x++){
      const x0=Math.max(0,x-r),x1=Math.min(width-1,x+r);
      const sum=integral[(y1+1)*stride+x1+1]-integral[y0*stride+x1+1]-integral[(y1+1)*stride+x0]+integral[y0*stride+x0];
      if(sum)out[y*width+x]=255;
    }
  }
  return out;
}
function boxBlurMask(src,width,height,radius){
  const r=Math.max(0,Math.round(radius||0));
  if(!r)return Uint8ClampedArray.from(src);
  const stride=width+1, integral=new Uint32Array((width+1)*(height+1));
  for(let y=0;y<height;y++){
    let row=0;
    for(let x=0;x<width;x++){
      row+=src[y*width+x];
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    }
  }
  const out=new Uint8ClampedArray(width*height);
  for(let y=0;y<height;y++){
    const y0=Math.max(0,y-r),y1=Math.min(height-1,y+r);
    for(let x=0;x<width;x++){
      const x0=Math.max(0,x-r),x1=Math.min(width-1,x+r);
      const sum=integral[(y1+1)*stride+x1+1]-integral[y0*stride+x1+1]-integral[(y1+1)*stride+x0]+integral[y0*stride+x0];
      out[y*width+x]=Math.round(sum/((x1-x0+1)*(y1-y0+1)));
    }
  }
  return out;
}
function computeScale(width,height,maxSide=768){
  const m=Math.max(width,height);return m>maxSide?maxSide/m:1;
}
const PhotoAIFillMath={getMaskBounds,expandBounds,dilateBinary,boxBlurMask,computeScale};
if(typeof module!=='undefined'&&module.exports)module.exports=PhotoAIFillMath;
if(typeof window==='undefined')return;
window.PhotoAIFillMath=PhotoAIFillMath;

const $=id=>document.getElementById(id);
function boot(){
  const api=window.PhotoIA;
  const canvas=api?.state?.canvas;
  if(!canvas)return;

  let active=false,painting=false,lastPoint=null,brushMode='paint',brushSize=44;
  let sourceW=0,sourceH=0,maskCanvas=null,maskCtx=null,overlayCanvas=null,overlayCtx=null,overlayObj=null;
  let inferenceToken=0;

  function setStatus(text,kind=''){
    const el=$('aifill-status');if(!el)return;
    el.textContent=text;el.dataset.kind=kind;
  }
  function setBusy(on){
    ['aifill-apply','aifill-clear','aifill-cancel','aifill-install-model'].forEach(id=>{const el=$(id);if(el)el.disabled=!!on});
  }
  function sourceDimensions(){
    const p=api.state.photo;if(!p)return {w:0,h:0};
    return {w:Math.max(1,Math.round(p.width||0)),h:Math.max(1,Math.round(p.height||0))};
  }
  function ensureCanvases(){
    const {w,h}=sourceDimensions();if(!w||!h)return false;
    if(maskCanvas&&sourceW===w&&sourceH===h)return true;
    sourceW=w;sourceH=h;
    maskCanvas=document.createElement('canvas');maskCanvas.width=w;maskCanvas.height=h;maskCtx=maskCanvas.getContext('2d',{willReadFrequently:true});
    overlayCanvas=document.createElement('canvas');overlayCanvas.width=w;overlayCanvas.height=h;overlayCtx=overlayCanvas.getContext('2d');
    removeOverlay();return true;
  }
  function clearCanvases(){
    if(maskCtx)maskCtx.clearRect(0,0,sourceW,sourceH);
    if(overlayCtx)overlayCtx.clearRect(0,0,sourceW,sourceH);
    if(overlayObj){overlayObj.dirty=true;canvas.requestRenderAll()}
  }
  function removeOverlay(){
    if(overlayObj){canvas.remove(overlayObj);overlayObj=null;canvas.requestRenderAll()}
  }
  function syncOverlayTransform(){
    const p=api.state.photo;if(!p||!overlayObj)return;
    overlayObj.set({left:p.left,top:p.top,originX:p.originX,originY:p.originY,scaleX:p.scaleX,scaleY:p.scaleY,angle:p.angle,flipX:p.flipX,flipY:p.flipY});
    overlayObj.setCoords();overlayObj.dirty=true;
  }
  function ensureOverlay(){
    const p=api.state.photo;if(!p||!ensureCanvases())return;
    if(!overlayObj){
      overlayObj=new fabric.Image(overlayCanvas,{selectable:false,evented:false,objectCaching:false,excludeFromExport:true,opacity:1});
      overlayObj.photoRole='preview-overlay';overlayObj.layerType='aifill-overlay';overlayObj.layerName='AI Fill selection';
      canvas.add(overlayObj);canvas.bringToFront(overlayObj);
    }
    syncOverlayTransform();canvas.requestRenderAll();
  }
  function pointToSource(opt){
    const p=api.state.photo;if(!p)return null;
    const pointer=canvas.getPointer(opt.e);
    const inv=fabric.util.invertTransform(p.calcTransformMatrix());
    const local=fabric.util.transformPoint(new fabric.Point(pointer.x,pointer.y),inv);
    let x=local.x+(p.width||sourceW)/2,y=local.y+(p.height||sourceH)/2;
    if(x<0||y<0||x>=sourceW||y>=sourceH)return null;
    return {x,y};
  }
  function sourceBrushRadius(){
    const p=api.state.photo,scale=(Math.abs(p?.scaleX||1)+Math.abs(p?.scaleY||1))/2;
    return Math.max(1,brushSize/Math.max(.01,scale));
  }
  function paintCircle(x,y){
    if(!maskCtx||!overlayCtx)return;
    const r=sourceBrushRadius();
    if(brushMode==='restore'){
      maskCtx.save();maskCtx.globalCompositeOperation='destination-out';maskCtx.beginPath();maskCtx.arc(x,y,r,0,Math.PI*2);maskCtx.fill();maskCtx.restore();
      overlayCtx.save();overlayCtx.globalCompositeOperation='destination-out';overlayCtx.beginPath();overlayCtx.arc(x,y,r,0,Math.PI*2);overlayCtx.fill();overlayCtx.restore();
    }else{
      maskCtx.save();maskCtx.globalCompositeOperation='source-over';maskCtx.fillStyle='#fff';maskCtx.beginPath();maskCtx.arc(x,y,r,0,Math.PI*2);maskCtx.fill();maskCtx.restore();
      overlayCtx.save();overlayCtx.globalCompositeOperation='source-over';overlayCtx.fillStyle='rgba(255,45,70,.48)';overlayCtx.beginPath();overlayCtx.arc(x,y,r,0,Math.PI*2);overlayCtx.fill();overlayCtx.restore();
    }
    if(overlayObj){overlayObj.dirty=true;canvas.requestRenderAll()}
  }
  function strokeTo(point){
    if(!point)return;
    if(lastPoint){
      const dx=point.x-lastPoint.x,dy=point.y-lastPoint.y,dist=Math.hypot(dx,dy),r=sourceBrushRadius();
      const steps=Math.max(1,Math.ceil(dist/Math.max(2,r*.35)));
      for(let i=1;i<=steps;i++)paintCircle(lastPoint.x+dx*i/steps,lastPoint.y+dy*i/steps);
    }else paintCircle(point.x,point.y);
    lastPoint=point;
  }
  function begin(){
    if(!api.state.photo){api.toast('Abre una foto primero.');api.setCanvasMode?.('move',{openPanel:false,announce:false});return}
    ensureCanvases();ensureOverlay();active=true;setStatus('Pinta de rojo lo que quieres quitar. Todo se procesa en este dispositivo.','ready');
    refreshModelStatus();
  }
  function end({clear=false}={}){
    active=false;painting=false;lastPoint=null;if(clear)clearCanvases();removeOverlay();
  }

  canvas.on('mouse:down',opt=>{if(!active)return;painting=true;lastPoint=null;strokeTo(pointToSource(opt))});
  canvas.on('mouse:move',opt=>{if(!active||!painting)return;strokeTo(pointToSource(opt))});
  function finishStroke(){painting=false;lastPoint=null}
  canvas.on('mouse:up',finishStroke);canvas.upperCanvasEl?.addEventListener('pointerleave',finishStroke);
  canvas.on('after:render',()=>{if(active)syncOverlayTransform()});

  function getMaskAlpha(){
    if(!maskCtx)return new Uint8Array(0);
    const d=maskCtx.getImageData(0,0,sourceW,sourceH).data,out=new Uint8Array(sourceW*sourceH);
    for(let i=0,j=3;i<out.length;i++,j+=4)out[i]=d[j];
    return out;
  }
  function copyCropCanvas(source,bounds,scale=1){
    const out=document.createElement('canvas');out.width=Math.max(1,Math.round(bounds.width*scale));out.height=Math.max(1,Math.round(bounds.height*scale));
    const ctx=out.getContext('2d',{alpha:false,willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(source,bounds.x,bounds.y,bounds.width,bounds.height,0,0,out.width,out.height);return out;
  }
  function cropMaskArray(alpha,bounds,scale,expand){
    const w=Math.max(1,Math.round(bounds.width*scale)),h=Math.max(1,Math.round(bounds.height*scale));
    const rawCanvas=document.createElement('canvas');rawCanvas.width=bounds.width;rawCanvas.height=bounds.height;
    const ctx=rawCanvas.getContext('2d',{willReadFrequently:true});
    const im=ctx.createImageData(bounds.width,bounds.height);
    for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){
      const src=(bounds.y+y)*sourceW+(bounds.x+x),dst=(y*bounds.width+x)*4,a=alpha[src];im.data[dst]=im.data[dst+1]=im.data[dst+2]=a;im.data[dst+3]=255;
    }
    ctx.putImageData(im,0,0);
    const scaled=document.createElement('canvas');scaled.width=w;scaled.height=h;const sctx=scaled.getContext('2d',{willReadFrequently:true});
    sctx.imageSmoothingEnabled=false;sctx.drawImage(rawCanvas,0,0,w,h);const d=sctx.getImageData(0,0,w,h).data,bin=new Uint8Array(w*h);
    for(let i=0,j=0;i<bin.length;i++,j+=4)bin[i]=d[j]>16?255:0;
    return dilateBinary(bin,w,h,Math.round((expand||0)*scale));
  }
  function getPhotoSourceCanvas(){
    const p=api.state.photo,el=p?._element||p?.getElement?.()||p?._originalElement;if(!p||!el)throw new Error('No pude leer los píxeles de la fotografía.');
    const c=document.createElement('canvas');c.width=sourceW;c.height=sourceH;const ctx=c.getContext('2d',{alpha:false,willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(el,0,0,c.width,c.height);return c;
  }
  function imageDataToCanvas(imageData){const c=document.createElement('canvas');c.width=imageData.width;c.height=imageData.height;c.getContext('2d').putImageData(imageData,0,0);return c}
  function mergePatch(sourceCanvas,bounds,resultImageData,blendMask,scaledW,scaledH){
    const resultSmall=imageDataToCanvas(resultImageData),resultFull=document.createElement('canvas');resultFull.width=bounds.width;resultFull.height=bounds.height;
    const rctx=resultFull.getContext('2d',{willReadFrequently:true});rctx.imageSmoothingEnabled=true;rctx.imageSmoothingQuality='high';rctx.drawImage(resultSmall,0,0,bounds.width,bounds.height);
    const generated=rctx.getImageData(0,0,bounds.width,bounds.height);

    const maskSmall=document.createElement('canvas');maskSmall.width=scaledW;maskSmall.height=scaledH;const mctx=maskSmall.getContext('2d');const mi=mctx.createImageData(scaledW,scaledH);
    for(let i=0,j=0;i<blendMask.length;i++,j+=4){const a=blendMask[i];mi.data[j]=mi.data[j+1]=mi.data[j+2]=a;mi.data[j+3]=255}mctx.putImageData(mi,0,0);
    const maskFull=document.createElement('canvas');maskFull.width=bounds.width;maskFull.height=bounds.height;const mfctx=maskFull.getContext('2d',{willReadFrequently:true});mfctx.imageSmoothingEnabled=true;mfctx.drawImage(maskSmall,0,0,bounds.width,bounds.height);const md=mfctx.getImageData(0,0,bounds.width,bounds.height).data;

    const out=document.createElement('canvas');out.width=sourceCanvas.width;out.height=sourceCanvas.height;const octx=out.getContext('2d',{alpha:false,willReadFrequently:true});octx.drawImage(sourceCanvas,0,0);
    const base=octx.getImageData(bounds.x,bounds.y,bounds.width,bounds.height),bd=base.data,gd=generated.data;
    for(let i=0;i<bounds.width*bounds.height;i++){
      const p=i*4,a=md[p]/255;if(a<=0)continue;
      bd[p]=Math.round(bd[p]*(1-a)+gd[p]*a);bd[p+1]=Math.round(bd[p+1]*(1-a)+gd[p+1]*a);bd[p+2]=Math.round(bd[p+2]*(1-a)+gd[p+2]*a);bd[p+3]=255;
    }
    octx.putImageData(base,bounds.x,bounds.y);return out;
  }

  async function refreshModelStatus(){
    const el=$('aifill-model-status');if(!el)return;
    try{const s=await window.PhotoONNX?.inpaintStatus?.();el.textContent=s?.cached?'MI-GAN local listo':'MI-GAN 28 MB · se instalará una sola vez';el.classList.toggle('ready',!!s?.cached)}
    catch(_){el.textContent='MI-GAN 28 MB · pendiente'}
  }
  function importMask(alpha,width,height,{label='Selección IA'}={}){
    if(!api.state.photo)throw new Error('Abre una foto primero.');
    if(!alpha||!width||!height)throw new Error('La máscara no es válida.');
    ensureCanvases();
    clearCanvases();
    const src=document.createElement('canvas');src.width=width;src.height=height;const sctx=src.getContext('2d',{willReadFrequently:true});
    const img=sctx.createImageData(width,height);
    for(let i=0,j=0;i<alpha.length;i++,j+=4){const a=alpha[i]||0;img.data[j]=255;img.data[j+1]=255;img.data[j+2]=255;img.data[j+3]=a;}
    sctx.putImageData(img,0,0);
    maskCtx.save();maskCtx.clearRect(0,0,sourceW,sourceH);maskCtx.imageSmoothingEnabled=true;maskCtx.drawImage(src,0,0,sourceW,sourceH);maskCtx.restore();
    overlayCtx.save();overlayCtx.clearRect(0,0,sourceW,sourceH);overlayCtx.drawImage(maskCanvas,0,0);overlayCtx.globalCompositeOperation='source-in';overlayCtx.fillStyle='rgba(255,45,70,.48)';overlayCtx.fillRect(0,0,sourceW,sourceH);overlayCtx.restore();
    ensureOverlay();
    setStatus(`Selección importada: ${label}. Ajusta o pulsa Aplicar AI Fill.`, 'ready');
    if(overlayObj){overlayObj.dirty=true;canvas.requestRenderAll();}
  }

  async function installModel(){
    if(!window.PhotoONNX){setStatus('ONNX Runtime no está disponible.','error');return}
    setBusy(true);setStatus('Instalando MI-GAN local… la primera vez puede tardar.','working');
    try{await window.PhotoONNX.ensureInpaintSession();setStatus('Modelo local listo. Ya puedes pintar y aplicar.','ready');api.toast('MI-GAN quedó instalado localmente');await refreshModelStatus()}
    catch(err){console.error(err);setStatus('No pude instalar el modelo local: '+String(err?.message||err),'error')}
    finally{setBusy(false)}
  }

  async function apply(){
    if(!active||!api.state.photo)return;
    const alpha=getMaskAlpha(),raw=getMaskBounds(alpha,sourceW,sourceH);
    if(!raw){api.toast('Pinta primero el objeto que quieres quitar.');return}
    const token=++inferenceToken;
    const expand=Number($('aifill-expand')?.value||8),feather=Number($('aifill-feather')?.value||8);
    const context=Math.max(72,Math.min(260,Math.round(Math.max(raw.width,raw.height)*.65)+expand*2));
    const bounds=expandBounds(raw,context,sourceW,sourceH),scale=computeScale(bounds.width,bounds.height,768);
    setBusy(true);api.processing(true,'AI Fill local: reconstruyendo fondo…');setStatus('Preparando recorte y máscara…','working');
    try{
      const source=getPhotoSourceCanvas();
      if(source.width!==sourceW||source.height!==sourceH)throw new Error(`La foto cambió de tamaño (${source.width}×${source.height}); vuelve a abrir AI Fill.`);
      const crop=copyCropCanvas(source,bounds,scale),cropData=crop.getContext('2d',{willReadFrequently:true}).getImageData(0,0,crop.width,crop.height);
      const hole=cropMaskArray(alpha,bounds,scale,expand);
      setStatus('Ejecutando MI-GAN dentro del teléfono…','working');
      const result=await window.PhotoONNX.inpaint(cropData,hole);
      if(token!==inferenceToken)return;
      const blend=boxBlurMask(hole,crop.width,crop.height,Math.max(0,Math.round(feather*scale)));
      const merged=mergePatch(source,bounds,result,blend,crop.width,crop.height);
      removeOverlay();
      await api.applyProcessedImageDataUrl(merged.toDataURL('image/png'),true,null,{preserveFilters:true});
      clearCanvases();api.setCanvasMode?.('move',{openPanel:false,announce:false});
      setStatus('AI Fill aplicado localmente. Usa Undo si quieres comparar.','ready');api.toast('AI Fill local aplicado');
    }catch(err){
      console.error(err);ensureOverlay();setStatus('AI Fill no pudo terminar: '+String(err?.message||err),'error');api.toast('AI Fill local no pudo terminar');
    }finally{api.processing(false);setBusy(false);refreshModelStatus()}
  }

  document.querySelectorAll('[data-aifill-brush]').forEach(btn=>btn.addEventListener('click',()=>{
    brushMode=btn.dataset.aifillBrush;document.querySelectorAll('[data-aifill-brush]').forEach(b=>b.classList.toggle('active',b===btn));
  }));
  $('aifill-brush-size')?.addEventListener('input',e=>{brushSize=Number(e.target.value);if($('aifill-brush-size-out'))$('aifill-brush-size-out').textContent=e.target.value});
  $('aifill-expand')?.addEventListener('input',e=>{if($('aifill-expand-out'))$('aifill-expand-out').textContent=e.target.value+' px'});
  $('aifill-feather')?.addEventListener('input',e=>{if($('aifill-feather-out'))$('aifill-feather-out').textContent=e.target.value+' px'});
  $('aifill-clear')?.addEventListener('click',()=>{clearCanvases();api.toast('Selección de AI Fill borrada')});
  $('aifill-cancel')?.addEventListener('click',()=>{++inferenceToken;clearCanvases();api.setCanvasMode?.('move',{openPanel:false,announce:false});setStatus('AI Fill cancelado.','')});
  $('aifill-apply')?.addEventListener('click',apply);
  $('aifill-install-model')?.addEventListener('click',installModel);

  document.addEventListener('photoia:canvas-mode-changed',e=>{
    if(e.detail?.mode==='aifill')begin();else if(active)end({clear:false});
  });
  document.addEventListener('photoia:image-cleared',()=>{++inferenceToken;end({clear:true});maskCanvas=maskCtx=overlayCanvas=overlayCtx=null;sourceW=sourceH=0});
  document.addEventListener('photoia:photo-replaced',()=>{if(active){end({clear:true});maskCanvas=maskCtx=overlayCanvas=overlayCtx=null;sourceW=sourceH=0;api.setCanvasMode?.('move',{openPanel:false,announce:false})}});
  window.addEventListener('resize',()=>{if(active){syncOverlayTransform();canvas.requestRenderAll()}});
  window.PhotoAIFill={version:VERSION,importMask,clearSelection:()=>{clearCanvases();removeOverlay();},apply,installModel,refreshModelStatus,get selectionBounds(){const a=getMaskAlpha();return getMaskBounds(a,sourceW,sourceH)}};
  refreshModelStatus();
}
window.addEventListener('photoia-ready',boot,{once:true});
})();
