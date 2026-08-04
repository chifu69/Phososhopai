(() => {
'use strict';
const VERSION='3.0.0-regional-vision';
let ready=false;
const api=()=>window.PhotoIA;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function getSourceCanvas(max=1200){const c=api()?.getPhotoAnalysisCanvas?.(max);if(!c)throw new Error('Abre una foto primero.');return c;}
function matMeanStd(mat){const mean=new cv.Mat(),std=new cv.Mat();cv.meanStdDev(mat,mean,std);const out={mean:mean.doubleAt(0,0),std:std.doubleAt(0,0)};mean.delete();std.delete();return out;}
function percentileFromHist(hist,p,total){let acc=0;for(let i=0;i<256;i++){acc+=hist.data32F[i];if(acc>=total*p)return i;}return 0;}
function histogram(gray){const srcVec=new cv.MatVector();srcVec.push_back(gray);const hist=new cv.Mat(),mask=new cv.Mat();cv.calcHist(srcVec,[0],mask,hist,[256],[0,256],false);srcVec.delete();mask.delete();const total=gray.rows*gray.cols;const out={p01:percentileFromHist(hist,.01,total),p05:percentileFromHist(hist,.05,total),p50:percentileFromHist(hist,.5,total),p95:percentileFromHist(hist,.95,total),p99:percentileFromHist(hist,.99,total)};hist.delete();return out;}
function morphFeather(mask,closeSize=7,blurSize=15){const k=cv.Mat.ones(closeSize,closeSize,cv.CV_8U);cv.morphologyEx(mask,mask,cv.MORPH_CLOSE,k);cv.morphologyEx(mask,mask,cv.MORPH_OPEN,k);k.delete();const b=blurSize%2?blurSize:blurSize+1;cv.GaussianBlur(mask,mask,new cv.Size(b,b),0);}
function hsvMask(hsv,lo,hi){const low=new cv.Mat(hsv.rows,hsv.cols,hsv.type(),lo),high=new cv.Mat(hsv.rows,hsv.cols,hsv.type(),hi),m=new cv.Mat();cv.inRange(hsv,low,high,m);low.delete();high.delete();return m;}
function buildRegionMasks(src){const rgb=new cv.Mat(),hsv=new cv.Mat();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);
 const sky=hsvMask(hsv,[88,28,55,0],[138,255,255,255]);
 const green=hsvMask(hsv,[30,28,28,0],[92,255,255,255]);
 const skin1=hsvMask(hsv,[0,18,45,0],[24,185,255,255]);
 const skin2=hsvMask(hsv,[168,18,45,0],[179,185,255,255]);
 const skin=new cv.Mat();cv.bitwise_or(skin1,skin2,skin);
 // Bias sky toward upper 70% to avoid blue clothing near the bottom.
 const upper=new cv.Mat.zeros(src.rows,src.cols,cv.CV_8U);upper.roi(new cv.Rect(0,0,src.cols,Math.max(1,Math.round(src.rows*.72)))).setTo(new cv.Scalar(255));cv.bitwise_and(sky,upper,sky);upper.delete();
 morphFeather(sky,5,17);morphFeather(green,5,13);morphFeather(skin,5,17);
 skin1.delete();skin2.delete();hsv.delete();rgb.delete();
 return{sky,green,skin};
}
function maskRatio(mask){return cv.mean(mask)[0]/255;}
function deleteMasks(masks){Object.values(masks||{}).forEach(m=>{try{m?.delete()}catch{}});}
function regionRatios(src){const m=buildRegionMasks(src);const out={sky:+maskRatio(m.sky).toFixed(3),green:+maskRatio(m.green).toFixed(3),skin:+maskRatio(m.skin).toFixed(3)};deleteMasks(m);return out;}
function horizon(gray,edges){const lines=new cv.Mat();cv.HoughLinesP(edges,lines,1,Math.PI/180,Math.max(35,gray.cols*.08),Math.max(40,gray.cols*.18),18);let sum=0,w=0,count=0;for(let i=0;i<lines.rows;i++){const x1=lines.data32S[i*4],y1=lines.data32S[i*4+1],x2=lines.data32S[i*4+2],y2=lines.data32S[i*4+3];const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(len<30)continue;let a=Math.atan2(dy,dx)*180/Math.PI;while(a>90)a-=180;while(a<-90)a+=180;if(Math.abs(a)<18){sum+=a*len;w+=len;count++;}}lines.delete();return{angle:w?sum/w:0,confidence:clamp(count/12,0,1)};}
async function analyzeCurrent(){if(!ready||!window.cv?.Mat)throw new Error('OpenCV todavía no está listo.');const canvas=getSourceCanvas();let src,gray,lab,lap,edges,blurred,diff;
 try{src=cv.imread(canvas);gray=new cv.Mat();cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);lab=new cv.Mat();cv.cvtColor(src,lab,cv.COLOR_RGBA2RGB);cv.cvtColor(lab,lab,cv.COLOR_RGB2Lab);
  lap=new cv.Mat();cv.Laplacian(gray,lap,cv.CV_64F);const ls=matMeanStd(lap),lapVar=ls.std*ls.std;
  edges=new cv.Mat();cv.Canny(gray,edges,55,145);const edgeDensity=cv.countNonZero(edges)/(edges.rows*edges.cols);
  blurred=new cv.Mat();cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);diff=new cv.Mat();cv.absdiff(gray,blurred,diff);const noise=cv.mean(diff)[0];
  const stats=matMeanStd(gray),hist=histogram(gray),regions=regionRatios(src),hz=horizon(gray,edges);
  const blurRisk=lapVar<45?'high':lapVar<120?'medium':'low';const dynamic=hist.p95-hist.p05;
  const detectedRegions=[regions.skin>.035?'Piel':null,regions.sky>.07?'Cielo':null,regions.green>.08?'Vegetación':null].filter(Boolean);
  const report={version:VERSION,width:src.cols,height:src.rows,brightness:Math.round(stats.mean),contrast:Math.round(stats.std),histogram:hist,dynamicRange:dynamic,laplacianVariance:Math.round(lapVar),edgeDensity:+edgeDensity.toFixed(4),noiseEstimate:+noise.toFixed(2),blurRisk,regions,detectedRegions,horizon:hz,clipping:{black:hist.p01<3,white:hist.p99>252}};render(report);return report;
 }finally{[src,gray,lab,lap,edges,blurred,diff].forEach(m=>{try{m?.delete()}catch{}})}}
function grayWorld(src){const rgb=new cv.Mat();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);const ch=new cv.MatVector();cv.split(rgb,ch);const means=[0,1,2].map(i=>cv.mean(ch.get(i))[0]);const target=(means[0]+means[1]+means[2])/3;for(let i=0;i<3;i++){const m=ch.get(i);m.convertTo(m,-1,clamp(target/Math.max(1,means[i]),.88,1.12),0);}cv.merge(ch,rgb);cv.cvtColor(rgb,src,cv.COLOR_RGB2RGBA);for(let i=0;i<3;i++)ch.get(i).delete();ch.delete();rgb.delete();}
function claheLuminance(src,clip=1.55){const rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);const l=channels.get(0),out=new cv.Mat();const clahe=new cv.CLAHE(clip,new cv.Size(8,8));clahe.apply(l,out);channels.set(0,out);cv.merge(channels,lab);cv.cvtColor(lab,rgb,cv.COLOR_Lab2RGB);cv.cvtColor(rgb,src,cv.COLOR_RGB2RGBA);clahe.delete();out.delete();l.delete();for(let i=1;i<3;i++)channels.get(i).delete();channels.delete();lab.delete();rgb.delete();}
function blendMasked(base,adjusted,mask,strength=1){if(!mask||strength<=0)return;const alpha=new cv.Mat();mask.convertTo(alpha,cv.CV_32F,clamp(strength,0,1)/255);const baseF=new cv.Mat(),adjF=new cv.Mat();base.convertTo(baseF,cv.CV_32F);adjusted.convertTo(adjF,cv.CV_32F);const alpha4=new cv.MatVector();for(let i=0;i<4;i++)alpha4.push_back(alpha);const a4=new cv.Mat();cv.merge(alpha4,a4);const inv=new cv.Mat();cv.subtract(new cv.Mat(a4.rows,a4.cols,a4.type(),new cv.Scalar(1,1,1,1)),a4,inv);cv.multiply(baseF,inv,baseF);cv.multiply(adjF,a4,adjF);cv.add(baseF,adjF,baseF);baseF.convertTo(base,cv.CV_8U);alpha.delete();baseF.delete();adjF.delete();a4.delete();inv.delete();for(let i=0;i<4;i++)alpha4.get(i).delete();alpha4.delete();}
function hsvAdjusted(src,satFactor=1,valDelta=0,hueDelta=0){const rgb=new cv.Mat(),hsv=new cv.Mat(),ch=new cv.MatVector();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);cv.split(hsv,ch);const h=ch.get(0),s=ch.get(1),v=ch.get(2);if(hueDelta)h.convertTo(h,-1,1,hueDelta);if(satFactor!==1)s.convertTo(s,-1,satFactor,0);if(valDelta)v.convertTo(v,-1,1,valDelta);cv.merge(ch,hsv);cv.cvtColor(hsv,rgb,cv.COLOR_HSV2RGB);const out=new cv.Mat();cv.cvtColor(rgb,out,cv.COLOR_RGB2RGBA);h.delete();s.delete();v.delete();ch.delete();hsv.delete();rgb.delete();return out;}
function regionalEnhance(src,recipe,analysis,masks){const r=analysis?.regions||{};
 // Sky: recover brightness and add restrained color.
 if(r.sky>.035){const sky=hsvAdjusted(src,1.08,-clamp((recipe.highlights||10)*.25,2,10),0);blendMasked(src,sky,masks.sky,clamp(.45+r.sky,0,.72));sky.delete();}
 // Vegetation: vibrance and gentle luminance lift.
 if(r.green>.04){const green=hsvAdjusted(src,1+clamp((recipe.vibrance||12)/180,.04,.13),2,0);blendMasked(src,green,masks.green,clamp(.38+r.green,0,.68));green.delete();}
 // Skin: protect saturation, lift shadows, slight warmth; avoid harsh CLAHE appearance.
 if(r.skin>.02){const skin=hsvAdjusted(src,1.015,clamp((recipe.shadows||10)*.18,2,7),1);const smooth=new cv.Mat();cv.bilateralFilter(skin,smooth,5,22,22,cv.BORDER_DEFAULT);blendMasked(src,smooth,masks.skin,clamp(.42+r.skin,0,.70));skin.delete();smooth.delete();}
}
function globalColor(src,recipe){const rgb=new cv.Mat(),hsv=new cv.Mat(),channels=new cv.MatVector();cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);cv.split(hsv,channels);const s=channels.get(1);const factor=1+clamp(Number(recipe.vibrance||0)/180,-.10,.13);s.convertTo(s,-1,factor,0);cv.merge(channels,hsv);cv.cvtColor(hsv,rgb,cv.COLOR_HSV2RGB);cv.cvtColor(rgb,src,cv.COLOR_RGB2RGBA);for(let i=0;i<3;i++)channels.get(i).delete();channels.delete();hsv.delete();rgb.delete();}
function sharpen(src,amount=.24){const blur=new cv.Mat(),out=new cv.Mat();cv.GaussianBlur(src,blur,new cv.Size(0,0),1.05);cv.addWeighted(src,1+amount,blur,-amount,0,out);out.copyTo(src);blur.delete();out.delete();}
function denoise(src,strength=5){if(strength<=0)return;const out=new cv.Mat();cv.bilateralFilter(src,out,5,16+strength*1.6,16+strength*1.6,cv.BORDER_DEFAULT);out.copyTo(src);out.delete();}
async function enhanceCurrent(recipe={},analysis=null){if(!ready)throw new Error('OpenCV no está listo.');const canvas=getSourceCanvas(1800);let src,masks;try{src=cv.imread(canvas);masks=buildRegionMasks(src);grayWorld(src);const clip=clamp(1.18+Math.max(0,Number(recipe.contrast||0))/52,1.18,1.85);claheLuminance(src,clip);denoise(src,clamp(Number(recipe.denoise||0),0,10));globalColor(src,recipe);regionalEnhance(src,recipe,analysis,masks);sharpen(src,clamp(Number(recipe.clarity||8)/70,.10,.34));const out=document.createElement('canvas');out.width=src.cols;out.height=src.rows;cv.imshow(out,src);return out.toDataURL('image/jpeg',.96);}finally{deleteMasks(masks);src?.delete();}}
function render(r){const el=document.getElementById('opencv-diagnostics');if(!el)return;el.hidden=false;const regs=r.detectedRegions?.length?r.detectedRegions.join(' · '):'General';el.innerHTML=`<strong>OpenCV Regional Vision activo</strong><span>Regiones: ${regs}</span><span>Enfoque: ${r.blurRisk==='low'?'Bueno':r.blurRisk==='medium'?'Medio':'Bajo'}</span><span>Ruido: ${r.noiseEstimate}</span><span>Horizonte: ${Math.abs(r.horizon.angle).toFixed(1)}°</span>`;}
function markReady(){ready=!!window.cv?.Mat;const badge=document.getElementById('engine-badge');if(ready&&badge){badge.textContent='Fabric + OpenCV Regional Vision activo';badge.classList.add('ready')}}
window.addEventListener('opencv-script-loaded',()=>{const wait=()=>window.cv?.Mat?markReady():setTimeout(wait,200);wait()});
window.PhotoOpenCV={version:VERSION,get ready(){return ready},analyzeCurrent,enhanceCurrent};
})();
