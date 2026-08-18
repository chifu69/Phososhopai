(() => {
'use strict';
const VERSION='3.8-worker-isolated-pipeline';
const $=id=>document.getElementById(id);
const api=()=>window.PhotoIA;
const TASKS_VERSION='0.10.35';
const MEDIAPIPE_ESM='./assets/mediapipe/tasks-vision.esm.js';
const MEDIAPIPE_ESM_REMOTE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm';
const MEDIAPIPE_WASM='./assets/mediapipe/wasm';
const MEDIAPIPE_WASM_REMOTE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const PERSON_MODEL='./assets/models/selfie_segmenter_landscape.tflite';
const INTERACTIVE_MODEL='./assets/models/interactive_segmentation.task';
const MULTICLASS_MODEL='./assets/models/selfie_multiclass_256x256.tflite';
const FACE_LANDMARKER_MODEL='./assets/models/face_landmarker.task';
const FACE_LANDMARKER_REMOTE='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const MODEL_REMOTE=new Map([
  [PERSON_MODEL,'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite'],
  [INTERACTIVE_MODEL,'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task'],
  [MULTICLASS_MODEL,'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite']
]);
const PERSON_CLASS_ID=1;
const IS_IOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
const LOAD_TIMEOUT=IS_IOS?9000:30000;
const RUN_TIMEOUT=IS_IOS?8000:30000;
const PROFILE_WATCHDOG=IS_IOS?7000:36000;
const state={
  module:null,fileset:null,imageSegmenter:null,multiclassSegmenter:null,interactiveSegmenter:null,faceLandmarker:null,
  modulePromise:null,loading:false,mask:null,maskKind:'',maskOverlay:null,
  tapMode:false,workCanvas:null,operation:null,operationId:0,personModelBuffer:null,multiclassModelBuffer:null,interactiveModelBuffer:null,bodyPixNet:null,bodyPixPromise:null,semantic:{faceAnchor:null,faceMask:null,skinMask:null,hairMask:null,clothingMask:null,confidence:{}},
  mlWorker:null,workerSeq:0,workerPending:new Map(),workerWarm:false,workerDiag:{worker:'NOT_STARTED',module:'NOT_LOADED',lastTask:'-',lastPhase:'idle',lastMs:0,input:'-',engine:'Worker',error:''}
};

const DEBUG_KEY='photoia-segmentation-debug-v1380';

// PHOTO IA 8.3 uses a dependency-free local portrait cutout engine.
// It avoids CDN failures and never downloads BodyPix or a model at runtime.
function colorDistance(r1,g1,b1,r2,g2,b2){
  const dr=r1-r2,dg=g1-g2,db=b1-b2;
  return Math.sqrt(dr*dr+dg*dg+db*db);
}
function sampleBorderPalette(rgba,w,h){
  const samples=[];const step=Math.max(2,Math.floor(Math.min(w,h)/56));
  const push=(x,y)=>{const i=(y*w+x)*4;samples.push([rgba[i],rgba[i+1],rgba[i+2]]);};
  for(let x=0;x<w;x+=step){push(x,0);push(x,h-1)}for(let y=0;y<h;y+=step){push(0,y);push(w-1,y)}
  const palette=[];
  for(const c of samples){let best=-1,bestD=1e9;for(let i=0;i<palette.length;i++){const p=palette[i],d=colorDistance(c[0],c[1],c[2],p.r,p.g,p.b);if(d<bestD){bestD=d;best=i}}
    if(best<0||bestD>34){if(palette.length<24)palette.push({r:c[0],g:c[1],b:c[2],n:1});}
    else{const p=palette[best],n=p.n+1;p.r=(p.r*p.n+c[0])/n;p.g=(p.g*p.n+c[1])/n;p.b=(p.b*p.n+c[2])/n;p.n=n;}}
  return palette;
}
function nearestPaletteDistance(r,g,b,palette){let best=442;for(const p of palette){const d=colorDistance(r,g,b,p.r,p.g,p.b);if(d<best)best=d;}return best;}
function blurMask(mask,w,h,passes=2){let src=mask;for(let pass=0;pass<passes;pass++){const out=new Uint8Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,weight=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const ww=(dx===0&&dy===0)?4:(dx===0||dy===0?2:1);sum+=src[yy*w+xx]*ww;weight+=ww;}out[y*w+x]=Math.round(sum/weight);}src=out;}return src;}
function thresholdMask(mask,t=110){const out=new Uint8Array(mask.length);for(let i=0;i<mask.length;i++)out[i]=mask[i]>=t?255:0;return out;}
function dilate(mask,w,h,passes=1){let src=thresholdMask(mask,96);for(let p=0;p<passes;p++){const out=new Uint8Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let mx=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h)mx=Math.max(mx,src[yy*w+xx]);}out[y*w+x]=mx;}src=out;}return src;}
function erode(mask,w,h,passes=1){let src=thresholdMask(mask,96);for(let p=0;p<passes;p++){const out=new Uint8Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let mn=255;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h){mn=0;continue;}mn=Math.min(mn,src[yy*w+xx]);}out[y*w+x]=mn;}src=out;}return src;}
function closeMask(mask,w,h,passes=1){return erode(dilate(mask,w,h,passes),w,h,passes)}
function openMask(mask,w,h,passes=1){return dilate(erode(mask,w,h,passes),w,h,passes)}
function maskBounds(mask,w,h,threshold=110){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(mask[y*w+x]>=threshold){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}return maxX<0?null:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};}
function largestCenterComponent(mask,w,h){const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let best=null,bestScore=-1e9;const cx=w*.5,cy=h*.48;for(let i=0;i<mask.length;i++){if(seen[i]||mask[i]<100)continue;let head=0,tail=0,area=0,touches=0,centerHits=0;queue[tail++]=i;seen[i]=1;const comp=[];while(head<tail){const idx=queue[head++],x=idx%w,y=(idx/w)|0;comp.push(idx);area++;if(x<2||y<2||x>w-3||y>h-3)touches++;if(Math.abs(x-cx)<w*.24&&Math.abs(y-cy)<h*.34)centerHits++;for(const ni of [idx-1,idx+1,idx-w,idx+w]){if(ni<0||ni>=mask.length||seen[ni]||mask[ni]<100)continue;const nx=ni%w,ny=(ni/w)|0;if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;seen[ni]=1;queue[tail++]=ni;}}
    const score=area+centerHits*2.4-touches*5;if(score>bestScore){bestScore=score;best=comp;}}
  const out=new Uint8Array(mask.length);if(best)for(const idx of best)out[idx]=255;return out;}
function skinConfidence(r,g,b){const max=Math.max(r,g,b),min=Math.min(r,g,b),cb=128-.168736*r-.331264*g+.5*b,cr=128+.5*r-.418688*g-.081312*b;const rgb=(r>45&&g>28&&b>18&&(max-min)>8&&r>g*.9&&r>b*1.02);const ycbcr=(cr>132&&cr<180&&cb>74&&cb<136);return rgb&&ycbcr?1:0;}
function edgeConnectedBackground(rgba,w,h,palette){const bg=new Uint8Array(w*h),seen=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;const seed=(x,y)=>{const idx=y*w+x;if(seen[idx])return;seen[idx]=1;q[tail++]=idx;};for(let x=0;x<w;x+=2){seed(x,0);seed(x,h-1)}for(let y=0;y<h;y+=2){seed(0,y);seed(w-1,y)}
  while(head<tail){const idx=q[head++],x=idx%w,y=(idx/w)|0,j=idx*4,r=rgba[j],g=rgba[j+1],b=rgba[j+2];const pd=nearestPaletteDistance(r,g,b,palette);if(pd>64)continue;bg[idx]=255;for(const ni of [idx-1,idx+1,idx-w,idx+w]){if(ni<0||ni>=w*h||seen[ni])continue;const nx=ni%w,ny=(ni/w)|0;if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;const k=ni*4,local=colorDistance(r,g,b,rgba[k],rgba[k+1],rgba[k+2]);const centerProtect=Math.abs(nx-w*.5)<w*.28&&ny>h*.08&&ny<h*.92;if(local<26||(!centerProtect&&local<38)){seen[ni]=1;q[tail++]=ni;}}}
  return bg;}
function offlinePortraitMask(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height;const rgba=ctx.getImageData(0,0,w,h).data,palette=sampleBorderPalette(rgba,w,h),bg=edgeConnectedBackground(rgba,w,h,palette),raw=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=i*4,r=rgba[j],g=rgba[j+1],b=rgba[j+2],pd=nearestPaletteDistance(r,g,b,palette);const nx=Math.abs(x-w*.5)/(w*.5),ny=Math.abs(y-h*.50)/(h*.53);const center=Math.max(0,1-Math.sqrt(nx*nx+ny*ny));const bodyPrior=Math.max(0,1-nx/1.04)*Math.max(0,1-ny/1.1);const skin=skinConfidence(r,g,b);let score=pd*.92+center*30+bodyPrior*20+skin*18-(bg[i]?38:0);if(y<h*.03||x<w*.015||x>w*.985)score-=20;raw[i]=score>72?255:score>52?Math.round((score-52)/20*255):0;}
  let clean=closeMask(raw,w,h,1);clean=largestCenterComponent(clean,w,h);clean=closeMask(clean,w,h,1);clean=openMask(clean,w,h,1);clean=blurMask(clean,w,h,1);let selected=0;for(const v of clean)if(v>110)selected++;if(selected<w*h*.025)throw makeError('No pude separar claramente a la persona. Prueba Objeto por toque o una foto con más contraste.','OFFLINE_MASK_SMALL');if(selected>w*h*.86)throw makeError('La selección tomó demasiado fondo. Prueba Objeto por toque para indicar el sujeto.','OFFLINE_MASK_LARGE');logDebug('SMART PORTRAIT: máscara lista',{width:w,height:h,selected,total:w*h,palette:palette.length});return clean;}
function featherMask(mask,width,height){return blurMask(mask,width,height,1)}
function faceBoxFromPerson(base,w,h){const b=maskBounds(base,w,h);if(!b)return null;return {x:b.x+b.w*.22,y:b.y+b.h*.03,w:b.w*.56,h:b.h*.46};}
function largestSkinFaceBox(canvas){
  const w=canvas.width,h=canvas.height,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const raw=new Uint8Array(w*h);
  for(let y=Math.floor(h*.08);y<Math.floor(h*.70);y++)for(let x=Math.floor(w*.12);x<Math.ceil(w*.88);x++){
    const i=y*w+x,j=i*4;if(skinConfidence(rgba[j],rgba[j+1],rgba[j+2]))raw[i]=255;
  }
  let m=closeMask(raw,w,h,2);m=openMask(m,w,h,1);
  const seen=new Uint8Array(m.length),q=new Int32Array(m.length);let best=null,bestScore=-1e9;
  for(let i=0;i<m.length;i++){if(seen[i]||m[i]<100)continue;let head=0,tail=0,minX=w,minY=h,maxX=-1,maxY=-1,area=0;seen[i]=1;q[tail++]=i;
    while(head<tail){const idx=q[head++],x=idx%w,y=(idx/w)|0;area++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const ni of [idx-1,idx+1,idx-w,idx+w]){if(ni<0||ni>=m.length||seen[ni]||m[ni]<100)continue;const nx=ni%w,ny=(ni/w)|0;if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;seen[ni]=1;q[tail++]=ni;}}
    const bw=maxX-minX+1,bh=maxY-minY+1,cx=minX+bw/2,cy=minY+bh/2,centerPenalty=Math.abs(cx-w*.5)/(w*.5),verticalPenalty=Math.abs(cy-h*.34)/(h*.5);const score=area*(1-centerPenalty*.75-verticalPenalty*.5);
    if(area>w*h*.006&&bw>w*.10&&bh>h*.08&&score>bestScore){bestScore=score;best={x:minX,y:minY,w:bw,h:bh};}
  }
  if(!best)return null;
  const padX=best.w*.16,padTop=best.h*.28,padBottom=best.h*.18;
  return {x:Math.max(0,best.x-padX),y:Math.max(0,best.y-padTop),w:Math.min(w,best.w+padX*2),h:Math.min(h,best.h+padTop+padBottom)};
}
async function detectFaceAnchor(canvas,base){
  const w=canvas.width,h=canvas.height;
  if('FaceDetector' in window){
    try{
      const detector=new FaceDetector({fastMode:true,maxDetectedFaces:3});
      const faces=await Promise.race([detector.detect(canvas),new Promise((_,rej)=>setTimeout(()=>rej(new Error('FACE_TIMEOUT')),2200))]);
      if(faces?.length){
        const ranked=faces.map(f=>f.boundingBox).filter(Boolean).sort((a,b)=>{const ac=Math.abs((a.x+a.width/2)-w*.5),bc=Math.abs((b.x+b.width/2)-w*.5);return (b.width*b.height-bc*120)-(a.width*a.height-ac*120)});
        const b=ranked[0];if(b&&b.width>w*.10&&b.height>h*.08)return {x:b.x,y:b.y,w:b.width,h:b.height,source:'FaceDetector'};
      }
    }catch(err){logDebug('BUST FACE DETECTOR fallback',err?.message||err);}
  }
  const skin=largestSkinFaceBox(canvas);if(skin)return {...skin,source:'skin-anchor'};
  const fb=faceBoxFromPerson(base,w,h);return fb?{...fb,source:'person-bounds'}:null;
}
function bustEnvelope(anchor,w,h){
  const faceCx=anchor.x+anchor.w/2,faceTop=anchor.y,faceBottom=anchor.y+anchor.h;
  const top=Math.max(0,faceTop-anchor.h*.78);
  const bottom=Math.min(h-1,faceBottom+anchor.h*2.05);
  return {faceCx,faceTop,faceBottom,top,bottom};
}
function bustHalfWidthAtY(anchor,env,y){
  const fw=anchor.w;
  if(y<env.faceTop){
    const t=(env.faceTop-y)/Math.max(1,env.faceTop-env.top);
    return fw*(.59+.17*t);
  }
  if(y<=env.faceBottom)return fw*.66;
  const t=(y-env.faceBottom)/Math.max(1,env.bottom-env.faceBottom);
  // Shoulders widen progressively; this is only a search envelope, not the final mask.
  return fw*(.74+1.22*Math.pow(t,.68));
}
function buildAnatomicalBustPrior(anchor,w,h){
  const env=bustEnvelope(anchor,w,h),out=new Uint8Array(w*h);
  for(let y=Math.floor(env.top);y<=Math.floor(env.bottom);y++){
    const half=bustHalfWidthAtY(anchor,env,y),left=Math.max(0,Math.floor(env.faceCx-half)),right=Math.min(w-1,Math.ceil(env.faceCx+half));
    for(let x=left;x<=right;x++){
      const dx=Math.abs(x-env.faceCx)/Math.max(1,half);
      const edge=Math.max(0,1-dx);
      out[y*w+x]=Math.round(72+183*Math.pow(edge,.42));
    }
  }
  // Face is always a strong foreground anchor.
  for(let y=Math.max(0,Math.floor(anchor.y-anchor.h*.12));y<Math.min(h,Math.ceil(anchor.y+anchor.h*1.10));y++){
    for(let x=Math.max(0,Math.floor(anchor.x-anchor.w*.12));x<Math.min(w,Math.ceil(anchor.x+anchor.w*1.12));x++){
      const ex=(x-(anchor.x+anchor.w*.5))/(anchor.w*.68),ey=(y-(anchor.y+anchor.h*.52))/(anchor.h*.68);
      if(ex*ex+ey*ey<=1)out[y*w+x]=255;
    }
  }
  return out;
}
function scoreBustMask(mask,w,h,anchor){
  const env=bustEnvelope(anchor,w,h),prior=buildAnatomicalBustPrior(anchor,w,h);
  let selected=0,faceHits=0,torsoHits=0,priorHits=0,edgeHits=0,fragmentPenalty=0;
  const faceArea=Math.max(1,anchor.w*anchor.h),torsoTop=Math.min(h-1,Math.floor(anchor.y+anchor.h*1.02));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(mask[i]<80)continue;selected++;
    if(x>=anchor.x&&x<=anchor.x+anchor.w&&y>=anchor.y&&y<=anchor.y+anchor.h)faceHits++;
    if(y>=torsoTop&&y<=env.bottom&&Math.abs(x-env.faceCx)<anchor.w*1.35)torsoHits++;
    if(prior[i]>80)priorHits++;
    if(x<2||x>w-3||y<2||y>h-3)edgeHits++;
  }
  if(!selected)return {score:-999,valid:false,ratio:0};
  const ratio=selected/(w*h),faceCoverage=faceHits/faceArea,torsoCoverage=torsoHits/Math.max(1,anchor.w*anchor.h*.75),priorPrecision=priorHits/selected,edgeRatio=edgeHits/selected;
  // Connectedness proxy: closing + largest component should not lose much area.
  const largest=largestCenterComponent(thresholdMask(mask,80),w,h);let largestCount=0;for(const v of largest)if(v>80)largestCount++;
  const continuity=largestCount/selected;fragmentPenalty=1-continuity;
  let score=faceCoverage*34+Math.min(1,torsoCoverage)*24+priorPrecision*22+continuity*22-edgeRatio*18;
  if(ratio<.07)score-=35;if(ratio>.68)score-=30;if(faceCoverage<.45)score-=28;if(torsoCoverage<.20)score-=24;
  const valid=ratio>=.065&&ratio<=.72&&faceCoverage>=.45&&torsoCoverage>=.16&&continuity>=.82;
  return {score,valid,ratio,faceCoverage,torsoCoverage,priorPrecision,continuity,edgeRatio,fragmentPenalty};
}
function buildBustMask(canvas,base,anchor){
  const w=canvas.width,h=canvas.height,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,palette=sampleBorderPalette(rgba,w,h),env=bustEnvelope(anchor,w,h),prior=buildAnatomicalBustPrior(anchor,w,h),out=new Uint8Array(w*h);
  for(let y=Math.floor(env.top);y<=Math.floor(env.bottom);y++){
    const half=bustHalfWidthAtY(anchor,env,y),left=Math.max(0,Math.floor(env.faceCx-half)),right=Math.min(w-1,Math.ceil(env.faceCx+half));
    for(let x=left;x<=right;x++){
      const i=y*w+x,j=i*4,pd=nearestPaletteDistance(rgba[j],rgba[j+1],rgba[j+2],palette),baseV=base[i],priorV=prior[i];
      const inFace=y>=anchor.y-anchor.h*.14&&y<=anchor.y+anchor.h*1.14&&Math.abs(x-env.faceCx)<anchor.w*.75;
      let confidence=priorV*.42+Math.min(255,baseV)*.36+Math.min(255,pd*3.0)*.22;
      if(inFace)confidence=Math.max(confidence,238);
      if(confidence>122)out[i]=255;else if(confidence>92)out[i]=170;
    }
  }
  let clean=closeMask(out,w,h,2);clean=largestCenterComponent(clean,w,h);clean=closeMask(clean,w,h,2);clean=blurMask(clean,w,h,1);
  return clean;
}
function opencvGrabCutBust(canvas,base,anchor){
  if(!window.cv?.Mat||typeof cv.grabCut!=='function')return null;
  const w=canvas.width,h=canvas.height,env=bustEnvelope(anchor,w,h),prior=buildAnatomicalBustPrior(anchor,w,h);
  let src=null,rgb=null,gcMask=null,bgdModel=null,fgdModel=null;
  try{
    src=cv.imread(canvas);rgb=new cv.Mat();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);
    gcMask=new cv.Mat(h,w,cv.CV_8UC1,new cv.Scalar(cv.GC_PR_BGD));
    const d=gcMask.data;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;
      if(x<2||x>w-3||y<2||y>h-3){d[i]=cv.GC_BGD;continue;}
      if(y<env.top||y>env.bottom){d[i]=cv.GC_BGD;continue;}
      const half=bustHalfWidthAtY(anchor,env,y),dx=Math.abs(x-env.faceCx);
      if(dx>half*1.10){d[i]=cv.GC_BGD;continue;}
      const ex=(x-(anchor.x+anchor.w*.5))/(anchor.w*.57),ey=(y-(anchor.y+anchor.h*.51))/(anchor.h*.58);
      if(ex*ex+ey*ey<.78){d[i]=cv.GC_FGD;continue;}
      if(base[i]>120||prior[i]>195)d[i]=cv.GC_PR_FGD;
      else if(prior[i]>105)d[i]=cv.GC_PR_FGD;
      else d[i]=cv.GC_PR_BGD;
    }
    bgdModel=new cv.Mat();fgdModel=new cv.Mat();
    cv.grabCut(rgb,gcMask,new cv.Rect(0,0,1,1),bgdModel,fgdModel,4,cv.GC_INIT_WITH_MASK);
    const out=new Uint8Array(w*h),m=gcMask.data;
    for(let i=0;i<out.length;i++)out[i]=(m[i]===cv.GC_FGD||m[i]===cv.GC_PR_FGD)?255:0;
    let clean=closeMask(out,w,h,1);clean=largestCenterComponent(clean,w,h);clean=closeMask(clean,w,h,1);clean=blurMask(clean,w,h,1);
    return clean;
  }catch(err){logDebug('BUST GrabCut fallback',err?.message||err);return null;}
  finally{for(const m of [src,rgb,gcMask,bgdModel,fgdModel])try{m?.delete?.()}catch(_){}}
}
function edgeAwareRefine(mask,canvas,anchor){
  const w=canvas.width,h=canvas.height,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,out=new Uint8Array(mask),env=bustEnvelope(anchor,w,h);
  // Keep strong interior; near the boundary favor local image edges instead of a hard geometric contour.
  for(let y=Math.max(1,Math.floor(env.top));y<Math.min(h-1,Math.ceil(env.bottom));y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;if(mask[i]<40||mask[i]>235)continue;const j=i*4;
    const gx=colorDistance(rgba[j-4],rgba[j-3],rgba[j-2],rgba[j+4],rgba[j+5],rgba[j+6]);
    const ju=((y-1)*w+x)*4,jd=((y+1)*w+x)*4,gy=colorDistance(rgba[ju],rgba[ju+1],rgba[ju+2],rgba[jd],rgba[jd+1],rgba[jd+2]);
    const edge=Math.min(255,(gx+gy)*2.4);out[i]=Math.max(mask[i],Math.min(230,edge));
  }
  return blurMask(closeMask(out,w,h,1),w,h,1);
}
async function smartBustMask(canvas,base){
  const anchor=await detectFaceAnchor(canvas,base);if(!anchor)throw makeError('No pude localizar el rostro para construir el busto.','BUST_NO_FACE');
  logDebug('BUST anchor',anchor);const candidates=[];
  const heuristic=buildBustMask(canvas,base,anchor);candidates.push({name:'subject+anatomy',mask:heuristic,quality:scoreBustMask(heuristic,canvas.width,canvas.height,anchor)});
  await letOverlayPaint();
  const grab=opencvGrabCutBust(canvas,base,anchor);if(grab)candidates.push({name:'grabcut',mask:grab,quality:scoreBustMask(grab,canvas.width,canvas.height,anchor)});
  // Conservative anatomical candidate. It prevents total failure when the background is busy.
  const prior=buildAnatomicalBustPrior(anchor,canvas.width,canvas.height),priorMask=thresholdMask(prior,105);
  let anatomical=largestCenterComponent(closeMask(priorMask,canvas.width,canvas.height,1),canvas.width,canvas.height);anatomical=blurMask(anatomical,canvas.width,canvas.height,1);
  candidates.push({name:'anatomical-recovery',mask:anatomical,quality:scoreBustMask(anatomical,canvas.width,canvas.height,anchor)});
  candidates.sort((a,b)=>b.quality.score-a.quality.score);logDebug('BUST candidates',candidates.map(c=>({name:c.name,...c.quality})));
  let best=candidates[0];
  // If GrabCut and heuristic are both plausible, intersect background-sensitive edges while preserving foreground core.
  if(grab){
    const qg=candidates.find(c=>c.name==='grabcut')?.quality,qh=candidates.find(c=>c.name==='subject+anatomy')?.quality;
    if(qg&&qh&&qg.score>28&&qh.score>28){
      const fused=new Uint8Array(base.length);for(let i=0;i<fused.length;i++){const g=grab[i],h=heuristic[i],a=prior[i];fused[i]=(g>80&&h>80)?255:((g>80||h>80)&&a>150?220:0);}let f=blurMask(closeMask(largestCenterComponent(fused,canvas.width,canvas.height),canvas.width,canvas.height,1),canvas.width,canvas.height,1);const fq=scoreBustMask(f,canvas.width,canvas.height,anchor);candidates.push({name:'fused',mask:f,quality:fq});if(fq.score>best.quality.score)best=candidates[candidates.length-1];
    }
  }
  let result=edgeAwareRefine(best.mask,canvas,anchor);
  // ID/bust is intentionally conservative: never allow the selection to spill across the photo.
  // Intersect the candidate with a head/neck/shoulders envelope anchored to the detected face.
  const w=canvas.width,h=canvas.height,guard=new Uint8Array(w*h);
  const cx=anchor.x+anchor.w*.5,top=Math.max(0,anchor.y-anchor.h*.42),bottom=Math.min(h-1,anchor.y+anchor.h*2.18);
  for(let y=Math.floor(top);y<=Math.floor(bottom);y++){
    const below=Math.max(0,(y-(anchor.y+anchor.h))/Math.max(1,anchor.h));
    const half=anchor.w*(y<anchor.y ? .68 : y<=anchor.y+anchor.h ? .72 : Math.min(1.42,.78+.34*below));
    for(let x=Math.max(0,Math.floor(cx-half));x<=Math.min(w-1,Math.ceil(cx+half));x++) guard[y*w+x]=255;
  }
  const clipped=new Uint8Array(result.length);for(let i=0;i<clipped.length;i++)clipped[i]=(result[i]>70&&guard[i])?result[i]:0;
  result=blurMask(closeMask(largestCenterComponent(clipped,w,h),w,h,1),w,h,1);
  let finalQ=scoreBustMask(result,w,h,anchor),ratio=result.reduce((n,v)=>n+(v>80),0)/(w*h);
  logDebug('BUST winner',{name:best.name,...finalQ,guardedRatio:ratio});
  if(ratio<.025||ratio>.58){
    // Stable recovery for mobile: return a conservative anatomical head/neck/shoulder region
    // instead of failing completely. This is intentionally smaller than a full-person mask.
    const recoveryPrior=buildAnatomicalBustPrior(anchor,w,h);
    let recovery=thresholdMask(recoveryPrior,118);
    recovery=largestCenterComponent(closeMask(recovery,w,h,1),w,h);
    recovery=blurMask(recovery,w,h,1);
    const rr=recovery.reduce((n,v)=>n+(v>80),0)/(w*h);
    if(rr>=.018&&rr<=.50){
      result=recovery;
      finalQ=scoreBustMask(result,w,h,anchor);
      ratio=rr;
      logDebug('BUST anatomical recovery accepted',{...finalQ,ratio});
    }else{
      throw makeError('No pude localizar el busto con seguridad. Prueba con la cara más centrada.','BUST_UNSAFE_MASK');
    }
  }
  result._photoIAQuality=finalQ;return result;
}

function ycbcr(r,g,b){
  return {y:.299*r+.587*g+.114*b,cb:128-.168736*r-.331264*g+.5*b,cr:128+.5*r-.418688*g-.081312*b};
}
function robustStats(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),trim=Math.floor(sorted.length*.12),core=sorted.slice(trim,Math.max(trim+1,sorted.length-trim));
  const mean=core.reduce((a,b)=>a+b,0)/core.length;
  const variance=core.reduce((s,v)=>s+(v-mean)*(v-mean),0)/core.length;
  return {mean,std:Math.sqrt(Math.max(1,variance))};
}
function buildFaceMaskFromAnchor(canvas,base,anchor){
  if(!anchor)return null;
  const w=canvas.width,h=canvas.height,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,out=new Uint8Array(w*h);
  const cx=anchor.x+anchor.w*.5,cy=anchor.y+anchor.h*.54,rx=Math.max(3,anchor.w*.46),ry=Math.max(3,anchor.h*.50);
  for(let y=Math.max(0,Math.floor(anchor.y-anchor.h*.04));y<Math.min(h,Math.ceil(anchor.y+anchor.h*1.04));y++){
    for(let x=Math.max(0,Math.floor(anchor.x));x<Math.min(w,Math.ceil(anchor.x+anchor.w));x++){
      const i=y*w+x;if(base[i]<35)continue;
      const dx=(x-cx)/rx,dy=(y-cy)/ry,d2=dx*dx+dy*dy;if(d2>1)continue;
      const j=i*4,skin=skinConfidence(rgba[j],rgba[j+1],rgba[j+2]);
      const central=d2<.58;
      if(skin||central)out[i]=255;
    }
  }
  let m=closeMask(out,w,h,1);m=largestCenterComponent(m,w,h);m=blurMask(m,w,h,1);
  return m;
}
function learnSkinModel(canvas,faceMask){
  if(!faceMask)return null;
  const w=canvas.width,h=canvas.height,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,cbs=[],crs=[],ys=[];
  for(let i=0;i<faceMask.length;i++){
    if(faceMask[i]<150)continue;const j=i*4,r=rgba[j],g=rgba[j+1],b=rgba[j+2];
    const c=ycbcr(r,g,b);
    if(c.y<42||c.y>242)continue;
    if(skinConfidence(r,g,b)||faceMask[i]>235){cbs.push(c.cb);crs.push(c.cr);ys.push(c.y);}
  }
  const cb=robustStats(cbs),cr=robustStats(crs),y=robustStats(ys);
  if(!cb||!cr||cbs.length<24)return null;
  return {cb,cr,y,n:cbs.length};
}
function adaptiveSkinScore(r,g,b,model){
  const c=ycbcr(r,g,b);let generic=skinConfidence(r,g,b)?1:0;
  if(!model)return generic;
  const zcb=Math.abs(c.cb-model.cb.mean)/Math.max(6,model.cb.std*2.2),zcr=Math.abs(c.cr-model.cr.mean)/Math.max(7,model.cr.std*2.2);
  const chroma=Math.sqrt(zcb*zcb+zcr*zcr),lumOk=c.y>Math.max(28,model.y.mean-100)&&c.y<Math.min(252,model.y.mean+115);
  if(chroma<1.0&&lumOk)return 1;
  if(chroma<1.45&&lumOk&&generic)return .82;
  return generic?.45:0;
}
function anatomicalSkinPrior(anchor,w,h,x,y){
  if(!anchor)return .45;
  const cx=anchor.x+anchor.w*.5,faceBottom=anchor.y+anchor.h;
  if(y<=faceBottom*1.04)return 1;
  const relY=(y-faceBottom)/Math.max(1,h-faceBottom),dx=Math.abs(x-cx);
  if(y<faceBottom+anchor.h*.72&&dx<anchor.w*.52)return .95;
  if(y<faceBottom+anchor.h*2.9&&dx>anchor.w*.45&&dx<anchor.w*1.65)return .82;
  if(relY>.52&&dx>anchor.w*.22&&dx<anchor.w*1.5)return .74;
  return .34;
}
function buildSemanticSkinMask(canvas,base,faceMask,anchor){
  const w=canvas.width,h=canvas.height,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,out=new Uint8Array(w*h),model=learnSkinModel(canvas,faceMask);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(base[i]<55)continue;
    if(faceMask&&faceMask[i]>70){out[i]=255;continue;}
    const j=i*4,score=adaptiveSkinScore(rgba[j],rgba[j+1],rgba[j+2],model),prior=anatomicalSkinPrior(anchor,w,h,x,y);
    if(score*prior>.54)out[i]=255;
  }
  let skin=closeMask(out,w,h,1);skin=openMask(skin,w,h,1);skin=blurMask(skin,w,h,1);return skin;
}
function buildHairMask(canvas,base,faceMask,anchor){
  if(!anchor)return new Uint8Array(base.length);
  const w=canvas.width,h=canvas.height,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,out=new Uint8Array(w*h);
  const cx=anchor.x+anchor.w*.5,top=Math.max(0,Math.floor(anchor.y-anchor.h*.34)),bottom=Math.min(h,Math.ceil(anchor.y+anchor.h*.96)),rx=anchor.w*.78;
  for(let y=top;y<bottom;y++)for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(w,Math.ceil(cx+rx));x++){
    const i=y*w+x;if(base[i]<45||(faceMask&&faceMask[i]>120))continue;
    const j=i*4,c=ycbcr(rgba[j],rgba[j+1],rgba[j+2]),dx=Math.abs(x-cx)/rx,spatial=(1-dx)*.65+(y<anchor.y+anchor.h*.35?.35:0),darkness=Math.max(0,(150-c.y)/115);
    if(spatial+darkness>.72)out[i]=255;
  }
  return blurMask(closeMask(out,w,h,1),w,h,1);
}
function subtractMasks(base,...cuts){
  const out=new Uint8Array(base.length);for(let i=0;i<base.length;i++){if(base[i]<55)continue;let cut=0;for(const m of cuts)if(m)cut=Math.max(cut,m[i]||0);out[i]=Math.max(0,base[i]-Math.min(255,cut));}return out;
}

function median(values){
  if(!values?.length)return null;
  const a=[...values].sort((x,y)=>x-y),m=(a.length-1)/2;
  return Number.isInteger(m)?a[m]:(a[Math.floor(m)]+a[Math.ceil(m)])/2;
}
function mad(values,center){
  if(!values?.length)return 1;
  return Math.max(1,median(values.map(v=>Math.abs(v-center)))||1);
}
function learnPersonalSkinFromAnchor(canvas,anchor){
  if(!anchor)return null;
  const w=canvas.width,h=canvas.height;
  const data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const cbs=[],crs=[],ys=[];
  const cx=anchor.x+anchor.w*.5, cy=anchor.y+anchor.h*.56;
  const rx=Math.max(4,anchor.w*.33), ry=Math.max(4,anchor.h*.38);
  const y0=Math.max(0,Math.floor(anchor.y+anchor.h*.18));
  const y1=Math.min(h,Math.ceil(anchor.y+anchor.h*.88));
  const x0=Math.max(0,Math.floor(anchor.x+anchor.w*.16));
  const x1=Math.min(w,Math.ceil(anchor.x+anchor.w*.84));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const ex=(x-cx)/rx,ey=(y-cy)/ry;
    if(ex*ex+ey*ey>1)continue;
    const j=(y*w+x)*4,r=data[j],g=data[j+1],b=data[j+2],c=ycbcr(r,g,b);
    if(c.y<45||c.y>238)continue;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    if(mx-mn>115)continue;
    cbs.push(c.cb);crs.push(c.cr);ys.push(c.y);
  }
  if(cbs.length<28)return null;
  const cb=median(cbs),cr=median(crs),yy=median(ys);
  return {
    cb,cr,y:yy,
    cbMad:Math.max(3.5,mad(cbs,cb)),
    crMad:Math.max(3.5,mad(crs,cr)),
    yMad:Math.max(10,mad(ys,yy)),
    n:cbs.length
  };
}
function personalSkinScore(r,g,b,m){
  const c=ycbcr(r,g,b);
  if(!m)return skinConfidence(r,g,b)?1:0;
  const dcb=Math.abs(c.cb-m.cb)/Math.max(7,m.cbMad*3.2);
  const dcr=Math.abs(c.cr-m.cr)/Math.max(8,m.crMad*3.2);
  const chroma=Math.sqrt(dcb*dcb+dcr*dcr);
  const yOk=c.y>Math.max(28,m.y-115)&&c.y<Math.min(252,m.y+125);
  if(!yOk)return 0;
  if(chroma<.72)return 1;
  if(chroma<1.05)return .86;
  if(chroma<1.34&&skinConfidence(r,g,b))return .70;
  return 0;
}
function skinSearchEnvelope(anchor,w,h,x,y){
  if(!anchor)return 1;
  const cx=anchor.x+anchor.w*.5;
  const faceBottom=anchor.y+anchor.h;
  const fx=(x-cx)/(anchor.w*.67), fy=(y-(anchor.y+anchor.h*.53))/(anchor.h*.66);
  if(fx*fx+fy*fy<=1.0)return 1;
  if(y>=faceBottom-anchor.h*.02 && y<=faceBottom+anchor.h*.78 &&
     Math.abs(x-cx)<=anchor.w*.48)return .95;
  if(y>=faceBottom+anchor.h*.20 && y<=Math.min(h,faceBottom+anchor.h*3.4) &&
     Math.abs(x-cx)>=anchor.w*.45 && Math.abs(x-cx)<=anchor.w*1.85)return .78;
  return 0;
}
function buildAdaptivePersonalSkinMask(canvas,anchor){
  const w=canvas.width,h=canvas.height;
  const rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const model=learnPersonalSkinFromAnchor(canvas,anchor);
  if(!model)throw makeError('No pude aprender el tono de piel de esta foto.','SKIN_MODEL_EMPTY');
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const prior=skinSearchEnvelope(anchor,w,h,x,y);
    if(prior<=0)continue;
    const j=(y*w+x)*4;
    const s=personalSkinScore(rgba[j],rgba[j+1],rgba[j+2],model)*prior;
    if(s>.61)out[y*w+x]=255;
    else if(s>.48)out[y*w+x]=165;
  }
  let m=closeMask(out,w,h,1);
  m=openMask(m,w,h,1);
  m=blurMask(m,w,h,1);
  return m;
}
function buildStableIdRegion(anchor,w,h){
  const out=new Uint8Array(w*h);
  const cx=anchor.x+anchor.w*.5;
  const faceCy=anchor.y+anchor.h*.52;
  const headRx=anchor.w*.72, headRy=anchor.h*.78;
  const neckTop=anchor.y+anchor.h*.80;
  const shoulderBottom=Math.min(h-1,anchor.y+anchor.h*2.45);
  for(let y=Math.max(0,Math.floor(anchor.y-anchor.h*.28));y<=shoulderBottom;y++){
    let half=0;
    if(y<=anchor.y+anchor.h*1.08){
      const dy=(y-faceCy)/headRy;
      if(Math.abs(dy)<=1)half=headRx*Math.sqrt(Math.max(0,1-dy*dy));
    }else{
      const t=(y-(anchor.y+anchor.h*1.02))/Math.max(1,shoulderBottom-(anchor.y+anchor.h*1.02));
      half=anchor.w*(.50+1.12*Math.pow(Math.max(0,t),.72));
    }
    if(y>=neckTop&&y<=anchor.y+anchor.h*1.48)half=Math.max(half,anchor.w*.43);
    const left=Math.max(0,Math.floor(cx-half)),right=Math.min(w-1,Math.ceil(cx+half));
    for(let x=left;x<=right;x++){
      const edge=half?Math.abs(x-cx)/half:1;
      out[y*w+x]=edge<.90?255:Math.round(255*Math.max(0,(1-edge)/.10));
    }
  }
  return blurMask(closeMask(out,w,h,1),w,h,1);
}

async function semanticMasks(canvas,person){
  const w=canvas.width,h=canvas.height,anchor=await detectFaceAnchor(canvas,person);
  if(!anchor)throw makeError('No pude localizar el rostro con suficiente precisión.','SEMANTIC_NO_FACE');
  const face=buildFaceMaskFromAnchor(canvas,person,anchor);
  if(!face||!maskBounds(face,w,h))throw makeError('No pude construir una máscara facial confiable.','SEMANTIC_FACE_EMPTY');
  let skin;
  try{ skin=buildAdaptivePersonalSkinMask(canvas,anchor); }
  catch(err){
    logDebug('SKIN adaptive fallback',err);
    skin=buildSemanticSkinMask(canvas,person,face,anchor);
  }
  const hair=buildHairMask(canvas,person,face,anchor);
  let clothing=subtractMasks(person,skin,hair,face);
  clothing=closeMask(clothing,w,h,1);clothing=openMask(clothing,w,h,1);clothing=blurMask(clothing,w,h,1);
  const faceArea=face.reduce((n,v)=>n+(v>100),0);
  const personArea=person.reduce((n,v)=>n+(v>100),0);
  const skinArea=skin.reduce((n,v)=>n+(v>100),0);
  const confidence=Math.max(1,Math.min(99,Math.round(
    68+(anchor.source==='FaceDetector'?20:anchor.source==='skin-anchor'?12:4)
  )));
  state.semantic={
    faceAnchor:anchor,faceMask:face,skinMask:skin,hairMask:hair,clothingMask:clothing,
    confidence:{face:confidence,skin:Math.max(30,Math.min(98,Math.round(58+Math.min(.32,skinArea/Math.max(1,w*h))*105)))}
  };
  logDebug('SEMANTIC fallback',{anchor,confidence:state.semantic.confidence,personArea,faceArea,skinArea});
  return state.semantic;
}

function profileMask(base,w,h,mode='person',canvas=null){if(mode==='person')return base;const box=maskBounds(base,w,h);if(!box)return base;const out=new Uint8Array(base.length),cx=box.x+box.w/2;
  if(mode==='face'){const fb=faceBoxFromPerson(base,w,h);if(!fb)return out;const ecx=fb.x+fb.w/2,ecy=fb.y+fb.h*.52,rx=fb.w*.48,ry=fb.h*.48;for(let y=Math.max(0,Math.floor(fb.y));y<Math.min(h,Math.ceil(fb.y+fb.h));y++)for(let x=Math.max(0,Math.floor(fb.x));x<Math.min(w,Math.ceil(fb.x+fb.w));x++){const i=y*w+x,ellipse=((x-ecx)/rx)**2+((y-ecy)/ry)**2;if(ellipse<=1&&base[i]>55)out[i]=255;}return blurMask(closeMask(out,w,h,1),w,h,2);}
  if(mode==='skin'&&canvas){const rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){const i=y*w+x;if(base[i]<45)continue;const j=i*4;if(skinConfidence(rgba[j],rgba[j+1],rgba[j+2]))out[i]=255;}let skin=closeMask(out,w,h,1);skin=openMask(skin,w,h,1);return blurMask(skin,w,h,1);}
  return base;}
function refineCurrentMask(){if(!state.mask)return api()?.toast('Primero crea una máscara.');const {data,width,height}=state.mask;let refined=closeMask(data,width,height,1);refined=openMask(refined,width,height,1);refined=blurMask(refined,width,height,2);setMask(refined,width,height,state.maskKind||'Selección refinada');setStatus('Máscara refinada: recuperé huecos pequeños, limpié ruido y suavicé el borde.','ready');api()?.toast('Máscara refinada');}
function magicWandMask(canvas,nx,ny){const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height,rgba=ctx.getImageData(0,0,w,h).data,sx=Math.max(0,Math.min(w-1,Math.round(nx*(w-1)))),sy=Math.max(0,Math.min(h-1,Math.round(ny*(h-1)))),si=(sy*w+sx)*4,sr=rgba[si],sg=rgba[si+1],sb=rgba[si+2],mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;q[tail++]=sy*w+sx;seen[sy*w+sx]=1;let meanR=sr,meanG=sg,meanB=sb,n=1;const maxArea=w*h*.62;
  while(head<tail&&tail<maxArea){const idx=q[head++],x=idx%w,y=(idx/w)|0,j=idx*4,r=rgba[j],g=rgba[j+1],b=rgba[j+2];mask[idx]=255;n++;const a=.018;meanR=meanR*(1-a)+r*a;meanG=meanG*(1-a)+g*a;meanB=meanB*(1-a)+b*a;for(const ni of [idx-1,idx+1,idx-w,idx+w]){if(ni<0||ni>=w*h||seen[ni])continue;const xx=ni%w,yy=(ni/w)|0;if(Math.abs(xx-x)+Math.abs(yy-y)!==1)continue;seen[ni]=1;const k=ni*4,rr=rgba[k],gg=rgba[k+1],bb=rgba[k+2],dSeed=colorDistance(rr,gg,bb,sr,sg,sb),dMean=colorDistance(rr,gg,bb,meanR,meanG,meanB),dLocal=colorDistance(rr,gg,bb,r,g,b);if((dSeed<82&&dMean<62&&dLocal<42)||(dMean<46&&dLocal<50))q[tail++]=ni;}}
  if(tail<100)throw makeError('La selección quedó muy pequeña. Toca más cerca del centro del objeto.');if(tail>w*h*.60)throw makeError('La selección tomó demasiado. Toca una zona más definida del objeto.');let result=closeMask(mask,w,h,1);result=largestCenterComponentForSeed(result,w,h,sx,sy);return blurMask(result,w,h,1);}
function largestCenterComponentForSeed(mask,w,h,sx,sy){const seed=sy*w+sx;if(mask[seed]<80)return mask;const out=new Uint8Array(mask.length),seen=new Uint8Array(mask.length),q=new Int32Array(mask.length);let head=0,tail=0;q[tail++]=seed;seen[seed]=1;while(head<tail){const idx=q[head++];out[idx]=255;const x=idx%w,y=(idx/w)|0;for(const ni of [idx-1,idx+1,idx-w,idx+w]){if(ni<0||ni>=mask.length||seen[ni]||mask[ni]<80)continue;const nx=ni%w,ny=(ni/w)|0;if(Math.abs(nx-x)+Math.abs(ny-y)!==1)continue;seen[ni]=1;q[tail++]=ni;}}return out;}

const debug={entries:[],startedAt:Date.now()};
try{const saved=JSON.parse(localStorage.getItem(DEBUG_KEY)||'null');if(saved?.entries?.length)debug.entries=saved.entries.slice(-250);}catch(_){ }
function serialize(value){
  if(value instanceof Error)return {name:value.name,message:value.message,stack:value.stack,code:value.code};
  if(value===undefined)return 'undefined';
  try{return JSON.parse(JSON.stringify(value));}catch(_){return String(value);}
}
function logDebug(step,data){
  const entry={time:new Date().toISOString(),ms:Date.now()-debug.startedAt,step,data:serialize(data)};
  debug.entries.push(entry); if(debug.entries.length>250)debug.entries.shift();
  try{localStorage.setItem(DEBUG_KEY,JSON.stringify({entries:debug.entries,savedAt:Date.now()}));}catch(_){ }
  console.log('[PHOTO IA DEBUG]',step,data??''); renderDebug();
  return entry;
}
function environmentInfo(){
  return {
    version:VERSION,url:location.href,online:navigator.onLine,userAgent:navigator.userAgent,
    platform:navigator.platform,language:navigator.language,hardwareConcurrency:navigator.hardwareConcurrency,
    deviceMemory:navigator.deviceMemory||'unknown',crossOriginIsolated:self.crossOriginIsolated,
    webAssembly:typeof WebAssembly!=='undefined',onnxRuntime:window.PhotoONNX?.status?.()||{loaded:!!window.ort},webGL:!!document.createElement('canvas').getContext('webgl'),
    webGL2:!!document.createElement('canvas').getContext('webgl2'),screen:`${screen.width}x${screen.height}`
  };
}
function debugText(){return JSON.stringify({environment:environmentInfo(),entries:debug.entries},null,2)}
function renderDebug(){
  const box=$('segment-debug-log');
  if(!box)return;
  box.textContent=debug.entries.map(e=>{
    const details=e.data!==undefined?`\n${JSON.stringify(e.data,null,2)}`:'';
    return `+${(e.ms/1000).toFixed(2)}s  ${e.step}${details}`;
  }).join('\n\n');
  box.scrollTop=box.scrollHeight;
}
async function copyDebug(){
  const text=debugText();
  try{await navigator.clipboard.writeText(text);api()?.toast('Diagnóstico copiado');}
  catch(_){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();api()?.toast('Diagnóstico copiado');}
}
function downloadDebug(){
  const blob=new Blob([debugText()],{type:'application/json'});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`photo-ia-diagnostico-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function probeUrl(name,url){
  logDebug(`PRUEBA ${name}: inicio`,url);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const r=await fetch(url,{method:'GET',cache:'no-store',signal:controller.signal});
    logDebug(`PRUEBA ${name}: respuesta`,{ok:r.ok,status:r.status,type:r.type,contentType:r.headers.get('content-type'),length:r.headers.get('content-length')});
    try{await r.body?.cancel?.();}catch(_){}
    return r.ok;
  }catch(err){logDebug(`PRUEBA ${name}: ERROR`,err);return false;}finally{clearTimeout(timer)}
}
async function runConnectionTests(){
  setStatus('Ejecutando pruebas de conexión…','loading');
  const results=[];
  results.push(await probeUrl('MediaPipe ESM',MEDIAPIPE_ESM));
  results.push(await probeUrl('MediaPipe Multiclase',MULTICLASS_MODEL));
  results.push(await probeUrl('ONNX Runtime','./assets/vendor/ort.min.js?v=15.16'));
  results.push(await probeUrl('WASM loader',`${MEDIAPIPE_WASM}/vision_wasm_internal.js`));
  results.push(await probeUrl('WASM SIMD',`${MEDIAPIPE_WASM}/vision_wasm_internal.wasm`));
  results.push(await probeUrl('WASM sin SIMD',`${MEDIAPIPE_WASM}/vision_wasm_nosimd_internal.wasm`));
  results.push(await probeUrl('Modelo persona',PERSON_MODEL));
  results.push(await probeUrl('Modelo interactivo',INTERACTIVE_MODEL));
  setStatus(results.every(Boolean)?'Todas las direcciones respondieron. Prueba Separar persona.':'Una o más descargas fallaron. Abre el diagnóstico.','error');
}
async function fetchModelBuffer(url,operation,label){
  const candidates=[url,MODEL_REMOTE.get(url)].filter(Boolean);let lastErr=null;
  for(const candidate of candidates){
    logDebug(`${label}: descarga binaria inicio`,candidate);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),candidate===url?22000:60000);
    try{
      const response=await fetch(candidate,{cache:'force-cache',signal:controller.signal});
      if(!response.ok)throw makeError(`${label}: HTTP ${response.status}`,'MODEL_FETCH');
      const buffer=await response.arrayBuffer();logDebug(`${label}: descarga binaria correcta`,{url:candidate,bytes:buffer.byteLength});
      if(operation?.cancelled)throw makeError('Proceso cancelado.','CANCELLED');return new Uint8Array(buffer);
    }catch(err){lastErr=err;logDebug(`${label}: fuente falló`,{url:candidate,error:String(err?.message||err)});}
    finally{clearTimeout(timer)}
  }
  throw lastErr||makeError(`${label}: no disponible.`,'MODEL_FETCH');
}

window.addEventListener('error',e=>logDebug('ERROR GLOBAL',{message:e.message,source:e.filename,line:e.lineno,column:e.colno,error:serialize(e.error)}));
window.addEventListener('unhandledrejection',e=>logDebug('PROMESA RECHAZADA',e.reason));

function setStatus(text,kind=''){
  const el=$('segment-status'); if(!el)return;
  el.textContent=text; el.className=`segment-status ${kind}`.trim();
}
function updateUI(){
  const ready=!!api()?.state?.photo;
  ['segment-person','segment-tap','segment-show','segment-hide','segment-clear','segment-cutout'].forEach(id=>{
    const el=$(id); if(!el)return;
    if(id==='segment-person'||id==='segment-tap')el.disabled=!ready||state.loading;
    else el.disabled=!state.mask||state.loading;
  });
  const cancel=$('segment-cancel'); if(cancel)cancel.disabled=!state.loading;
  const overlayCancel=$('processing-cancel'); if(overlayCancel)overlayCancel.hidden=!state.loading;
  const badge=$('segment-badge');
  if(badge)badge.textContent=state.loading?'Procesando…':state.mask?'Máscara lista':state.tapMode?'Toca la foto':'Sin máscara';
}
function makeError(message,code='SEGMENTATION_ERROR'){
  const err=new Error(message); err.code=code; return err;
}
function timeout(promise,ms,message,operation){
  logDebug('Timeout armado',{ms,message,operationId:operation?.id});
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>{logDebug('TIMEOUT DISPARADO',{ms,message,operationId:operation?.id});reject(makeError(message,'TIMEOUT'))},ms)})
  ]).finally(()=>clearTimeout(timer)).then(value=>{
    if(operation?.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    return value;
  });
}
function beginOperation(label){
  logDebug('OPERACIÓN INICIADA',label);
  cancelCurrent(false);
  const operation={id:++state.operationId,cancelled:false,label};
  state.operation=operation; state.loading=true; updateUI();
  api()?.processing(true,label);
  return operation;
}
function finishOperation(operation){
  logDebug('OPERACIÓN FINALIZADA',{id:operation?.id,cancelled:operation?.cancelled});
  if(state.operation!==operation)return;
  state.operation=null;
  state.loading=false; api()?.processing(false); updateUI();
}
function cancelCurrent(showMessage=true){
  if(state.operation)state.operation.cancelled=true;
  if(state.mlWorker)terminateMLWorker('cancelado por el usuario');
  state.operation=null; state.loading=false; state.tapMode=false;
  api()?.processing(false); updateUI();
  setStatus(showMessage?'Proceso cancelado.':'Listo para segmentar.',showMessage?'error':'');
  if(showMessage)api()?.toast('Segmentación cancelada');
}
function friendlyError(err){
  if(err?.code==='CANCELLED')return 'Proceso cancelado.';
  if(err?.code==='TIMEOUT')return `${err.message} PHOTO IA liberó el proceso automáticamente.`;
  const text=String(err?.message||err||'').toLowerCase();
  if(text.includes('fetch')||text.includes('network')||text.includes('failed to load'))return 'No se pudo descargar el modelo. Revisa internet e inténtalo otra vez.';
  if(text.includes('memory')||text.includes('out of bounds'))return 'El teléfono se quedó sin memoria. Prueba con una foto más pequeña.';
  if(text.includes('webgl')||text.includes('gpu'))return 'La aceleración gráfica falló. PHOTO IA intentará usar CPU al volver a probar.';
  return err?.message||'No pude completar la segmentación.';
}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(makeError('No pude leer la fotografía.'));img.src=src;});}
async function getWorkCanvas(operation){
  logDebug('Preparando canvas de trabajo');
  const photo=api()?.state?.photo;if(!photo)throw makeError('Abre una foto primero.');
  const img=await timeout(loadImage(api().state.originalDataUrl),8000,'La fotografía tardó demasiado en abrirse.',operation);
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const max=isMobile?256:512;
  const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true,alpha:false});
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  state.workCanvas=canvas; logDebug('Canvas listo',{width:canvas.width,height:canvas.height,originalWidth:img.naturalWidth,originalHeight:img.naturalHeight}); return canvas;
}

function workerSupported(){return typeof Worker!=='undefined'&&typeof ImageData!=='undefined';}
function terminateMLWorker(reason='reset'){
  try{state.mlWorker?.terminate?.();}catch(_){ }
  state.mlWorker=null;state.workerWarm=false;
  for(const [,p] of state.workerPending){clearTimeout(p.timer);p.reject(makeError(`Motor aislado reiniciado: ${reason}`,'WORKER_RESET'));}
  state.workerPending.clear();state.workerDiag={...state.workerDiag,worker:'STOPPED',lastPhase:reason,error:reason};
}
function ensureMLWorker(){
  if(state.mlWorker)return state.mlWorker;
  if(!workerSupported())throw makeError('Este navegador no admite Web Workers.','WORKER_UNSUPPORTED');
  const w=new Worker(`./segmentation-worker.js?v=15.16`); // classic worker: MediaPipe internally uses importScripts()
  state.workerDiag={...state.workerDiag,worker:'STARTING',error:''};
  w.onmessage=e=>{
    const d=e.data||{};
    if(d.diag)state.workerDiag={...state.workerDiag,...d.diag};
    if(d.type==='phase'){
      state.workerDiag.lastPhase=d.phase||state.workerDiag.lastPhase;
      if(state.loading&&d.phase)setStatus(d.phase,'loading');
      return;
    }
    if(d.type==='ready'){state.workerDiag.worker='READY';return;}
    if(d.type==='result'||d.type==='error'||d.type==='pong'){
      const pending=state.workerPending.get(d.id);if(!pending)return;
      clearTimeout(pending.timer);state.workerPending.delete(d.id);
      if(d.type==='error')pending.reject(makeError(d.message||'El worker de IA falló.','WORKER_INFERENCE'));
      else pending.resolve(d);
    }
  };
  w.onerror=err=>{
    const msg=String(err?.message||'Error del worker');state.workerDiag={...state.workerDiag,worker:'ERROR',error:msg,lastPhase:'error'};
    terminateMLWorker(msg);
  };
  state.mlWorker=w;return w;
}
function workerProfile(work,mode,operation){
  const worker=ensureMLWorker(),id=++state.workerSeq;
  const ctx=work.getContext('2d',{willReadFrequently:true});
  const img=ctx.getImageData(0,0,work.width,work.height);
  const first=!state.workerWarm;
  const timeoutMs=first?18000:6500;
  state.workerDiag={...state.workerDiag,lastTask:mode,input:`${work.width}×${work.height}`,lastPhase:'queued',error:''};
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      state.workerPending.delete(id);
      state.workerDiag={...state.workerDiag,lastPhase:'timeout',error:`Timeout ${timeoutMs}ms`};
      try{worker.terminate();}catch(_){ }
      state.mlWorker=null;state.workerWarm=false;
      reject(makeError('El motor de IA tardó demasiado y fue detenido sin congelar la app.','WORKER_TIMEOUT'));
    },timeoutMs);
    state.workerPending.set(id,{resolve:d=>{state.workerWarm=true;resolve(d)},reject,timer});
    const buf=img.data.buffer;
    worker.postMessage({id,type:'profile',mode,width:work.width,height:work.height,rgba:buf},[buf]);
    if(operation?.cancelled){clearTimeout(timer);state.workerPending.delete(id);reject(makeError('Proceso cancelado.','CANCELLED'));}
  });
}
function showWorkerDiagnostics(){
  const d=state.workerDiag||{};
  const lines=[
    'PHOTO IA · Motor de selección',
    `Worker: ${d.worker||'-'}`,
    `Worker build: ${d.workerVersion||'15.16'}`,
    `Worker type: ${d.workerKind||'classic'}`,
    `importScripts: ${d.importScriptsAvailable||'-'}`,
    `Módulo: ${d.module||'NOT_LOADED'} (${d.moduleSource||'-'})`,
    `WASM: ${d.wasm||'NOT_LOADED'} (${d.wasmSource||'-'})`,
    `Selfie model: ${d.personModel||'NOT_LOADED'}`,
    `Face model: ${d.faceModel||'NOT_LOADED'}`,
    `Multiclase: ${d.multiclassModel||'NOT_LOADED'}`, 
    `Última tarea: ${d.lastTask||'-'}`,
    `Fase: ${d.lastPhase||'-'}`,
    `Entrada: ${d.input||'-'}`,
    `Tiempo total: ${d.lastMs?d.lastMs+' ms':'-'}`,
    d.personMs?`Selfie Segmentation: ${d.personMs} ms`:null,
    d.faceMs?`Face Landmarker: ${d.faceMs} ms`:null,
    d.multiclassMs?`Multiclase: ${d.multiclassMs} ms`:null,
    d.error?`Error: ${d.error}`:'Error: ninguno'
  ].filter(Boolean);
  alert(lines.join('\n'));
}

async function loadModule(operation){
  if(state.module&&state.fileset)return state.module;
  if(!state.modulePromise){
    state.modulePromise=(async()=>{
      setStatus('Descargando motor de segmentación…','loading');
      logDebug('IMPORT ESM: inicio',MEDIAPIPE_ESM);
      let mod;try{mod=await import(MEDIAPIPE_ESM);}catch(localErr){logDebug('IMPORT ESM local falló',localErr);mod=await import(MEDIAPIPE_ESM_REMOTE);}
      logDebug('IMPORT ESM: correcto',{exports:Object.keys(mod)});
      logDebug('FILESET WASM: inicio',MEDIAPIPE_WASM);
      let fileset;try{fileset=await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);}catch(localErr){logDebug('WASM local falló',localErr);fileset=await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_REMOTE);}
      logDebug('FILESET WASM: correcto',fileset);
      state.module=mod;state.fileset=fileset;return mod;
    })().catch(err=>{logDebug('CARGA DEL MOTOR: ERROR',err);state.modulePromise=null;state.module=null;state.fileset=null;throw err;});
  }
  return timeout(state.modulePromise,LOAD_TIMEOUT,'El motor tardó demasiado en descargar. Revisa internet y vuelve a intentar.',operation);
}
async function createWithFallback(factory,operation,label){
  logDebug('CREAR MODELO: entrada',{label,isIOS:/iPad|iPhone|iPod/.test(navigator.userAgent)});
  setStatus(label,'loading');
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  // En iPhone/iPad el delegate GPU puede quedarse bloqueado dentro de WebGL.
  // CPU es más estable y con los modelos reducidos termina en pocos segundos.
  if(isIOS){
    // MediaPipe Web no necesita que se fuerce el texto "CPU". En WebKit esa
    // opción puede dejar createFromOptions pendiente. Sin delegate usa CPU/WASM
    // automáticamente, que es el camino compatible con iPhone.
    setStatus(`${label} Iniciando motor compatible con iPhone…`,'loading');
    logDebug('CREATE FROM OPTIONS: automático/CPU inicio');
    const created=await timeout(factory(null),LOAD_TIMEOUT,'No se pudo iniciar el modelo compatible con iPhone.',operation);
    logDebug('CREATE FROM OPTIONS: automático/CPU correcto');return created;
  }
  try{
    logDebug('CREATE FROM OPTIONS: GPU inicio');
    const created=await timeout(factory('GPU'),LOAD_TIMEOUT,'El modelo tardó demasiado en iniciar.',operation);
    logDebug('CREATE FROM OPTIONS: GPU correcto');return created;
  }catch(gpuErr){
    if(operation.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    logDebug('CREATE FROM OPTIONS: GPU ERROR',gpuErr);console.warn('GPU unavailable, retrying on CPU',gpuErr);
    setStatus('La GPU no respondió. Reintentando con CPU…','loading');
    logDebug('CREATE FROM OPTIONS: CPU inicio');
    const created=await timeout(factory('CPU'),LOAD_TIMEOUT,'No se pudo iniciar el modelo ni con GPU ni con CPU.',operation);
    logDebug('CREATE FROM OPTIONS: CPU correcto');return created;
  }
}

async function ensureFaceLandmarker(operation){
  await loadModule(operation);if(state.faceLandmarker)return state.faceLandmarker;
  setStatus('Face Landmarker: cargando geometría facial…','loading');
  let modelPath=FACE_LANDMARKER_MODEL;
  try{const r=await fetch(modelPath,{cache:'force-cache'});if(!r.ok)throw new Error('local missing');}
  catch(_){modelPath=FACE_LANDMARKER_REMOTE;}
  state.faceLandmarker=await timeout(state.module.FaceLandmarker.createFromOptions(state.fileset,{
    baseOptions:{modelAssetPath:modelPath},runningMode:'IMAGE',numFaces:1,
    minFaceDetectionConfidence:.40,minFacePresenceConfidence:.40,minTrackingConfidence:.40,
    outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false
  }),LOAD_TIMEOUT,'No se pudo iniciar Face Landmarker.',operation);
  logDebug('FACE LANDMARKER: READY',{modelPath});return state.faceLandmarker;
}
async function faceLandmarks(canvas,operation){
  const lm=await ensureFaceLandmarker(operation);setStatus('Face Landmarker: analizando rostro…','loading');
  const result=await runTask(()=>lm.detect(canvas),operation);const pts=result?.faceLandmarks?.[0];
  if(!pts||pts.length<100)throw makeError('Face Landmarker no encontró el rostro con suficiente confianza.','LANDMARKER_NO_FACE');
  return pts;
}
function landmarkAnchor(points,w,h){
  let minX=1,minY=1,maxX=0,maxY=0;for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
  const x=minX*w,y=minY*h,bw=(maxX-minX)*w,bh=(maxY-minY)*h;
  return {x,y,w:bw,h:bh,source:'FaceLandmarker'};
}
function ellipseMask(w,h,cx,cy,rx,ry){const out=new Uint8Array(w*h);for(let y=Math.max(0,Math.floor(cy-ry));y<Math.min(h,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(w,Math.ceil(cx+rx));x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1)out[y*w+x]=255;}return out;}
function intersectMasks(a,b){const out=new Uint8Array(a.length);for(let i=0;i<a.length;i++)out[i]=(a[i]>70&&b[i]>70)?Math.min(a[i],b[i]):0;return out;}
function landmarkerBustPrior(anchor,w,h){
  const cx=anchor.x+anchor.w*.5,faceBottom=anchor.y+anchor.h;
  const top=Math.max(0,anchor.y-anchor.h*.10),bottom=Math.min(h,faceBottom+anchor.h*1.55),out=new Uint8Array(w*h);
  for(let y=Math.floor(top);y<Math.ceil(bottom);y++){
    let half;if(y<=faceBottom)half=anchor.w*.62;else{const t=(y-faceBottom)/Math.max(1,bottom-faceBottom);half=anchor.w*(.70+1.10*t);}
    for(let x=Math.max(0,Math.floor(cx-half));x<Math.min(w,Math.ceil(cx+half));x++)out[y*w+x]=255;
  }
  return blurMask(out,w,h,1);
}
async function landmarkerPersonPipeline(canvas,operation){
  const points=await faceLandmarks(canvas,operation),anchor=landmarkAnchor(points,canvas.width,canvas.height);
  setStatus('Selfie Segmentation: separando persona…','loading');
  let person;try{person=await mediaPipePersonMask(canvas,operation);}catch(err){logDebug('PERSON segmentation fallback',err);person=offlinePortraitMask(canvas);}
  return {points,anchor,person};
}
async function ensurePersonSegmenter(operation){
  logDebug('PERSON SEGMENTER: ensure inicio');
  await loadModule(operation);logDebug('PERSON SEGMENTER: módulo listo');if(state.imageSegmenter)return state.imageSegmenter;
  if(!state.personModelBuffer)state.personModelBuffer=await fetchModelBuffer(PERSON_MODEL,operation,'MODELO PERSONA');
  setStatus('Preparando segmentación de persona…','loading');
  logDebug('CREATE FROM MODEL BUFFER: persona inicio',{bytes:state.personModelBuffer?.byteLength});
  state.imageSegmenter=await timeout(
    state.module.ImageSegmenter.createFromModelBuffer(state.fileset,state.personModelBuffer),
    LOAD_TIMEOUT,'No se pudo crear el segmentador de persona.',operation
  );
  logDebug('CREATE FROM MODEL BUFFER: persona correcto');
  logDebug('SET OPTIONS: persona inicio');
  await timeout(state.imageSegmenter.setOptions({
    runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false
  }),LOAD_TIMEOUT,'No se pudieron configurar las opciones de segmentación.',operation);
  logDebug('SET OPTIONS: persona correcto');
  return state.imageSegmenter;
}

async function ensureMulticlassSegmenter(operation){
  logDebug('MULTICLASS SEGMENTER: ensure inicio');
  await loadModule(operation);if(state.multiclassSegmenter)return state.multiclassSegmenter;
  if(!state.multiclassModelBuffer)state.multiclassModelBuffer=await fetchModelBuffer(MULTICLASS_MODEL,operation,'MODELO MULTICLASE');
  setStatus('Preparando rostro, piel, cabello y ropa…','loading');
  state.multiclassSegmenter=await timeout(
    state.module.ImageSegmenter.createFromModelBuffer(state.fileset,state.multiclassModelBuffer),
    LOAD_TIMEOUT,'No se pudo crear el segmentador multiclase.',operation
  );
  await timeout(state.multiclassSegmenter.setOptions({
    runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false
  }),LOAD_TIMEOUT,'No se pudo configurar el segmentador multiclase.',operation);
  logDebug('MULTICLASS SEGMENTER: listo');
  return state.multiclassSegmenter;
}
function mediaPipeMaskBytes(mpMask){
  if(!mpMask)return null;
  if(typeof mpMask.getAsUint8Array==='function')return new Uint8Array(mpMask.getAsUint8Array());
  if(mpMask.data instanceof Uint8Array)return new Uint8Array(mpMask.data);
  return null;
}
function mediaPipeConfidenceBytes(mpMask){
  if(!mpMask)return null;
  let src=null;
  if(typeof mpMask.getAsFloat32Array==='function')src=mpMask.getAsFloat32Array();
  else if(mpMask.data instanceof Float32Array)src=mpMask.data;
  if(!src)return null;
  const out=new Uint8Array(src.length);for(let i=0;i<src.length;i++)out[i]=Math.max(0,Math.min(255,Math.round(src[i]*255)));return out;
}
function cleanSemanticClass(raw,w,h){
  let m=closeMask(raw,w,h,1);m=openMask(m,w,h,1);return blurMask(m,w,h,1);
}
function classMaskFromCategory(category,classes){
  const out=new Uint8Array(category.length),set=new Set(classes);
  for(let i=0;i<category.length;i++)if(set.has(category[i]))out[i]=255;
  return out;
}
async function mediaPipeMulticlassMasks(canvas,operation){
  const seg=await ensureMulticlassSegmenter(operation);
  setStatus('MediaPipe está separando cabello, piel, rostro y ropa…','loading');
  const result=await runTask(()=>seg.segment(canvas),operation);
  try{
    const cat=mediaPipeMaskBytes(result?.categoryMask);
    if(!cat||cat.length!==canvas.width*canvas.height)throw makeError('MediaPipe no devolvió una máscara multiclase válida.','MULTICLASS_EMPTY');
    const w=canvas.width,h=canvas.height;
    const hair=cleanSemanticClass(classMaskFromCategory(cat,[1]),w,h);
    const bodySkin=cleanSemanticClass(classMaskFromCategory(cat,[2]),w,h);
    const face=cleanSemanticClass(classMaskFromCategory(cat,[3]),w,h);
    const skin=cleanSemanticClass(classMaskFromCategory(cat,[2,3]),w,h);
    const clothing=cleanSemanticClass(classMaskFromCategory(cat,[4]),w,h);
    const accessories=cleanSemanticClass(classMaskFromCategory(cat,[5]),w,h);
    const person=cleanSemanticClass(classMaskFromCategory(cat,[1,2,3,4,5]),w,h);
    const counts={};for(let c=0;c<=5;c++)counts[c]=cat.reduce((n,v)=>n+(v===c),0);
    logDebug('MULTICLASS resultado',{counts,total:cat.length});
    return {person,hair,bodySkin,face,skin,clothing,accessories,category:cat};
  }finally{closeResult(result);}
}
async function mediaPipePersonMask(canvas,operation){
  const seg=await ensurePersonSegmenter(operation);
  setStatus('MediaPipe está separando a la persona…','loading');
  const result=await runTask(()=>seg.segment(canvas),operation);
  try{
    const cat=mediaPipeMaskBytes(result?.categoryMask);
    if(!cat||cat.length!==canvas.width*canvas.height)throw makeError('MediaPipe no devolvió una máscara de persona válida.','PERSON_MP_EMPTY');
    const out=new Uint8Array(cat.length);for(let i=0;i<cat.length;i++)if(cat[i]===PERSON_CLASS_ID)out[i]=255;
    let clean=closeMask(out,canvas.width,canvas.height,1);clean=largestCenterComponent(clean,canvas.width,canvas.height);return blurMask(clean,canvas.width,canvas.height,1);
  }finally{closeResult(result);}
}
async function ensureInteractiveSegmenter(operation){
  await loadModule(operation);if(state.interactiveSegmenter)return state.interactiveSegmenter;
  if(!state.interactiveModelBuffer)state.interactiveModelBuffer=await fetchModelBuffer(INTERACTIVE_MODEL,operation,'MODELO INTERACTIVO');
  setStatus('Preparando selección inteligente…','loading');
  logDebug('CREATE FROM MODEL BUFFER: interactivo inicio',{bytes:state.interactiveModelBuffer?.byteLength});
  state.interactiveSegmenter=await timeout(
    state.module.InteractiveSegmenter.createFromModelBuffer(state.fileset,state.interactiveModelBuffer),
    LOAD_TIMEOUT,'No se pudo crear el segmentador interactivo.',operation
  );
  logDebug('CREATE FROM MODEL BUFFER: interactivo correcto');
  logDebug('SET OPTIONS: interactivo inicio');
  logDebug('INTERACTIVE SEGMENTER: listo');
  return state.interactiveSegmenter;
}
async function letOverlayPaint(){
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,35)));
}
async function runTask(start,operation){
  logDebug('INFERENCIA: inicio');
  if(operation?.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
  await letOverlayPaint();
  // MediaPipe puede devolver el resultado directamente. En Safari/Chrome móvil,
  // la variante con callback puede no llamar nunca al callback y dejar la app cargando.
  const result=await timeout(Promise.resolve().then(start),RUN_TIMEOUT,
    'El análisis tardó demasiado. Intenta otra vez o usa una foto más pequeña.',operation);
  if(operation?.cancelled){closeResult(result);throw makeError('Proceso cancelado.','CANCELLED');}
  logDebug('INFERENCIA: resultado recibido',Object.keys(result||{}));
  return result;
}
function closeResult(result){
  try{result?.categoryMask?.close?.();}catch(_){ }
  try{result?.confidenceMasks?.forEach(m=>m.close?.());}catch(_){ }
}
async function segmentProfile(mode='person'){
  if(state.suspendedByWardrobe)return;
  if(!api()?.state?.photo)return api()?.toast('Abre una foto primero.');
  const labels={person:'Persona completa',bust:'Busto para identificación',face:'Rostro preciso',skin:'Piel',hair:'Cabello',clothing:'Ropa'};
  const label=labels[mode]||labels.person;
  const operation=beginOperation(`Seleccionando ${label.toLowerCase()}…`);
  setStatus('Preparando imagen ligera para el motor aislado…','loading');
  try{
    const work=await getWorkCanvas(operation);
    if(operation.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    let mask=null,engine='Web Worker';
    try{
      const result=await workerProfile(work,mode,operation);
      mask=new Uint8Array(result.mask);
      state.workerDiag={...state.workerDiag,...(result.diag||{}),worker:'READY'};
      engine=result?.diag?.engine||'MediaPipe Web Worker';
    }catch(workerErr){
      logDebug('WORKER PROFILE ERROR',workerErr);
      // A safe local fallback only for whole-person selection. For semantic
      // profiles we prefer a visible error over returning another wrong mask.
      if(mode==='person'){
        mask=offlinePortraitMask(work);engine='Fallback local de persona';
      }else{
        throw workerErr;
      }
    }
    if(operation.cancelled)throw makeError('Proceso cancelado.','CANCELLED');
    if(!mask||mask.length!==work.width*work.height)throw makeError(`No pude crear la selección de ${label.toLowerCase()}.`,'PROFILE_MASK_EMPTY');
    const selected=mask.reduce((n,v)=>n+(v>80),0),ratio=selected/(work.width*work.height);
    if(selected<work.width*work.height*.003)throw makeError(`No pude detectar claramente ${label.toLowerCase()}.`,'PROFILE_MASK_SMALL');
    if(ratio>.86&&mode!=='person')throw makeError(`${label} tomó demasiado de la imagen.`,'PROFILE_MASK_LARGE');
    await setMask(mask,work.width,work.height,label);
    setStatus(`${label} seleccionado con ${engine}.`,'ready');api().toast(`${label} listo`);
  }catch(err){
    const msg=friendlyError(err);logDebug(`SEGMENTAR ${mode}: ERROR`,err);setStatus(msg,'error');
    if(err?.code!=='CANCELLED')api().toast(msg);
  }finally{finishOperation(operation);}
}
const segmentPerson=()=>segmentProfile('person');
const segmentBust=()=>segmentProfile('bust');
const segmentFace=()=>segmentProfile('face');
const segmentSkin=()=>segmentProfile('skin');
const segmentHair=()=>segmentProfile('hair');
const segmentClothing=()=>segmentProfile('clothing');
function restoreBackground(){const photo=api()?.state?.photo;if(!photo)return;photo.visible=true;api().state.canvas.requestRenderAll();api().snapshot?.();setStatus('Imagen completa visible. Los cambios de las capas permanecen.','ready');api().toast('Fondo restaurado');}
function isolateSelection(){const photo=api()?.state?.photo;if(!photo||!state.mask)return api()?.toast('Primero crea una selección.');createCutout();}
function canvasPointToNormalized(pointer){
  const photo=api().state.photo;const bounds=photo.getBoundingRect(true,true);
  const x=(pointer.x-bounds.left)/bounds.width,y=(pointer.y-bounds.top)/bounds.height;
  return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),inside:x>=0&&x<=1&&y>=0&&y<=1};
}
async function segmentAtPoint(x,y){
  const operation=beginOperation('Creando selección inteligente…');setStatus('MediaPipe está buscando el objeto que tocaste…','loading');
  try{
    const work=await getWorkCanvas(operation);await letOverlayPaint();let mask=null,engine='Selección local segura';
    const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if(mobile){mask=magicWandMask(work,x,y);}else try{
      const seg=await ensureInteractiveSegmenter(operation);
      let mpMask;
      // Current MediaPipe API: setImage() then segment() with a positive point stroke.
      if(typeof seg.setImage==='function'){
        seg.setImage(work);
        const positive=state.module?.BrushMode?.POSITIVE ?? 1;
        mpMask=await runTask(()=>seg.segment([{brushMode:positive,point:[{x,y}],isCompleted:true}]),operation);
      }else{
        // Compatibility path for older Tasks Vision builds.
        const result=await runTask(()=>seg.segment(work,{keypoint:{x,y}}),operation);
        mpMask=result?.confidenceMasks?.[0]||result?.confidenceMask||result;
      }
      mask=mediaPipeConfidenceBytes(mpMask);
      try{mpMask?.close?.()}catch(_){}
      if(!mask||mask.length!==work.width*work.height)throw makeError('El segmentador interactivo no devolvió una máscara válida.','INTERACTIVE_EMPTY');
      mask=thresholdMask(mask,112);mask=largestCenterComponentForSeed(mask,work.width,work.height,Math.round(x*(work.width-1)),Math.round(y*(work.height-1)));mask=blurMask(closeMask(mask,work.width,work.height,1),work.width,work.height,1);
      const count=mask.reduce((n,v)=>n+(v>80),0);if(count<100||count>work.width*work.height*.72)throw makeError('La selección interactiva no fue confiable.','INTERACTIVE_UNSAFE');
    }catch(mpErr){
      logDebug('INTERACTIVE MediaPipe fallback',mpErr);engine='Selección local';mask=magicWandMask(work,x,y);
    }
    await setMask(mask,work.width,work.height,'Objeto');
    setStatus(`Objeto seleccionado con ${engine}. Si tomó demasiado o muy poco, toca otra zona.`,'ready');api().toast('Selección inteligente lista');
  }catch(err){const msg=friendlyError(err);logDebug('SELECCIÓN INTELIGENTE: ERROR',err);setStatus(msg,'error');if(err?.code!=='CANCELLED')api().toast(msg);}
  finally{finishOperation(operation);}
}
function beginTapMode(){if(!api()?.state?.photo)return api()?.toast('Abre una foto primero.');if(state.loading)return;state.tapMode=true;setStatus('Toca el objeto que quieres seleccionar.','ready');updateUI();api().toast('Ahora toca el objeto en la foto');}
async function handleCanvasTap(opt){if(!state.tapMode||state.loading)return;const p=api().state.canvas.getPointer(opt.e);const norm=canvasPointToNormalized(p);if(!norm.inside){api().toast('Toca dentro de la fotografía.');return;}state.tapMode=false;updateUI();await segmentAtPoint(norm.x,norm.y);}
function maskCanvas(mask,width,height,mode='overlay'){
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');const img=ctx.createImageData(width,height);
  for(let i=0;i<mask.length;i++){const a=mask[i],j=i*4;if(mode==='overlay'){img.data[j]=0;img.data[j+1]=210;img.data[j+2]=255;img.data[j+3]=Math.round(a*.55);}else{img.data[j]=255;img.data[j+1]=255;img.data[j+2]=255;img.data[j+3]=a;}}
  ctx.putImageData(img,0,0);return c;
}
function removeMaskOverlay(){const canvas=api()?.state?.canvas;if(!canvas)return;canvas.getObjects().filter(o=>o.layerType==='vision-mask').forEach(o=>canvas.remove(o));state.maskOverlay=null;canvas.requestRenderAll();api().renderLayers?.();}
async function setMask(mask,width,height,label){
  if(state.suspendedByWardrobe){removeMaskOverlay();state.mask=null;state.maskKind='';return;}
  removeMaskOverlay();state.mask={data:mask,width,height,label};state.maskKind=label;
  const url=maskCanvas(mask,width,height,'overlay').toDataURL('image/png');
  await timeout(new Promise((resolve,reject)=>{
    let done=false;
    const finish=(err,img)=>{if(done)return;done=true;if(err)return reject(err);const photo=api().state.photo;
      img.set({left:photo.left,top:photo.top,originX:'center',originY:'center',angle:photo.angle||0,flipX:!!photo.flipX,scaleX:photo.getScaledWidth()/width,scaleY:photo.getScaledHeight()/height,selectable:false,evented:false,excludeFromExport:true,opacity:.9});
      img.layerId=`mask-${Date.now()}`;img.layerName=`Máscara: ${label}`;img.layerType='vision-mask';api().state.canvas.add(img);api().state.canvas.bringToFront(img);state.maskOverlay=img;api().state.canvas.requestRenderAll();api().renderLayers?.();resolve();};
    try{fabric.Image.fromURL(url,img=>img?finish(null,img):finish(makeError('No pude mostrar la máscara.')));}catch(err){finish(err);}
  }),6000,'La máscara tardó demasiado en mostrarse. Intenta de nuevo.',state.operation);
  updateUI();
}
function showMask(show=true){if(!state.maskOverlay)return;state.maskOverlay.visible=show;api().state.canvas.requestRenderAll();setStatus(show?'Máscara visible':'Máscara oculta',show?'ready':'');}
function clearMask(){removeMaskOverlay();state.mask=null;state.maskKind='';state.tapMode=false;setStatus('Sin máscara');updateUI();}
async function createCutout(){
  if(!state.mask||!state.workCanvas)return api()?.toast('Primero crea una máscara.');
  const operation=beginOperation('Quitando el fondo…');
  try{
    const {data,width,height}=state.mask,src=state.workCanvas,out=document.createElement('canvas');out.width=width;out.height=height;
    const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height);
    for(let i=0;i<data.length;i++){if(operation.cancelled)throw makeError('Proceso cancelado.','CANCELLED');pixels.data[i*4+3]=data[i]>=110?data[i]:0;}
    ctx.putImageData(pixels,0,0);const url=out.toDataURL('image/png');
    await new Promise((resolve,reject)=>fabric.Image.fromURL(url,img=>{
      if(!img)return reject(makeError('No pude crear el recorte.'));const photo=api().state.photo;
      img.set({left:photo.left,top:photo.top,originX:'center',originY:'center',angle:photo.angle||0,flipX:!!photo.flipX,scaleX:photo.getScaledWidth()/width,scaleY:photo.getScaledHeight()/height,selectable:true,evented:true});
      img.layerId=api().nextLayerId();img.layerName=`${state.maskKind||'Objeto'} sin fondo`;img.layerType='segmented-cutout';photo.visible=false;removeMaskOverlay();api().state.canvas.add(img);api().state.canvas.setActiveObject(img);api().state.canvas.requestRenderAll();api().snapshot();api().renderLayers?.();resolve();
    },{crossOrigin:'anonymous'}));
    setStatus('Fondo eliminado. La selección es una nueva capa.','ready');api().toast('Fondo eliminado');
  }catch(err){const msg=friendlyError(err);console.error(err);setStatus(msg,'error');if(err?.code!=='CANCELLED')api().toast(msg);}
  finally{finishOperation(operation);}
}
function command(raw){const t=String(raw||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/identificacion|credencial/.test(t)){segmentBust();return true;}if(/selecciona.*busto/.test(t)){segmentBust();return true;}if(/selecciona.*rostro|solo.*cara|solo.*rostro/.test(t)){segmentFace();return true;}if(/selecciona.*piel|solo.*piel/.test(t)){segmentSkin();return true;}if(/selecciona.*cabello|solo.*cabello|pelo/.test(t)){segmentHair();return true;}if(/selecciona.*ropa|solo.*ropa|vestuario|prenda/.test(t)){segmentClothing();return true;}if(/segmenta.*persona|selecciona.*persona completa|separa.*persona/.test(t)){segmentPerson();return true;}if(/seleccion inteligente|toca.*objeto|segmenta.*objeto/.test(t)){beginTapMode();return true;}if(/regresa.*fondo|restaura.*fondo|muestra.*imagen completa/.test(t)){restoreBackground();return true;}if(/refina.*mascara|mejora.*mascara/.test(t)){refineCurrentMask();return true;}if(/quita.*fondo|elimina.*fondo|fondo transparente/.test(t)){if(state.mask)createCutout();else segmentPerson().then(()=>state.mask&&createCutout());return true;}if(/muestra.*mascara/.test(t)){showMask(true);return true;}if(/oculta.*mascara/.test(t)){showMask(false);return true;}if(/limpia.*mascara|borra.*mascara/.test(t)){clearMask();return true;}if(/cancela.*segment|deten.*segment/.test(t)){cancelCurrent();return true;}return false;}
function boot(){
  if(!$('segment-person'))return;
  $('segment-person').onclick=segmentPerson;$('segment-tap').onclick=beginTapMode;$('segment-show').onclick=()=>showMask(true);$('segment-hide').onclick=()=>showMask(false);$('segment-clear').onclick=clearMask;$('segment-cutout').onclick=createCutout;
  if($('segment-cancel'))$('segment-cancel').onclick=()=>cancelCurrent(true);
  if($('segment-debug-copy'))$('segment-debug-copy').onclick=copyDebug;
  if($('segment-debug-download'))$('segment-debug-download').onclick=downloadDebug;
  if($('segment-debug-test'))$('segment-debug-test').onclick=runConnectionTests;
  if($('processing-cancel'))$('processing-cancel').onclick=()=>cancelCurrent(true);
  api().state.canvas.on('mouse:down',handleCanvasTap);api().state.canvas.on('object:added',e=>{if(e.target?.photoRole==='main')clearMask();});
  logDebug('ARRANQUE',environmentInfo());renderDebug();updateUI();setStatus('Motor de selección listo.');
  if(window.PhotoBrain?.register)window.PhotoBrain.register({name:'segmentation',score:t=>/segmenta|seleccion inteligente|toca.*objeto|quita.*fondo|elimina.*fondo|mascara|cancela.*segment/.test(t)?220:0,run:t=>command(t)});
}
function exportMaskDataUrl(){
  if(!state.mask)return '';
  const {data,width,height}=state.mask,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),img=ctx.createImageData(width,height);
  for(let i=0;i<data.length;i++){const v=data[i];img.data[i*4]=255;img.data[i*4+1]=255;img.data[i*4+2]=255;img.data[i*4+3]=v;}
  ctx.putImageData(img,0,0);return canvas.toDataURL('image/png');
}
function exportSourceDataUrl(){return state.workCanvas?.toDataURL?.('image/png')||'';}

function suspendForWardrobe(){
  state.suspendedByWardrobe=true;
  try{cancelCurrent(false)}catch(_){}
  try{removeMaskOverlay()}catch(_){}
  state.mask=null;state.maskKind='';state.tapMode=false;
  try{api()?.processing(false)}catch(_){}
  updateUI();
}
function resumeAfterWardrobe(){
  state.suspendedByWardrobe=false;
  updateUI();
}
document.addEventListener('photoia:wardrobe-engine-enter',suspendForWardrobe);
document.addEventListener('photoia:wardrobe-engine-leave',resumeAfterWardrobe);

window.PhotoSegmentation={version:VERSION,segmentPerson,segmentBust,segmentFace,segmentSkin,segmentHair,segmentClothing,beginTapMode,createCutout,isolateSelection,restoreBackground,refineCurrentMask,clearMask,showMask,showWorkerDiagnostics,cancel:()=>cancelCurrent(true),command,exportMaskDataUrl,exportSourceDataUrl,get diagnostics(){return {...state.workerDiag}},get mask(){return state.mask}};
let started=false;function safeBoot(){if(started)return;if(window.PhotoIA?.state?.canvas){started=true;boot();}else setTimeout(safeBoot,120)}
window.addEventListener('photoia-ready',safeBoot,{once:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',safeBoot,{once:true});else safeBoot();
})();
