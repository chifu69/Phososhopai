(() => {
'use strict';
const VERSION='15.40.0';

// ---------------------------------------------------------------------------
// Pure math: monotone cubic Hermite interpolation (Fritsch–Carlson).
// No DOM, no fabric — kept separate so it can run and be tested in Node.
// ---------------------------------------------------------------------------
function buildCurveLUT(rawPoints){
  const pts=[...rawPoints].sort((a,b)=>a[0]-b[0]);
  if(!pts.length) return Uint8ClampedArray.from({length:256},(_,x)=>x);
  if(pts[0][0]>0) pts.unshift([0,pts[0][1]]);
  if(pts[pts.length-1][0]<255) pts.push([255,pts[pts.length-1][1]]);
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const n=xs.length, lut=new Uint8ClampedArray(256);
  if(n<2) return Uint8ClampedArray.from({length:256},(_,x)=>x);
  if(n===2){
    const [x0,y0]=[xs[0],ys[0]],[x1,y1]=[xs[1],ys[1]],span=Math.max(1e-6,x1-x0);
    for(let x=0;x<256;x++) lut[x]=y0+(y1-y0)*(x-x0)/span;
    return lut;
  }
  const m=n-1,d=new Array(m),t=new Array(n);
  for(let i=0;i<m;i++) d[i]=(ys[i+1]-ys[i])/Math.max(1e-6,xs[i+1]-xs[i]);
  t[0]=d[0]; t[m]=d[m-1];
  for(let i=1;i<m;i++) t[i]=(d[i-1]===0||d[i]===0||(d[i-1]<0)!==(d[i]<0))?0:(d[i-1]+d[i])/2;
  for(let i=0;i<m;i++){
    if(d[i]===0){t[i]=0;t[i+1]=0;continue}
    const a=t[i]/d[i],b=t[i+1]/d[i],s=a*a+b*b;
    if(s>9){const tau=3/Math.sqrt(s);t[i]=tau*a*d[i];t[i+1]=tau*b*d[i]}
  }
  let seg=0;
  for(let x=0;x<256;x++){
    while(seg<m-1&&x>xs[seg+1]) seg++;
    const x0=xs[seg],x1=xs[seg+1],y0=ys[seg],y1=ys[seg+1],h=Math.max(1e-6,x1-x0),tt=(x-x0)/h;
    const h00=2*tt**3-3*tt**2+1,h10=tt**3-2*tt**2+tt,h01=-2*tt**3+3*tt**2,h11=tt**3-tt**2;
    lut[x]=h00*y0+h10*h*t[seg]+h01*y1+h11*h*t[seg+1];
  }
  return lut;
}
// Compose a per-channel curve on top of the master RGB curve, Photoshop-style:
// final(v) = channelLUT[ masterLUT[v] ].
function composeLUT(masterLUT,channelLUT){
  const out=new Uint8ClampedArray(256);
  for(let v=0;v<256;v++) out[v]=channelLUT[masterLUT[v]];
  return out;
}
function identityPoints(){return [[0,0],[255,255]]}
function defaultCurveState(){return {rgb:identityPoints(),r:identityPoints(),g:identityPoints(),b:identityPoints()}}
function isIdentityCurve(points){
  return Array.isArray(points)&&points.length===2&&points[0][0]===0&&points[0][1]===0&&points[1][0]===255&&points[1][1]===255;
}
function isIdentityState(state){
  return !state||['rgb','r','g','b'].every(k=>isIdentityCurve(state[k]));
}

const PhotoCurvesMath={buildCurveLUT,composeLUT,identityPoints,defaultCurveState,isIdentityCurve,isIdentityState};

if(typeof module!=='undefined'&&module.exports){
  module.exports=PhotoCurvesMath;
}
if(typeof window!=='undefined'){
  window.PhotoCurvesMath=PhotoCurvesMath;

// ---------------------------------------------------------------------------
// Browser-only: Fabric filter + UI. Guarded so this file stays requireable
// from Node (tests) without a DOM/fabric present.
// ---------------------------------------------------------------------------
(() => {
const $=id=>document.getElementById(id);

function registerFabricFilter(){
  if(typeof fabric==='undefined'||!fabric.Image||!fabric.Image.filters||fabric.Image.filters.Curves) return;
  fabric.Image.filters.Curves=fabric.util.createClass(fabric.Image.filters.BaseFilter,{
    type:'Curves',
    lutR:null,lutG:null,lutB:null,
    initialize(options={}){
      this.callSuper('initialize',options);
      this.lutR=options.lutR||Uint8ClampedArray.from({length:256},(_,v)=>v);
      this.lutG=options.lutG||Uint8ClampedArray.from({length:256},(_,v)=>v);
      this.lutB=options.lutB||Uint8ClampedArray.from({length:256},(_,v)=>v);
    },
    applyTo2d(options){
      const data=options.imageData.data,r=this.lutR,g=this.lutG,b=this.lutB;
      for(let i=0;i<data.length;i+=4){
        data[i]=r[data[i]];data[i+1]=g[data[i+1]];data[i+2]=b[data[i+2]];
      }
    },
    toObject(){return {...this.callSuper('toObject')}}
  });
}

function boot(){
  const api=window.PhotoIA;
  if(!api?.state?.canvas) return;
  registerFabricFilter();
  const canvas=api.state.canvas;
  let curveState=PhotoCurvesMath.defaultCurveState();
  let channel='rgb';
  let dragIndex=-1;
  const editor=$('curves-editor');
  const ctx=editor?.getContext('2d');
  const PAD=10, SIZE=256; // logical curve-space size; canvas element is SIZE+PAD*2 square.

  function pointsFor(ch){return curveState[ch]}
  function toCanvasXY(x,y){return [PAD+x*(editor.width-PAD*2)/255, PAD+(255-y)*(editor.height-PAD*2)/255]}
  function toCurveXY(px,py){
    const x=Math.round((px-PAD)*255/(editor.width-PAD*2));
    const y=Math.round(255-(py-PAD)*255/(editor.height-PAD*2));
    return [Math.max(0,Math.min(255,x)),Math.max(0,Math.min(255,y))];
  }
  function draw(){
    if(!ctx) return;
    const w=editor.width,h=editor.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='rgba(127,127,127,.08)';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(127,127,127,.35)';ctx.lineWidth=1;
    for(let i=1;i<4;i++){
      const gx=PAD+i*(w-PAD*2)/4,gy=PAD+i*(h-PAD*2)/4;
      ctx.beginPath();ctx.moveTo(gx,PAD);ctx.lineTo(gx,h-PAD);ctx.stroke();
      ctx.beginPath();ctx.moveTo(PAD,gy);ctx.lineTo(w-PAD,gy);ctx.stroke();
    }
    ctx.strokeStyle='rgba(148,163,184,.55)';
    const [dx0,dy0]=toCanvasXY(0,0),[dx1,dy1]=toCanvasXY(255,255);
    ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(dx0,dy0);ctx.lineTo(dx1,dy1);ctx.stroke();ctx.setLineDash([]);
    const colors={rgb:'#111827',r:'#ef4444',g:'#22c55e',b:'#3b82f6'};
    ['rgb','r','g','b'].forEach(ch=>{
      if(ch!==channel&&PhotoCurvesMath.isIdentityCurve(curveState[ch])) return;
      const lut=PhotoCurvesMath.buildCurveLUT(curveState[ch]);
      ctx.strokeStyle=colors[ch];ctx.lineWidth=ch===channel?2.5:1.5;ctx.globalAlpha=ch===channel?1:.45;
      ctx.beginPath();
      for(let x=0;x<256;x++){const [px,py]=toCanvasXY(x,lut[x]);x===0?ctx.moveTo(px,py):ctx.lineTo(px,py)}
      ctx.stroke();ctx.globalAlpha=1;
    });
    ctx.fillStyle=colors[channel];
    pointsFor(channel).forEach(([x,y])=>{
      const [px,py]=toCanvasXY(x,y);
      ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
    });
  }

  function applyCurves(commit){
    if(!api.state.photo) return;
    const master=PhotoCurvesMath.buildCurveLUT(curveState.rgb);
    const lutR=PhotoCurvesMath.composeLUT(master,PhotoCurvesMath.buildCurveLUT(curveState.r));
    const lutG=PhotoCurvesMath.composeLUT(master,PhotoCurvesMath.buildCurveLUT(curveState.g));
    const lutB=PhotoCurvesMath.composeLUT(master,PhotoCurvesMath.buildCurveLUT(curveState.b));
    const filter=PhotoCurvesMath.isIdentityState(curveState)?null:new fabric.Image.filters.Curves({lutR,lutG,lutB});
    api.replaceFilter?.('curves',filter);
    api.state.photo.photoAdjustments={...(api.state.photo.photoAdjustments||{}),curves:JSON.parse(JSON.stringify(curveState))};
    if(commit) api.snapshot();
  }

  function pointerToCurve(evt){
    const rect=editor.getBoundingClientRect();
    const px=(evt.clientX-rect.left)*(editor.width/rect.width);
    const py=(evt.clientY-rect.top)*(editor.height/rect.height);
    return toCurveXY(px,py);
  }
  function nearestPointIndex(x,y){
    const pts=pointsFor(channel);
    let best=-1,bestDist=Infinity;
    pts.forEach(([px,py],i)=>{const d=Math.hypot(px-x,py-y);if(d<bestDist){bestDist=d;best=i}});
    return bestDist<=18?best:-1;
  }
  function onDown(evt){
    if(!api.state.photo) return;
    evt.preventDefault();
    const [x,y]=pointerToCurve(evt);
    const idx=nearestPointIndex(x,y);
    if(idx>=0){dragIndex=idx;return}
    const pts=pointsFor(channel);
    pts.push([x,y]);pts.sort((a,b)=>a[0]-b[0]);
    dragIndex=pts.findIndex(p=>p[0]===x&&p[1]===y);
    draw();applyCurves(false);
  }
  function onMove(evt){
    if(dragIndex<0) return;
    evt.preventDefault();
    const pts=pointsFor(channel);
    const isEdge=dragIndex===0||dragIndex===pts.length-1;
    let [x,y]=pointerToCurve(evt);
    if(isEdge) x=pts[dragIndex][0]; // endpoints stay pinned to x=0 / x=255
    else{
      const minX=pts[dragIndex-1][0]+1,maxX=pts[dragIndex+1][0]-1;
      x=Math.max(minX,Math.min(maxX,x));
    }
    pts[dragIndex]=[x,y];
    draw();applyCurves(false);
  }
  function onUp(){
    if(dragIndex<0) return;
    dragIndex=-1;
    applyCurves(true);
  }
  function onDoubleClick(evt){
    if(!api.state.photo) return;
    const [x,y]=pointerToCurve(evt);
    const idx=nearestPointIndex(x,y);
    const pts=pointsFor(channel);
    if(idx>0&&idx<pts.length-1){ // never remove the two endpoints
      pts.splice(idx,1);
      draw();applyCurves(true);
    }
  }

  if(editor){
    editor.addEventListener('pointerdown',onDown);
    editor.addEventListener('pointermove',onMove);
    window.addEventListener('pointerup',onUp);
    editor.addEventListener('dblclick',onDoubleClick);
  }
  document.querySelectorAll('[data-curve-channel]').forEach(btn=>btn.addEventListener('click',()=>{
    channel=btn.dataset.curveChannel;
    document.querySelectorAll('[data-curve-channel]').forEach(b=>b.classList.toggle('active',b===btn));
    draw();
  }));
  $('curves-reset')?.addEventListener('click',()=>{
    curveState=PhotoCurvesMath.defaultCurveState();
    draw();applyCurves(true);
    api.toast('Curvas restablecidas');
  });

  function restoreFromAdjustments(){
    const saved=api.state.photo?.photoAdjustments?.curves;
    curveState=saved?JSON.parse(JSON.stringify(saved)):PhotoCurvesMath.defaultCurveState();
    draw();
    // Custom fabric filters only round-trip through toJSON/loadFromJSON (undo,
    // redo, restoreHistoryIndex) if toObject()/fromObject() serialize every
    // constructor option. Rather than keep that in lockstep with the filter
    // class, always rebuild the actual applied filter here from the control
    // points (photoAdjustments.curves), which are plain data and always
    // survive serialization correctly. This is the single source of truth.
    applyCurves(false);
  }
  document.addEventListener('photoia:image-loaded',restoreFromAdjustments);
  document.addEventListener('photoia:image-cleared',()=>{curveState=PhotoCurvesMath.defaultCurveState();draw()});
  // Undo/redo and preset application replace state.photo wholesale; keep the
  // editor's control points in sync so the drawn curve always matches what's
  // actually applied to the photo.
  document.addEventListener('photoia:preset-applied',restoreFromAdjustments);
  document.addEventListener('photoia:photo-replaced',restoreFromAdjustments);
  canvas.on('object:modified',()=>{if(canvas.getActiveObject()===api.state.photo)restoreFromAdjustments()});

  draw();
}
window.addEventListener('photoia-ready',boot,{once:true});
})();
}
})();
