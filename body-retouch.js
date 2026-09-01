(() => {
'use strict';
const VERSION='1.0-abdomen-local-warp';
const $=id=>document.getElementById(id);
const api=()=>window.PhotoIA;
const state={baseUrl:'',baseImage:null,pose:null,previewSeq:0,busy:false};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function toast(t){api()?.toast?.(t)}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.decoding='async';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('No pude leer la fotografía.'));im.src=src;});}
function currentPhotoRaster(){
  const photo=api()?.state?.photo,el=photo?.getElement?.()||photo?._element||photo?._originalElement;
  if(!el)throw new Error('Abre una foto primero.');
  const w=el.naturalWidth||el.width||photo.width,h=el.naturalHeight||el.height||photo.height;
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});ctx.drawImage(el,0,0,w,h);return c.toDataURL('image/png');
}
async function ensureSession(){
  if(state.baseImage&&state.pose)return;
  if(!api()?.state?.photo)throw new Error('Abre una foto primero.');
  state.baseUrl=currentPhotoRaster();state.baseImage=await loadImage(state.baseUrl);
  const seg=window.PhotoSegmentation;if(!seg?.getPoseLandmarks)throw new Error('El motor corporal todavía no está disponible.');
  state.pose=await seg.getPoseLandmarks();
}
function torsoGeometry(points,W,H,area='abdomen'){
  const px=i=>({x:clamp(points[i].x,0,1)*W,y:clamp(points[i].y,0,1)*H,v:points[i].visibility??1,p:points[i].presence??1});
  const ls=px(11),rs=px(12),lh=px(23),rh=px(24);
  const shoulder={x:(ls.x+rs.x)/2,y:(ls.y+rs.y)/2},hip={x:(lh.x+rh.x)/2,y:(lh.y+rh.y)/2};
  const torsoH=Math.max(H*.08,Math.abs(hip.y-shoulder.y));
  if(hip.y<=shoulder.y+H*.025)throw new Error('No pude ubicar con seguridad el abdomen en esta postura.');
  const shoulderW=Math.abs(rs.x-ls.x),hipW=Math.abs(rh.x-lh.x);
  const bodyW=Math.max(W*.105,shoulderW,hipW);
  const cy=shoulder.y+torsoH*(area==='waist'?0.62:0.73);
  const cx=shoulder.x+(hip.x-shoulder.x)*(area==='waist'?0.60:0.75);
  const rx=Math.max(W*.075,bodyW*(area==='waist'?0.80:0.92));
  const ry=Math.max(H*.055,torsoH*(area==='waist'?0.58:0.48));
  return{cx,cy,rx,ry,torsoH};
}
function bilinear(data,W,H,x,y,ch){
  x=clamp(x,0,W-1);y=clamp(y,0,H-1);const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1),fx=x-x0,fy=y-y0;
  const p00=data[(y0*W+x0)*4+ch],p10=data[(y0*W+x1)*4+ch],p01=data[(y1*W+x0)*4+ch],p11=data[(y1*W+x1)*4+ch];
  return (p00+(p10-p00)*fx)*(1-fy)+(p01+(p11-p01)*fx)*fy;
}
function warpAbdomen(image,points,strength=15,area='abdomen',maxDim=0){
  const sw=image.naturalWidth||image.width,sh=image.naturalHeight||image.height,scale=maxDim>0?Math.min(1,maxDim/Math.max(sw,sh)):1,W=Math.max(1,Math.round(sw*scale)),H=Math.max(1,Math.round(sh*scale));
  const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d',{willReadFrequently:true,alpha:false});ctx.drawImage(image,0,0,W,H);
  const src=ctx.getImageData(0,0,W,H),out=ctx.createImageData(W,H);out.data.set(src.data);
  const g=torsoGeometry(points,W,H,area),amount=clamp(Number(strength)||0,0,40)/40;
  // 40 on the UI still means a controlled ~11% contraction at the very center.
  const maxContract=.025+.085*amount,x0=Math.max(0,Math.floor(g.cx-g.rx*1.18)),x1=Math.min(W-1,Math.ceil(g.cx+g.rx*1.18)),y0=Math.max(0,Math.floor(g.cy-g.ry*1.18)),y1=Math.min(H-1,Math.ceil(g.cy+g.ry*1.18));
  for(let y=y0;y<=y1;y++){
    const ny=(y-g.cy)/g.ry,wy=Math.max(0,1-ny*ny);if(wy<=0)continue;
    // Follow the natural shoulder->hip centerline slightly, helpful in 3/4 poses.
    const rowCenter=g.cx;
    for(let x=x0;x<=x1;x++){
      const nx=(x-rowCenter)/g.rx,d2=nx*nx+ny*ny;if(d2>=1)continue;
      const radial=Math.pow(1-d2,1.65),contract=maxContract*radial,inv=1/Math.max(.86,1-contract),sx=rowCenter+(x-rowCenter)*inv;
      const blend=Math.min(.94,radial*(.62+.28*amount)),di=(y*W+x)*4;
      for(let ch=0;ch<3;ch++){const warped=bilinear(src.data,W,H,sx,y,ch);out.data[di+ch]=Math.round(src.data[di+ch]+(warped-src.data[di+ch])*blend);}out.data[di+3]=255;
    }
  }
  ctx.putImageData(out,0,0);return c.toDataURL('image/png');
}
function values(){return{strength:Number($('body-slim-strength')?.value||15),area:$('body-slim-area')?.value||'abdomen'};}
function setBusy(v,text=''){state.busy=v;['body-slim-preview','body-slim-apply','body-slim-cancel'].forEach(id=>{const b=$(id);if(b)b.disabled=v||!api()?.state?.photo});const status=$('body-slim-status');if(status&&text)status.textContent=text;}
async function preview(){
  const seq=++state.previewSeq;setBusy(true,'Detectando cintura y preparando vista previa…');
  try{await ensureSession();const v=values(),url=warpAbdomen(state.baseImage,state.pose,v.strength,v.area,900);if(seq!==state.previewSeq)return;await api().applyProcessedImageDataUrl(url,false,()=>seq===state.previewSeq,{preserveFilters:true});const st=$('body-slim-status');if(st)st.textContent='Vista previa lista. Si se ve natural, pulsa Aplicar.';}
  catch(e){console.error(e);toast(e.message);const st=$('body-slim-status');if(st)st.textContent=e.message;}
  finally{setBusy(false);}
}
async function cancel(){
  const seq=++state.previewSeq;try{if(state.baseUrl)await api().applyProcessedImageDataUrl(state.baseUrl,false,()=>seq===state.previewSeq,{preserveFilters:true});const st=$('body-slim-status');if(st)st.textContent='Vista previa cancelada.';}finally{resetSession();setBusy(false);}
}
async function apply(){
  const seq=++state.previewSeq;setBusy(true,'Aplicando retoque corporal sutil…');
  try{await ensureSession();const v=values(),url=warpAbdomen(state.baseImage,state.pose,v.strength,v.area,0);if(seq!==state.previewSeq)return;const ok=await api().applyProcessedImageDataUrl(url,true,()=>seq===state.previewSeq,{preserveFilters:true});if(ok){toast('Abdomen ajustado de forma sutil');const st=$('body-slim-status');if(st)st.textContent='Retoque aplicado. Puedes usar Undo si quieres volver atrás.';}}
  catch(e){console.error(e);toast(e.message);const st=$('body-slim-status');if(st)st.textContent=e.message;}
  finally{resetSession();setBusy(false);}
}
function resetSession(){state.baseUrl='';state.baseImage=null;state.pose=null;}
function sync(){const has=!!api()?.state?.photo;['body-slim-preview','body-slim-apply','body-slim-cancel'].forEach(id=>{const b=$(id);if(b)b.disabled=!has});if(!has)resetSession();}
function boot(){
  const slider=$('body-slim-strength'),out=$('body-slim-strength-value');if(slider&&out){const u=()=>out.textContent=`${slider.value}%`;slider.oninput=u;u();}
  $('body-slim-preview')?.addEventListener('click',preview);$('body-slim-apply')?.addEventListener('click',apply);$('body-slim-cancel')?.addEventListener('click',cancel);
  document.addEventListener('photoia:image-loaded',()=>{resetSession();sync()});document.addEventListener('photoia:image-cleared',()=>{resetSession();sync()});sync();
  window.PhotoBodyRetouch={version:VERSION,preview,apply,cancel,reset:resetSession};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
