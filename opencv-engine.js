(() => {
'use strict';
const VERSION='5.0-photo-critic-regional-engine';
let ready=false;
const api=()=>window.PhotoIA;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
async function getSourceCanvas(max=1600,source='current'){const c=source==='original'?await api()?.getOriginalAnalysisCanvas?.(max):api()?.getPhotoAnalysisCanvas?.(max);if(!c)throw new Error('Abre una foto primero.');return c;}
function safeDelete(...items){items.flat().forEach(m=>{try{m?.delete?.()}catch{}})}
function matMeanStd(mat){const mean=new cv.Mat(),std=new cv.Mat();cv.meanStdDev(mat,mean,std);const out={mean:mean.doubleAt(0,0),std:std.doubleAt(0,0)};safeDelete(mean,std);return out;}
function percentileFromHist(hist,p,total){let acc=0;for(let i=0;i<256;i++){acc+=hist.data32F[i];if(acc>=total*p)return i;}return 0;}
function histogram(gray){const vec=new cv.MatVector(),hist=new cv.Mat(),mask=new cv.Mat();vec.push_back(gray);cv.calcHist(vec,[0],mask,hist,[256],[0,256],false);const total=gray.rows*gray.cols;const out={p01:percentileFromHist(hist,.01,total),p05:percentileFromHist(hist,.05,total),p25:percentileFromHist(hist,.25,total),p50:percentileFromHist(hist,.5,total),p75:percentileFromHist(hist,.75,total),p95:percentileFromHist(hist,.95,total),p99:percentileFromHist(hist,.99,total)};safeDelete(vec,hist,mask);return out;}
function morphFeather(mask,closeSize=7,blurSize=15){const k=cv.Mat.ones(closeSize,closeSize,cv.CV_8U);cv.morphologyEx(mask,mask,cv.MORPH_CLOSE,k);cv.morphologyEx(mask,mask,cv.MORPH_OPEN,k);k.delete();const b=blurSize%2?blurSize:blurSize+1;cv.GaussianBlur(mask,mask,new cv.Size(b,b),0);}
function hsvMask(hsv,lo,hi){const low=new cv.Mat(hsv.rows,hsv.cols,hsv.type(),lo),high=new cv.Mat(hsv.rows,hsv.cols,hsv.type(),hi),m=new cv.Mat();cv.inRange(hsv,low,high,m);safeDelete(low,high);return m;}
function largestComponentRect(mask,minAreaRatio=.004){const binary=new cv.Mat(),labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat();cv.threshold(mask,binary,32,255,cv.THRESH_BINARY);let best=null;try{const count=cv.connectedComponentsWithStats(binary,labels,stats,centroids,8,cv.CV_32S);const minArea=mask.rows*mask.cols*minAreaRatio;for(let i=1;i<count;i++){const x=stats.intAt(i,cv.CC_STAT_LEFT),y=stats.intAt(i,cv.CC_STAT_TOP),w=stats.intAt(i,cv.CC_STAT_WIDTH),h=stats.intAt(i,cv.CC_STAT_HEIGHT),area=stats.intAt(i,cv.CC_STAT_AREA);if(area>=minArea&&(!best||area>best.area))best={x,y,w,h,area};}}catch{}finally{safeDelete(binary,labels,stats,centroids)}return best;}
function ellipseMask(rows,cols,rect){const m=cv.Mat.zeros(rows,cols,cv.CV_8U);if(!rect)return m;const cx=Math.round(rect.x+rect.w/2),cy=Math.round(rect.y+rect.h*.48),ax=Math.max(8,Math.round(rect.w*.78)),ay=Math.max(8,Math.round(rect.h*.78));cv.ellipse(m,new cv.Point(cx,cy),new cv.Size(ax,ay),0,0,360,new cv.Scalar(255),-1,cv.LINE_AA);cv.GaussianBlur(m,m,new cv.Size(31,31),0);return m;}
function buildRegionMasks(src){const rgb=new cv.Mat(),hsv=new cv.Mat();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);
 const sky=hsvMask(hsv,[88,24,45,0],[138,255,255,255]);
 const green=hsvMask(hsv,[28,24,24,0],[96,255,255,255]);
 const skin1=hsvMask(hsv,[0,14,35,0],[27,190,255,255]),skin2=hsvMask(hsv,[168,14,35,0],[179,190,255,255]),skin=new cv.Mat();cv.bitwise_or(skin1,skin2,skin);
 const upper=cv.Mat.zeros(src.rows,src.cols,cv.CV_8U);upper.roi(new cv.Rect(0,0,src.cols,Math.max(1,Math.round(src.rows*.76)))).setTo(new cv.Scalar(255));cv.bitwise_and(sky,upper,sky);
 morphFeather(sky,5,17);morphFeather(green,5,13);morphFeather(skin,5,15);
 const skinRect=largestComponentRect(skin,.0035);const face=ellipseMask(src.rows,src.cols,skinRect);
 // Keep face mask mostly where skin exists, but allow a soft halo for eyes/hair detail.
 const expandedSkin=new cv.Mat();cv.max(face,skin,expandedSkin);
 const gray=new cv.Mat();cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);const dark=new cv.Mat();cv.threshold(gray,dark,92,255,cv.THRESH_BINARY_INV);cv.GaussianBlur(dark,dark,new cv.Size(21,21),0);
 safeDelete(skin1,skin2,hsv,rgb,upper,gray,face);
 return{sky,green,skin,face:expandedSkin,dark};
}
function maskRatio(mask){return cv.mean(mask)[0]/255;}
function deleteMasks(m){Object.values(m||{}).forEach(x=>safeDelete(x));}
function horizon(gray,edges){const lines=new cv.Mat();cv.HoughLinesP(edges,lines,1,Math.PI/180,Math.max(35,gray.cols*.08),Math.max(40,gray.cols*.18),18);let sum=0,w=0,count=0;for(let i=0;i<lines.rows;i++){const x1=lines.data32S[i*4],y1=lines.data32S[i*4+1],x2=lines.data32S[i*4+2],y2=lines.data32S[i*4+3],dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(len<30)continue;let a=Math.atan2(dy,dx)*180/Math.PI;while(a>90)a-=180;while(a<-90)a+=180;if(Math.abs(a)<18){sum+=a*len;w+=len;count++;}}lines.delete();return{angle:w?sum/w:0,confidence:clamp(count/12,0,1)};}
async function analyzeCurrent(source='current'){if(!ready||!window.cv?.Mat)throw new Error('OpenCV todavía no está listo.');const canvas=await getSourceCanvas(1200,source);let src,gray,lap,edges,blurred,diff,masks;try{src=cv.imread(canvas);gray=new cv.Mat();cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);lap=new cv.Mat();cv.Laplacian(gray,lap,cv.CV_64F);const ls=matMeanStd(lap),lapVar=ls.std*ls.std;edges=new cv.Mat();cv.Canny(gray,edges,52,142);const edgeDensity=cv.countNonZero(edges)/(edges.rows*edges.cols);blurred=new cv.Mat();cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);diff=new cv.Mat();cv.absdiff(gray,blurred,diff);const noise=cv.mean(diff)[0];const stats=matMeanStd(gray),hist=histogram(gray);masks=buildRegionMasks(src);const regions={sky:+maskRatio(masks.sky).toFixed(3),green:+maskRatio(masks.green).toFixed(3),skin:+maskRatio(masks.skin).toFixed(3),face:+maskRatio(masks.face).toFixed(3),dark:+maskRatio(masks.dark).toFixed(3)};const hz=horizon(gray,edges),blurRisk=lapVar<45?'high':lapVar<120?'medium':'low';const detectedRegions=[regions.face>.025?'Rostro':null,regions.skin>.035?'Piel':null,regions.sky>.07?'Cielo':null,regions.green>.08?'Vegetación':null].filter(Boolean);const report={version:VERSION,width:src.cols,height:src.rows,brightness:Math.round(stats.mean),contrast:Math.round(stats.std),histogram:hist,dynamicRange:hist.p95-hist.p05,laplacianVariance:Math.round(lapVar),edgeDensity:+edgeDensity.toFixed(4),noiseEstimate:+noise.toFixed(2),blurRisk,regions,detectedRegions,horizon:hz,clipping:{black:hist.p01<3,white:hist.p99>252}};render(report);return report;}finally{deleteMasks(masks);safeDelete(src,gray,lap,edges,blurred,diff)}}
function grayWorld(src,strength=.72){const rgb=new cv.Mat();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);const ch=new cv.MatVector();cv.split(rgb,ch);const means=[0,1,2].map(i=>cv.mean(ch.get(i))[0]),target=(means[0]+means[1]+means[2])/3;for(let i=0;i<3;i++){const m=ch.get(i),raw=target/Math.max(1,means[i]),factor=1+(clamp(raw,.86,1.14)-1)*strength;m.convertTo(m,-1,factor,0);}cv.merge(ch,rgb);cv.cvtColor(rgb,src,cv.COLOR_RGB2RGBA);for(let i=0;i<3;i++)safeDelete(ch.get(i));safeDelete(ch,rgb);}
function toneCurve(src,recipe,analysis){const rgb=new cv.Mat(),lab=new cv.Mat(),ch=new cv.MatVector();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,ch);const l=ch.get(0),lut=new cv.Mat(1,256,cv.CV_8U);const exp=Number(recipe.exposure||0),sh=Number(recipe.shadows||0)/100,hi=Number(recipe.highlights||0)/100,ct=Number(recipe.contrast||0)/100,black=Number(recipe.blackPoint||0);for(let x=0;x<256;x++){let y=x*Math.pow(2,exp);const n=clamp(y/255,0,1);y+=sh*38*Math.pow(1-n,2.15);y-=hi*34*Math.pow(n,2.35);y=128+(y-128)*(1+ct*.62);y-=black*Math.pow(1-n,2.5)*.7;lut.data[x]=Math.round(clamp(y,0,255));}cv.LUT(l,lut,l);cv.merge(ch,lab);cv.cvtColor(lab,rgb,cv.COLOR_Lab2RGB);cv.cvtColor(rgb,src,cv.COLOR_RGB2RGBA);for(let i=0;i<3;i++)safeDelete(ch.get(i));safeDelete(lut,ch,lab,rgb);}
function claheLuminance(src,clip=1.35){const rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector();let l,a,b,out,clahe,merged;try{cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);l=channels.get(0);a=channels.get(1);b=channels.get(2);out=new cv.Mat();clahe=new cv.CLAHE(clip,new cv.Size(8,8));clahe.apply(l,out);const rebuilt=new cv.MatVector();rebuilt.push_back(out);rebuilt.push_back(a);rebuilt.push_back(b);merged=new cv.Mat();cv.merge(rebuilt,merged);rebuilt.delete();cv.cvtColor(merged,rgb,cv.COLOR_Lab2RGB);cv.cvtColor(rgb,src,cv.COLOR_RGB2RGBA);}finally{safeDelete(clahe,l,a,b,out,merged,channels,lab,rgb)}}
function bilateralRGBA(src,d,sigmaColor,sigmaSpace){const rgb=new cv.Mat(),filtered=new cv.Mat();try{cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.bilateralFilter(rgb,filtered,d,sigmaColor,sigmaSpace,cv.BORDER_DEFAULT);cv.cvtColor(filtered,src,cv.COLOR_RGB2RGBA)}finally{safeDelete(rgb,filtered)}}
function blendMasked(base,adjusted,mask,strength=1){if(!mask||strength<=0)return;const alpha=new cv.Mat(),baseF=new cv.Mat(),adjF=new cv.Mat(),a4=new cv.Mat(),inv=new cv.Mat(),ones=new cv.Mat(base.rows,base.cols,cv.CV_32FC4,new cv.Scalar(1,1,1,1)),vec=new cv.MatVector();mask.convertTo(alpha,cv.CV_32F,clamp(strength,0,1)/255);base.convertTo(baseF,cv.CV_32F);adjusted.convertTo(adjF,cv.CV_32F);for(let i=0;i<4;i++)vec.push_back(alpha);cv.merge(vec,a4);cv.subtract(ones,a4,inv);cv.multiply(baseF,inv,baseF);cv.multiply(adjF,a4,adjF);cv.add(baseF,adjF,baseF);baseF.convertTo(base,cv.CV_8U);for(let i=0;i<4;i++)safeDelete(vec.get(i));safeDelete(alpha,baseF,adjF,a4,inv,ones,vec);}
function hsvAdjusted(src,satFactor=1,valDelta=0,hueDelta=0){const rgb=new cv.Mat(),hsv=new cv.Mat(),ch=new cv.MatVector();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);cv.split(hsv,ch);const h=ch.get(0),s=ch.get(1),v=ch.get(2);if(hueDelta)h.convertTo(h,-1,1,hueDelta);if(satFactor!==1)s.convertTo(s,-1,satFactor,0);if(valDelta)v.convertTo(v,-1,1,valDelta);cv.merge(ch,hsv);cv.cvtColor(hsv,rgb,cv.COLOR_HSV2RGB);const out=new cv.Mat();cv.cvtColor(rgb,out,cv.COLOR_RGB2RGBA);safeDelete(h,s,v,ch,hsv,rgb);return out;}

function faceEdgeMask(src,faceMask){
 const gray=new cv.Mat(),edges=new cv.Mat(),dilated=new cv.Mat(),masked=new cv.Mat();
 try{
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  // Strong thresholds avoid treating pores and spots as detail.
  cv.Canny(gray,edges,88,188);
  const k=cv.Mat.ones(2,2,cv.CV_8U);cv.dilate(edges,dilated,k,new cv.Point(-1,-1),1);k.delete();
  cv.GaussianBlur(dilated,dilated,new cv.Size(3,3),0);
  cv.bitwise_and(dilated,faceMask,masked);
  return masked.clone();
 }finally{safeDelete(gray,edges,dilated,masked)}
}
function sharpenCopy(src,amount=.2,sigma=1.0){const blur=new cv.Mat(),out=new cv.Mat();cv.GaussianBlur(src,blur,new cv.Size(0,0),sigma);cv.addWeighted(src,1+amount,blur,-amount,0,out);safeDelete(blur);return out;}
function denoiseCopy(src,strength=5){const out=src.clone();if(strength>0)bilateralRGBA(out,5,16+strength*1.7,16+strength*1.7);return out;}
function globalColor(src,recipe){const rgb=new cv.Mat(),hsv=new cv.Mat(),ch=new cv.MatVector();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);cv.split(hsv,ch);const h=ch.get(0),s=ch.get(1),v=ch.get(2),factor=1+clamp(Number(recipe.vibrance||0)/155,-.10,.18);s.convertTo(s,-1,factor,0);if(recipe.warmth)h.convertTo(h,-1,1,-clamp(Number(recipe.warmth),-4,4)*.22);cv.merge(ch,hsv);cv.cvtColor(hsv,rgb,cv.COLOR_HSV2RGB);cv.cvtColor(rgb,src,cv.COLOR_RGB2RGBA);safeDelete(h,s,v,ch,hsv,rgb);}
function skinTextureMask(src,skinMask){
 const gray=new cv.Mat(),edges=new cv.Mat(),soft=new cv.Mat(),invEdges=new cv.Mat(),out=new cv.Mat(),k=cv.Mat.ones(3,3,cv.CV_8U);
 try{cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.Canny(gray,edges,42,108);cv.dilate(edges,edges,k);cv.bitwise_not(edges,invEdges);cv.bitwise_and(skinMask,invEdges,out);cv.GaussianBlur(out,soft,new cv.Size(17,17),0);return soft.clone();}
 finally{safeDelete(gray,edges,soft,invEdges,out,k)}
}
function buildSpotMask(src,skinMask,mode='blemish'){
 const gray=new cv.Mat(),blackhat=new cv.Mat(),binary=new cv.Mat(),safeSkin=new cv.Mat(),masked=new cv.Mat(),labels=new cv.Mat(),stats=new cv.Mat(),centroids=new cv.Mat(),out=cv.Mat.zeros(src.rows,src.cols,cv.CV_8U);
 const minDim=Math.min(src.rows,src.cols),size=Math.max(5,(Math.round(minDim/(mode==='mole'?135:165))|1)),kernel=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(size,size));
 try{
  cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  // Work only on smooth skin. This excludes eyes, lips, eyebrows, hair and beard edges.
  const textureSafe=skinTextureMask(src,skinMask);cv.threshold(textureSafe,safeSkin,72,255,cv.THRESH_BINARY);textureSafe.delete();
  cv.morphologyEx(gray,blackhat,cv.MORPH_BLACKHAT,kernel);
  cv.threshold(blackhat,binary,mode==='mole'?17:11,255,cv.THRESH_BINARY);
  cv.bitwise_and(binary,safeSkin,masked);
  const n=cv.connectedComponentsWithStats(masked,labels,stats,centroids,8,cv.CV_32S),scale=Math.max(.35,(src.rows*src.cols)/(1800*1800));
  const minA=Math.max(2,Math.round((mode==='mole'?5:3)*scale));
  const maxA=Math.max(12,Math.round((mode==='mole'?70:42)*scale));
  const maxSide=Math.max(5,Math.round((mode==='mole'?18:13)*Math.sqrt(scale)));
  for(let i=1;i<n;i++){
   const x=stats.intAt(i,cv.CC_STAT_LEFT),y=stats.intAt(i,cv.CC_STAT_TOP),w=stats.intAt(i,cv.CC_STAT_WIDTH),h=stats.intAt(i,cv.CC_STAT_HEIGHT),a=stats.intAt(i,cv.CC_STAT_AREA);
   const ratio=w/Math.max(1,h),fill=a/Math.max(1,w*h);
   if(a<minA||a>maxA||w>maxSide||h>maxSide||ratio<.48||ratio>2.05||fill<.22)continue;
   // Minimal mask: cover the mark itself, not healthy skin around it.
   cv.ellipse(out,new cv.Point(Math.round(x+w/2),Math.round(y+h/2)),new cv.Size(Math.max(1,Math.ceil(w*.54)),Math.max(1,Math.ceil(h*.54))),0,0,360,new cv.Scalar(255),-1,cv.LINE_8);
  }
  const dk=cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(2,2));cv.dilate(out,out,dk,new cv.Point(-1,-1),1);dk.delete();
  return out.clone();
 }finally{safeDelete(gray,blackhat,binary,safeSkin,masked,labels,stats,centroids,out,kernel)}
}
function preserveTexture(original,repaired,mask){
 const origBlur=new cv.Mat(),repBlur=new cv.Mat(),origF=new cv.Mat(),origBlurF=new cv.Mat(),repF=new cv.Mat(),detail=new cv.Mat(),restored=new cv.Mat();
 try{
  cv.GaussianBlur(original,origBlur,new cv.Size(0,0),1.15);cv.GaussianBlur(repaired,repBlur,new cv.Size(0,0),1.15);
  original.convertTo(origF,cv.CV_32F);origBlur.convertTo(origBlurF,cv.CV_32F);repaired.convertTo(repF,cv.CV_32F);
  cv.subtract(origF,origBlurF,detail);cv.addWeighted(repF,1,detail,.42,0,restored);restored.convertTo(repaired,cv.CV_8U);
 }finally{safeDelete(origBlur,repBlur,origF,origBlurF,repF,detail,restored)}
}
async function removeSkinSpots(mode='blemish'){
 if(!ready)throw new Error('OpenCV no está listo.');const canvas=await getSourceCanvas(1800,'current');let src,masks,spotMask,rgb,result;
 try{
  src=cv.imread(canvas);masks=buildRegionMasks(src);if(maskRatio(masks.skin)<.012)throw new Error('No detecté suficiente piel para hacer el retoque.');
  spotMask=buildSpotMask(src,masks.skin,mode);const pixels=cv.countNonZero(spotMask);if(pixels<2)throw new Error(mode==='mole'?'No detecté lunares pequeños seguros para retirar.':'No detecté granitos o manchas pequeñas seguras para retirar.');
  rgb=new cv.Mat();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);result=new cv.Mat();
  if(typeof cv.inpaint==='function'){
   // Tiny radius prevents the warped, melted patches seen in 11.4.
   cv.inpaint(rgb,spotMask,result,mode==='mole'?1.25:1,cv.INPAINT_TELEA);
   preserveTexture(rgb,result,spotMask);
  }else{
   const softened=new cv.Mat();cv.medianBlur(rgb,softened,3);result=rgb.clone();const soft4=new cv.Mat(),base4=new cv.Mat();cv.cvtColor(softened,soft4,cv.COLOR_RGB2RGBA);cv.cvtColor(result,base4,cv.COLOR_RGB2RGBA);blendMasked(base4,soft4,spotMask,.45);cv.cvtColor(base4,result,cv.COLOR_RGBA2RGB);safeDelete(softened,soft4,base4);
  }
  const rgba=new cv.Mat();cv.cvtColor(result,rgba,cv.COLOR_RGB2RGBA);const out=document.createElement('canvas');out.width=rgba.cols;out.height=rgba.rows;cv.imshow(out,rgba);rgba.delete();return out.toDataURL('image/jpeg',.98);
 }finally{deleteMasks(masks);safeDelete(src,spotMask,rgb,result)}
}
async function smoothPortraitSkin(strength=.35){
 if(!ready)throw new Error('OpenCV no está listo.');const canvas=await getSourceCanvas(1800,'current');let src,masks,smooth,mask;
 try{
  src=cv.imread(canvas);masks=buildRegionMasks(src);if(maskRatio(masks.skin)<.012)throw new Error('No detecté suficiente piel para suavizar.');
  smooth=src.clone();bilateralRGBA(smooth,7,19+strength*15,19+strength*15);mask=skinTextureMask(src,masks.skin);
  blendMasked(src,smooth,mask,clamp(.10+strength*.32,.10,.34));
  const out=document.createElement('canvas');out.width=src.cols;out.height=src.rows;cv.imshow(out,src);return out.toDataURL('image/jpeg',.98);
 }finally{deleteMasks(masks);safeDelete(src,smooth,mask)}
}
function regionalEnhance(src,recipe,analysis,masks){const r=analysis?.regions||{},strength=clamp(Number(recipe.adaptiveStrength||.65),.25,1),blur=analysis?.blurRisk||'low';
 if(r.sky>.025){const sky=hsvAdjusted(src,1.045+strength*.035,-clamp((recipe.highlights||10)*.22,1,9),0);blendMasked(src,sky,masks.sky,clamp(.30+r.sky+strength*.08,0,.66));sky.delete();}
 if(r.green>.03){const green=hsvAdjusted(src,1+clamp((recipe.vibrance||12)/190,.035,.12),1+strength*1.2,0);blendMasked(src,green,masks.green,clamp(.27+r.green+strength*.07,0,.62));green.delete();}
 // Skin receives gentle tonal/color correction and mild edge-preserving smoothing only.
 if(r.skin>.015){const skin=hsvAdjusted(src,1.003,clamp((recipe.shadows||10)*.11,1,5),-clamp(Number(recipe.warmth||2),0,4)*.08);bilateralRGBA(skin,7,18+strength*8,18+strength*8);const smoothMask=skinTextureMask(src,masks.skin);blendMasked(src,skin,smoothMask,clamp(.16+r.skin*.30+strength*.05,0,.36));safeDelete(skin,smoothMask);}
 // Sharpen only meaningful facial edges (eyes, brows, lips, beard), never the full skin mask.
 if(r.face>.02){const edgeMask=faceEdgeMask(src,masks.face);const amount=blur==='high'?.072:blur==='medium'?.048:.022;const detail=sharpenCopy(src,amount,.95);blendMasked(src,detail,edgeMask,blur==='high'?.25:blur==='medium'?.19:.12);safeDelete(detail,edgeMask);}
 // Reduce noise mainly in dark areas. Keep the blend conservative to preserve texture.
 if(r.dark>.08&&Number(recipe.denoise||0)>0){const smooth=denoiseCopy(src,clamp(Number(recipe.denoise),2,8));blendMasked(src,smooth,masks.dark,clamp(.20+strength*.10,0,.36));smooth.delete();}
}
async function enhanceCurrent(recipe={},analysis=null,source='original'){if(!ready)throw new Error('OpenCV no está listo.');const canvas=await getSourceCanvas(1800,source);let src,masks;const stage=(name,fn)=>{try{fn()}catch(err){console.warn('[OpenCV Portrait Natural]',name,err)}};try{src=cv.imread(canvas);masks=buildRegionMasks(src);const strength=clamp(Number(recipe.adaptiveStrength||.65),.25,1);stage('balance de blancos',()=>grayWorld(src,.48+strength*.30));stage('curva tonal',()=>toneCurve(src,recipe,analysis));stage('contraste local',()=>claheLuminance(src,(analysis?.regions?.face||0)>.02?1.03+strength*.10:1.10+strength*.34));stage('color global',()=>globalColor(src,recipe));stage('ajustes regionales',()=>regionalEnhance(src,recipe,analysis,masks));if(analysis?.blurRisk==='high'){const globalDetail=sharpenCopy(src,.075,1.2);blendMasked(src,globalDetail,masks.dark,.06);globalDetail.delete();}const out=document.createElement('canvas');out.width=src.cols;out.height=src.rows;cv.imshow(out,src);return out.toDataURL('image/jpeg',.96);}catch(err){console.error('[OpenCV Portrait Natural] apply failed',err);throw new Error('No se pudo procesar la foto: '+(err?.message||String(err)))}finally{deleteMasks(masks);safeDelete(src)}}

function critiquePhoto(report){
 const h=report.histogram||{},r=report.regions||{},issues=[],strengths=[];
 if(r.face>.02){
  if((h.p50||report.brightness)<105)issues.push({code:'face-dark',label:'Rostro oscuro',advice:'Iluminar rostro y piel sin aumentar la exposición del fondo.'});
  if(report.contrast>72)issues.push({code:'skin-harsh',label:'Textura facial agresiva',advice:'Proteger piel y reducir claridad local en el rostro.'});
  if(report.noiseEstimate>14)issues.push({code:'face-noise',label:'Ruido en piel y sombras',advice:'Reducir ruido solo en sombras y conservar ojos, cabello y barba.'});
  strengths.push('Rostro detectado');
 }
 if(report.clipping?.white)issues.push({code:'highlights',label:'Altas luces al límite',advice:'Recuperar luces sin oscurecer al sujeto.'});
 if(report.clipping?.black)issues.push({code:'shadows',label:'Sombras cerradas',advice:'Abrir sombras de forma selectiva.'});
 if(report.blurRisk==='high')issues.push({code:'soft-focus',label:'Enfoque bajo',advice:'Añadir detalle solo a bordes importantes, no a la piel.'});
 else strengths.push('Enfoque utilizable');
 if(!issues.length)strengths.push('Exposición equilibrada');
 return{issues,strengths,summary:issues.length?`Encontré ${issues.length} oportunidad${issues.length===1?'':'es'} de mejora sin perjudicar la foto.`:'La foto ya está equilibrada; aplicaré una mejora ligera y natural.'};
}
function regionMaskFor(masks,region){
 if(region==='face')return masks.face;
 if(region==='skin')return masks.skin;
 if(region==='background'){
  const fg=new cv.Mat(),bg=new cv.Mat();cv.max(masks.face,masks.skin,fg);cv.bitwise_not(fg,bg);fg.delete();return bg;
 }
 return null;
}
async function adjustRegion(region='face',options={}){
 if(!ready)throw new Error('OpenCV no está listo.');const canvas=await getSourceCanvas(1800,'current');let src,masks,target,mask;
 try{
  src=cv.imread(canvas);masks=buildRegionMasks(src);mask=regionMaskFor(masks,region);if(!mask||maskRatio(mask)<.005)throw new Error(`No detecté suficiente ${region==='background'?'fondo':region==='skin'?'piel':'rostro'} para editar.`);
  target=src.clone();const exposure=clamp(Number(options.exposure||0),-.4,.7),shadows=clamp(Number(options.shadows||0),-25,45),warmth=clamp(Number(options.warmth||0),-12,12),detail=clamp(Number(options.detail||0),-20,18);
  const recipe={exposure,shadows,highlights:0,contrast:0,vibrance:0,warmth,clarity:0,blackPoint:0,whitePoint:255,gamma:1,denoise:options.denoise?6:0,adaptiveStrength:.55};
  toneCurve(target,recipe,{regions:{face:(region==='face'||region==='skin')?0.08:0}});if(warmth)globalColor(target,recipe);
  if(options.smooth&&region!=='background'){const softened=target.clone();bilateralRGBA(softened,7,22,22);const safe=skinTextureMask(src,mask);blendMasked(target,softened,safe,.20);safeDelete(softened,safe);}
  if(detail>0){const edge=region==='face'?faceEdgeMask(src,mask):mask;const sharp=sharpenCopy(target,Math.min(.07,detail/260),.95);blendMasked(target,sharp,edge,.18);safeDelete(sharp);if(edge!==mask)safeDelete(edge);}
  blendMasked(src,target,mask,clamp(Number(options.strength||.72),.2,1));
  const out=document.createElement('canvas');out.width=src.cols;out.height=src.rows;cv.imshow(out,src);return out.toDataURL('image/jpeg',.98);
 }finally{if(mask&&![masks?.face,masks?.skin,masks?.sky,masks?.green,masks?.dark].includes(mask))safeDelete(mask);deleteMasks(masks);safeDelete(src,target)}
}
function render(r){const el=document.getElementById('opencv-diagnostics');if(!el)return;el.hidden=false;const regs=r.detectedRegions?.length?r.detectedRegions.join(' · '):'General';el.innerHTML=`<strong>OpenCV Portrait Beauty activo</strong><span>Regiones: ${regs}</span><span>Enfoque: ${r.blurRisk==='low'?'Bueno':r.blurRisk==='medium'?'Medio':'Bajo'}</span><span>Ruido: ${r.noiseEstimate}</span><span>Horizonte: ${Math.abs(r.horizon.angle).toFixed(1)}°</span>`;}
function markReady(){ready=!!window.cv?.Mat;const badge=document.getElementById('engine-badge');if(ready&&badge){badge.textContent='Fabric + OpenCV Portrait Beauty activo';badge.classList.add('ready')}}
window.addEventListener('opencv-script-loaded',()=>{const wait=()=>window.cv?.Mat?markReady():setTimeout(wait,200);wait()});
window.PhotoOpenCV={version:VERSION,get ready(){return ready},analyzeCurrent,enhanceCurrent,removeSkinSpots,smoothPortraitSkin,critiquePhoto,adjustRegion};
})();
