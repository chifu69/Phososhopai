(() => {
'use strict';
const VERSION='1.0.0-pro';
let ready=false;
const api=()=>window.PhotoIA;
function getSourceCanvas(max=900){
 const data=api()?.exportDataUrl?.();if(!data)throw new Error('Abre una foto primero.');
 return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const r=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*r));c.height=Math.max(1,Math.round(img.height*r));c.getContext('2d').drawImage(img,0,0,c.width,c.height);resolve(c)};img.onerror=reject;img.src=data});
}
function matMeanStd(mat){const mean=new cv.Mat(),std=new cv.Mat();cv.meanStdDev(mat,mean,std);const out={mean:mean.doubleAt(0,0),std:std.doubleAt(0,0)};mean.delete();std.delete();return out}
async function analyzeCurrent(){
 if(!ready||!window.cv?.Mat)throw new Error('OpenCV todavía no está listo.');
 const canvas=await getSourceCanvas();let src,gray,lap,edges,blurred,diff;
 try{
  src=cv.imread(canvas);gray=new cv.Mat();cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  lap=new cv.Mat();cv.Laplacian(gray,lap,cv.CV_64F);const lapStats=matMeanStd(lap);const laplacianVariance=lapStats.std*lapStats.std;
  edges=new cv.Mat();cv.Canny(gray,edges,70,150);const edgeDensity=cv.countNonZero(edges)/(edges.rows*edges.cols);
  blurred=new cv.Mat();cv.GaussianBlur(gray,blurred,new cv.Size(3,3),0);diff=new cv.Mat();cv.absdiff(gray,blurred,diff);const noiseEstimate=cv.mean(diff)[0];
  const stats=matMeanStd(gray);const blurRisk=laplacianVariance<45?'high':laplacianVariance<110?'medium':'low';
  const report={version:VERSION,width:src.cols,height:src.rows,brightness:Math.round(stats.mean),contrast:Math.round(stats.std),laplacianVariance:Math.round(laplacianVariance),edgeDensity:Number(edgeDensity.toFixed(3)),noiseEstimate:Number(noiseEstimate.toFixed(2)),blurRisk};
  render(report);return report;
 }finally{[src,gray,lap,edges,blurred,diff].forEach(m=>{try{m?.delete()}catch{}})}
}
function render(r){const el=document.getElementById('opencv-diagnostics');if(!el)return;el.hidden=false;el.innerHTML=`<strong>OpenCV activo</strong><span>Enfoque: ${r.blurRisk==='low'?'Bueno':r.blurRisk==='medium'?'Medio':'Bajo'}</span><span>Bordes: ${Math.round(r.edgeDensity*100)}%</span><span>Ruido: ${r.noiseEstimate}</span>`}
function markReady(){ready=!!window.cv?.Mat;const badge=document.getElementById('engine-badge');if(ready&&badge){badge.textContent='Fabric + OpenCV activo';badge.classList.add('ready')}}
window.addEventListener('opencv-script-loaded',()=>{const wait=()=>{if(window.cv?.Mat){markReady()}else setTimeout(wait,200)};wait()});
window.PhotoOpenCV={version:VERSION,get ready(){return ready},analyzeCurrent};
})();
