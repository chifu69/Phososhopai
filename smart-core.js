(() => {
'use strict';
const VERSION='11.0.0-clean-vision-4';
const $=id=>document.getElementById(id),api=()=>window.PhotoIA,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let lastAnalysis=null;
const percentile=(arr,p)=>{const a=Array.from(arr).sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.round((a.length-1)*p)))]||0};
function setStatus(text,type='ready'){const b=$('smart-core-badge');if(b){b.textContent=text;b.className=`smart-core-badge ${type}`}}
function ensurePhoto(){if(!api()?.state?.photo)throw new Error('Abre una foto primero.');}
function sourceCanvas(max=900){ensurePhoto();const c=api().getPhotoAnalysisCanvas?.(max);if(!c)throw new Error('No pude leer la fotografía original.');return c;}
function metrics(data,w,h){const n=w*h,gray=new Float32Array(n),sample=[];let sum=0,sum2=0,sat=0,r=0,g=0,b=0,skin=0,green=0,sky=0,black=0,white=0,edge=0,noise=0;
 for(let i=0,p=0;i<data.length;i+=4,p++){const R=data[i],G=data[i+1],B=data[i+2],L=.2126*R+.7152*G+.0722*B;gray[p]=L;sum+=L;sum2+=L*L;r+=R;g+=G;b+=B;const mx=Math.max(R,G,B),mn=Math.min(R,G,B);sat+=mx?(mx-mn)/mx:0;if((p&7)===0)sample.push(L);if(L<8)black++;if(L>247)white++;if(R>G&&G>B&&R>70&&G>35&&R-B>15)skin++;if(G>R*1.08&&G>B*1.06&&G>65)green++;if(B>R*1.08&&B>G*1.03&&B>85)sky++;}
 let q=0;for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x+=2){const p=y*w+x;edge+=Math.abs(gray[p+1]-gray[p-1])+Math.abs(gray[p+w]-gray[p-w]);noise+=Math.abs(gray[p]-(gray[p-1]+gray[p+1]+gray[p-w]+gray[p+w])/4);q++;}
 const p05=percentile(sample,.05),p50=percentile(sample,.5),p95=percentile(sample,.95),mean=sum/n;
 return{mean,p05,p50,p95,dynamic:p95-p05,contrast:Math.sqrt(Math.max(0,sum2/n-mean*mean)),saturation:sat/n,warmth:(r-b)/n,blackClip:black/n,whiteClip:white/n,sharpness:edge/Math.max(1,q),noise:noise/Math.max(1,q),skin:skin/n,green:green/n,sky:sky/n};}
function scene(m){if(m.skin>.10)return m.green>.15?'Retrato en naturaleza':'Retrato';if(m.green>.22)return'Naturaleza';if(m.sky>.22)return'Exterior';if(m.p50<85)return'Poca luz';return'General';}
function buildRecipe(m,s){
 const portrait=s.includes('Retrato');
 const target=portrait?138:s==='Poca luz'?128:142;
 const exposure=clamp(Math.log2(target/Math.max(42,m.p50)),-.28,.62);
 const shadows=clamp(Math.round((92-m.p05)*.62),0,portrait?42:50);
 const highlights=clamp(Math.round((m.p95-212)*.72),0,48);
 const contrast=clamp(Math.round((61-m.contrast)*.48),-10,24);
 let vibrance=clamp(Math.round((.42-m.saturation)*68),3,portrait?19:30);
 if(m.saturation>.54)vibrance=-clamp(Math.round((m.saturation-.52)*45),2,12);
 const warmth=clamp(Math.round(-m.warmth*.22),-12,12)+(portrait?3:0);
 const clarity=clamp(Math.round((58-m.sharpness)*.52),4,m.noise>20?14:26);
 const blackPoint=clamp(Math.round(m.p05*.55),0,18);
 const whitePoint=clamp(Math.round(255-(255-m.p95)*.38),232,255);
 const gamma=clamp(1+(128-m.p50)/520,.90,1.12);
 const denoise=clamp(Math.round((m.noise-10)*.65),0,18);
 return{exposure:+exposure.toFixed(2),shadows,highlights,contrast,vibrance,warmth,clarity,blackPoint,whitePoint,gamma:+gamma.toFixed(3),denoise};
}
function variants(base,s){const arr=[{name:s.includes('Retrato')?'Portrait Landscape':'Professional Natural',recipe:base}];
 arr.push({name:'Natural Clean',recipe:{...base,exposure:+(base.exposure*.8).toFixed(2),shadows:Math.round(base.shadows*.8),contrast:Math.round(base.contrast*.8),vibrance:Math.round(base.vibrance*.75),clarity:Math.round(base.clarity*.75)}});
 arr.push({name:'Rich Detail',recipe:{...base,contrast:clamp(base.contrast+5,-8,22),vibrance:clamp(base.vibrance+5,-10,26),clarity:clamp(base.clarity+6,5,30)}});
 arr.push({name:'Bright & Airy',recipe:{...base,exposure:clamp(+(base.exposure+.14).toFixed(2),-.3,.6),shadows:clamp(base.shadows+8,0,44),contrast:clamp(base.contrast-4,-10,14),vibrance:clamp(base.vibrance+2,-8,22)}});
 return arr;
}
function predict(m,r,s){const p50=m.p50*Math.pow(2,r.exposure)+(r.shadows*.18)-(r.highlights*.12);const clip=Math.max(0,(p50-190)/160)+m.whiteClip*.7;let score=100-Math.abs(p50-(s==='Poca luz'?118:136))*.35-clip*120;score-=Math.max(0,Math.abs(r.vibrance)-25)*2;score-=Math.max(0,r.clarity-30)*2;return score;}
async function analyze(){setStatus('Analizando escena…','working');const el=$('smart-analysis-result');if(el)el.innerHTML='<div class="smart-progress-list"><span>✓ Exposición y rango tonal</span><span>✓ Rostro y tonos de piel</span><span>✓ Vegetación, cielo y color</span><span>✓ Detalle y ruido con OpenCV</span><span class="working">● Creando y comparando recetas…</span></div>';
 const c=sourceCanvas(),ctx=c.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,c.width,c.height),m=metrics(im.data,c.width,c.height);const cv=window.PhotoOpenCV?.ready?await window.PhotoOpenCV.analyzeCurrent().catch(()=>null):null;if(cv){m.sharpness=cv.laplacianVariance||m.sharpness;m.noise=cv.noiseEstimate||m.noise;}
 const sc=scene(m),base=buildRecipe(m,sc),cands=variants(base,sc).map(x=>({...x,score:predict(m,x.recipe,sc)})).sort((a,b)=>b.score-a.score),best=cands[0];const confidence=clamp(Math.round(76+Math.min(14,m.dynamic/10)+(best.score-cands.at(-1).score)/2),70,96);
 lastAnalysis={metrics:m,scene:sc,recipeName:best.name,recommendation:best.recipe,candidates:cands,confidence,opencv:cv,at:Date.now()};render(lastAnalysis);setStatus('Receta profesional lista','ready');return lastAnalysis;}
function render(a){const el=$('smart-analysis-result');if(!el)return;const m=a.metrics;const items=[['Escena',a.scene],['Luz',m.p50<95?'Baja':m.p50>175?'Alta':'Equilibrada'],['Sombras',m.p05<30?'Cerradas':'Buenas'],['Altas luces',m.p95>230?'Fuertes':'Controladas'],['Color',m.saturation<.2?'Apagado':m.saturation>.52?'Intenso':'Natural'],['Detalle',m.sharpness<42?'Suave':'Bueno']];el.innerHTML=`<div class="smart-pro-result"><div class="smart-pro-title"><strong>⭐ ${a.recipeName}</strong><small>${a.confidence}% confianza</small></div><div class="smart-metrics smart-metrics-six">${items.map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('')}</div><p>PHOTO IA preparó una edición completa de luz, sombras, altas luces, color, temperatura y detalle. La receta fue elegida entre ${a.candidates.length} versiones.</p><small class="smart-confidence">${a.opencv?'OpenCV activo':'Análisis local'} · Fabric mantiene capas y edición no destructiva</small></div>`;$('smart-apply').disabled=false;}
function busy(btn,on,text){if(!btn)return;if(on){btn.dataset.txt=btn.textContent;btn.textContent=text;btn.disabled=true}else{btn.textContent=btn.dataset.txt||btn.textContent;btn.disabled=false}}
async function applyRecommendations(btn){busy(btn,true,'Aplicando mejora profesional…');setStatus('Aplicando…','working');try{const a=lastAnalysis||await analyze();if(typeof api()?.applySmartPixelRecipe!=='function')throw new Error('Recarga la aplicación para activar Vision Engine 4.0.');await api().applySmartPixelRecipe(a.recommendation,true);renderRecipe(a);api().toast('Mejora profesional aplicada');setStatus('Mejora aplicada','ready')}finally{busy(btn,false)}}
function renderRecipe(a){const el=$('smart-recipe-result');if(!el)return;const labels={exposure:'Exposición',shadows:'Sombras',highlights:'Altas luces',contrast:'Contraste',vibrance:'Color inteligente',warmth:'Temperatura',clarity:'Detalle',blackPoint:'Punto negro',whitePoint:'Punto blanco',gamma:'Medios tonos',denoise:'Ruido'};el.hidden=false;el.innerHTML=`<div class="smart-recipe-head"><strong>${a.recipeName}</strong><small>${a.scene} · ${a.confidence}% confianza</small></div><div class="smart-recipe-values">${Object.entries(a.recommendation).map(([k,v])=>`<div><span>${labels[k]}</span><strong>${v>0?'+':''}${v}</strong></div>`).join('')}</div>`;}
function bind(){const a=$('smart-analyze'),b=$('smart-apply');if(a)a.onclick=()=>analyze().catch(e=>{console.error(e);setStatus('No se pudo analizar','error');api()?.toast(e.message)});if(b)b.onclick=()=>applyRecommendations(b).catch(e=>{console.error(e);setStatus('Error al aplicar','error');api()?.toast(e.message)});document.addEventListener('photoia:image-loaded',()=>{lastAnalysis=null;setStatus('Lista para analizar','ready');if(b)b.disabled=true});document.addEventListener('photoia:image-cleared',()=>{lastAnalysis=null;if(b)b.disabled=true;setStatus('Esperando foto…','ready')});}
function boot(){bind();window.PhotoSmartCore={version:VERSION,analyze,applyRecommendations};setStatus('Vision Engine 4.0 listo','ready')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
