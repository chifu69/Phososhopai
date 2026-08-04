(() => {
'use strict';
const VERSION='9.0.0-adaptive-recipes';
const $=id=>document.getElementById(id);
const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const storeKey='photoia-smart-queue-v2';
let lastAnalysis=null;
const api=()=>window.PhotoIA;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const percentile=(arr,p)=>{const a=Array.from(arr).sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.round((a.length-1)*p)))]||0};
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function loadQueue(){try{return JSON.parse(localStorage.getItem(storeKey)||'[]')}catch{return []}}
function saveQueue(q){localStorage.setItem(storeKey,JSON.stringify(q.slice(-20)));renderQueue()}
function renderQueue(){const el=$('smart-queue-list');if(!el)return;const q=loadQueue();$('smart-queue-count').textContent=String(q.length);el.innerHTML=q.length?q.slice().reverse().map((x,i)=>`<div class="smart-queue-item"><div><strong>${escapeHTML(x.title)}</strong><small>${new Date(x.createdAt).toLocaleString()}</small></div><button data-remove-smart="${q.length-1-i}" type="button">×</button></div>`).join(''):'<p class="smart-empty">No hay tareas pendientes para la PC.</p>';el.querySelectorAll('[data-remove-smart]').forEach(b=>b.onclick=()=>{const next=loadQueue();next.splice(Number(b.dataset.removeSmart),1);saveQueue(next)});}
function setStatus(text,type='ready'){const b=$('smart-core-badge');if(!b)return;b.textContent=text;b.className=`smart-core-badge ${type}`}
function ensurePhoto(){if(!api()?.state?.photo)throw new Error('Abre una foto primero.');}
function canvasPixels(max=512){ensurePhoto();const c=api().getPhotoAnalysisCanvas?.(max);if(!c)throw new Error('No pude leer la fotografía original.');const ctx=c.getContext('2d',{willReadFrequently:true});return Promise.resolve({data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height});}
function capabilities(){return {webgpu:!!navigator.gpu,wasm:typeof WebAssembly==='object',cores:navigator.hardwareConcurrency||2,online:navigator.onLine};}
async function analyze(){
 setStatus('Analizando…','working');
 const {data,width,height}=await canvasPixels();
 const cvReport=window.PhotoOpenCV?.ready?await window.PhotoOpenCV.analyzeCurrent().catch(()=>null):null;
 const n=width*height,gray=new Float32Array(n),samples=[],chroma=[];let lum=0,lum2=0,sat=0,r=0,g=0,b=0,edges=0,noise=0,skin=0,sky=0,green=0,brightNeutral=0,clippedBlack=0,clippedWhite=0;
 for(let i=0,p=0;i<data.length;i+=4,p++){
  const R=data[i],G=data[i+1],B=data[i+2],L=.2126*R+.7152*G+.0722*B;gray[p]=L;lum+=L;lum2+=L*L;r+=R;g+=G;b+=B;
  const mx=Math.max(R,G,B),mn=Math.min(R,G,B),s=mx?((mx-mn)/mx):0;sat+=s;if((p&7)===0){samples.push(L);chroma.push(s)}
  if(L<8)clippedBlack++;if(L>247)clippedWhite++;
  if(R>G&&G>B&&R>70&&G>35&&(R-B)>15)skin++;
  if(B>R*1.08&&B>G*1.03&&B>85)sky++;
  if(G>R*1.08&&G>B*1.06&&G>65)green++;if(L>178&&Math.max(R,G,B)-Math.min(R,G,B)<20)brightNeutral++;
 }
 for(let y=1;y<height-1;y+=2)for(let x=1;x<width-1;x+=2){const p=y*width+x;const gx=Math.abs(gray[p+1]-gray[p-1]),gy=Math.abs(gray[p+width]-gray[p-width]);edges+=gx+gy;noise+=Math.abs(gray[p]-((gray[p-1]+gray[p+1]+gray[p-width]+gray[p+width])/4));}
 const mean=lum/n,contrast=Math.sqrt(Math.max(0,lum2/n-mean*mean)),saturation=sat/n,warmth=(r-b)/n,sharpness=edges/Math.max(1,((width-2)*(height-2)/4)),noiseLevel=noise/Math.max(1,((width-2)*(height-2)/4));
 const p05=percentile(samples,.05),p50=percentile(samples,.5),p95=percentile(samples,.95),dynamicRange=p95-p05,blackClip=clippedBlack/n,whiteClip=clippedWhite/n;
 const detections=Number(document.querySelector('#vision-count')?.textContent?.match(/\d+/)?.[0]||0);
 const ratios={skin:skin/n,sky:sky/n,green:green/n,brightNeutral:brightNeutral/n};
 const looksLikeDocument=ratios.brightNeutral>.52&&saturation<.18&&mean>145&&dynamicRange>45;
 const scene=ratios.skin>.13?'Retrato':ratios.sky>.25?'Exterior / cielo':ratios.green>.22?'Naturaleza':dynamicRange<55&&mean<105?'Noche / poca luz':looksLikeDocument?'Documento / texto':'General';
 const rec={brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0};
 if(p50<92)rec.brightness=clamp(Math.round((108-p50)*.28),6,18);else if(p50>176)rec.brightness=-clamp(Math.round((p50-168)*.25),5,16);
 if(dynamicRange<78)rec.contrast=clamp(Math.round((88-dynamicRange)*.35),8,24);else if(blackClip>.035||whiteClip>.035)rec.contrast=-clamp(Math.round((blackClip+whiteClip)*180),5,18);
 if(saturation<.16)rec.saturation=scene==='Retrato'?8:18;else if(saturation>.58)rec.saturation=-12;
 if(warmth<-18)rec.temperature=12;else if(warmth>32)rec.temperature=-10;
 if(sharpness<42)rec.sharpness=noiseLevel>13?8:18;else if(sharpness<72)rec.sharpness=8;
 if(noiseLevel>20&&scene==='Noche / poca luz')rec.blur=1;
 if(scene==='Retrato'){rec.contrast=clamp(rec.contrast,-8,10);rec.saturation=clamp(rec.saturation,-6,10);rec.sharpness=clamp(rec.sharpness,0,12)}
 if(scene==='Documento / texto'){rec.brightness=clamp(rec.brightness,-8,8);rec.saturation=Math.max(rec.saturation,-18);rec.contrast=clamp(Math.max(rec.contrast,12),10,18);rec.sharpness=clamp(Math.max(rec.sharpness,12),10,18)}
 rec.brightness=clamp(rec.brightness,-10,10);rec.contrast=clamp(rec.contrast,-10,14);rec.saturation=clamp(rec.saturation,-14,16);rec.temperature=clamp(rec.temperature,-10,10);rec.sharpness=clamp(rec.sharpness,0,14);rec.blur=clamp(rec.blur,0,2);
 const confidence=clamp(Math.round(55+Math.min(25,dynamicRange/5)+Math.min(15,n/8000)),55,95);
 if(cvReport){
   sharpness=cvReport.laplacianVariance||sharpness;
   noiseLevel=cvReport.noiseEstimate||noiseLevel;
   if(cvReport.blurRisk==='high')rec.sharpness=Math.max(rec.sharpness,10);
   if(cvReport.edgeDensity>.18&&scene==='Documento / texto')rec.contrast=Math.max(rec.contrast,28);
 }
 lastAnalysis={mean,contrast,saturation,warmth,sharpness,noiseLevel,p05,p50,p95,dynamicRange,blackClip,whiteClip,ratios,scene,confidence,recommendation:rec,detections,width,height,opencv:cvReport,capabilities:capabilities(),at:Date.now()};
 renderAnalysis(lastAnalysis);setStatus('Análisis listo','ready');return lastAnalysis;
}
function scoreLabel(v,low,high,labels){return v<low?labels[0]:v>high?labels[2]:labels[1]}
function renderAnalysis(a){const el=$('smart-analysis-result');if(!el)return;const items=[['Escena',a.scene],['Luz',scoreLabel(a.p50,92,176,['Baja','Equilibrada','Alta'])],['Rango',scoreLabel(a.dynamicRange,65,125,['Corto','Bueno','Amplio'])],['Color',scoreLabel(a.saturation,.16,.58,['Apagado','Natural','Intenso'])],['Detalle',scoreLabel(a.sharpness,42,90,['Suave','Bueno','Marcado'])],['Ruido',scoreLabel(a.noiseLevel,9,20,['Bajo','Medio','Alto'])]];el.innerHTML=`<div class="smart-metrics smart-metrics-six">${items.map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('')}</div><p>${advice(a)}</p><small class="smart-confidence">Confianza del análisis: ${a.confidence}% · ${a.opencv?'OpenCV activo':'Análisis compatible'} · ${a.capabilities.webgpu?'WebGPU disponible':'CPU/WASM'}</small>`;$('smart-apply').disabled=false;}
function advice(a){const r=a.recommendation,changes=[];if(r.brightness)changes.push(r.brightness>0?'abrir sombras y aclarar':'proteger zonas claras');if(r.contrast)changes.push(r.contrast>0?'dar profundidad':'recuperar extremos');if(r.saturation)changes.push(r.saturation>0?'recuperar color':'naturalizar color');if(r.temperature)changes.push(r.temperature>0?'corregir tono frío':'corregir tono cálido');if(r.sharpness)changes.push('mejorar detalle');if(r.blur)changes.push('suavizar ruido');return `Detecté ${a.scene.toLowerCase()}. ${changes.length?`Recomiendo ${changes.join(', ')}.`:'La imagen está bastante equilibrada.'} El ajuste es adaptativo para esta fotografía.`}
function setButtonBusy(button,busy,label){
 if(!button)return;
 if(busy){button.dataset.originalText=button.textContent;button.textContent=label||'Aplicando…';button.disabled=true;button.setAttribute('aria-busy','true');}
 else{button.textContent=button.dataset.originalText||button.textContent;button.disabled=false;button.removeAttribute('aria-busy');}
}
function applyValues(values){
 ensurePhoto();
 if(typeof api()?.applyAdaptiveAdjustments!=='function')throw new Error('El motor de ajustes no está disponible. Recarga la aplicación.');
 api().applyAdaptiveAdjustments(values,true);
}
async function applyRecommendations(button){
 setButtonBusy(button,true,'Aplicando…');setStatus('Aplicando…','working');
 try{
  const a=lastAnalysis||await analyze();applyValues(a.recommendation);api().normalizePhotoVisualState?.();api().toast(`Mejora adaptativa aplicada: ${a.scene}`);setStatus('Mejora aplicada','ready');
 }finally{setButtonBusy(button,false)}
}
async function applyMode(mode,button){
 setButtonBusy(button,true,'Calculando…');setStatus('Creando receta…','working');
 try{
  const a=lastAnalysis||await analyze();
  const lowLight=a.p50<105, highNoise=a.noiseLevel>15, flat=a.dynamicRange<82, portrait=a.scene==='Retrato';
  const base=a.recommendation;
  const recipes={
   natural:{
    brightness:clamp(base.brightness,-14,22),
    contrast:clamp(flat?Math.max(8,base.contrast):base.contrast,-10,16),
    saturation:clamp(base.saturation,-8,14),
    temperature:clamp(base.temperature,-10,10),
    sharpness:clamp(highNoise?Math.min(7,base.sharpness):Math.max(6,base.sharpness),0,14),
    blur:highNoise?1:0
   },
   portrait:{
    brightness:clamp(Math.max(lowLight?14:6,base.brightness),4,24),
    contrast:clamp(portrait?base.contrast:4,-4,8),
    saturation:clamp(Math.max(5,base.saturation),3,11),
    temperature:clamp(Math.max(4,base.temperature),2,12),
    sharpness:highNoise?5:9,
    blur:highNoise?2:1
   },
   night:{
    brightness:clamp(Math.max(18,base.brightness),12,30),
    contrast:clamp(flat?10:5,2,13),
    saturation:clamp(base.saturation,-4,8),
    temperature:clamp(base.temperature,-8,5),
    sharpness:highNoise?4:7,
    blur:highNoise?3:1
   },
   document:{brightness:6,contrast:18,saturation:-18,temperature:0,sharpness:16,blur:0},
   vivid:{
    brightness:clamp(base.brightness,-8,16),
    contrast:clamp(Math.max(18,base.contrast),15,28),
    saturation:clamp(Math.max(32,base.saturation),26,44),
    temperature:clamp(base.temperature,-6,9),
    sharpness:clamp(Math.max(16,base.sharpness),14,24),
    blur:0
   }
  };
  const rec=recipes[mode]||recipes.natural;
  applyValues(rec);
  document.querySelectorAll('[data-smart-mode]').forEach(x=>x.classList.toggle('active',x===button));
  const labels={natural:'Natural',portrait:'Retrato',night:'Noche',document:'Documento',vivid:'Vibrante'};
  renderRecipe(labels[mode]||mode,rec,a);
  api().toast(`Modo ${labels[mode]||mode} aplicado`);setStatus(`${labels[mode]||mode} aplicado`,'ready');
 }finally{setButtonBusy(button,false)}
}
function renderRecipe(name,rec,a){
 const el=$('smart-recipe-result');if(!el)return;
 const names={brightness:'Luz',contrast:'Contraste',saturation:'Color',temperature:'Temperatura',sharpness:'Detalle',blur:'Suavizado'};
 const rows=Object.entries(rec).map(([k,v])=>`<div><span>${names[k]}</span><strong>${v>0?'+':''}${v}</strong></div>`).join('');
 el.hidden=false;
 el.innerHTML=`<div class="smart-recipe-head"><strong>Receta ${escapeHTML(name)}</strong><small>${escapeHTML(a.scene)} · ${a.confidence}% confianza</small></div><div class="smart-recipe-values">${rows}</div>`;
}

function classify(raw){const t=normalize(raw);const complex=/abraz|pose|cambia.*ropa|vestido|traje realista|ponme en|playa|paris|disney|agrega.*persona|quita.*persona|elimina.*objeto grande|reconstru|genera|crea una escena|cambia.*cuerpo|face swap|intercambia.*cara|foto de referencia/.test(t);const local=/brillo|contraste|color|satur|nitidez|desenfoc|recort|gira|espejo|texto|sticker|circulo|cuadrado|rectangulo|flecha|linea|fondo|mascara|separa.*persona|quita.*fondo|profesional|retrato|blanco y negro|natural|noche|documento|mejora/.test(t);return complex?'pc':local?'phone':'unknown';}
function queueForPC(raw){const q=loadQueue();q.push({id:crypto.randomUUID?.()||String(Date.now()),title:raw.trim().slice(0,120),prompt:raw.trim(),createdAt:Date.now(),status:'waiting'});saveQueue(q);const prompt=$('ai-prompt');if(prompt&&!prompt.value)prompt.value=raw.trim();api().toast('Tarea guardada para cuando enciendas el Alienware');setStatus('Guardada para PC','queued');return true;}
function explainRoute(raw){const kind=classify(raw);if(kind==='phone')return 'Esta edición se puede resolver directamente en el teléfono.';if(kind==='pc')return 'Esta edición necesita crear contenido nuevo; se guardará para el Alienware.';return 'Primero intentaré resolverla localmente y solo usaré la PC si hace falta generar contenido.';}
function registerBrain(){if(!window.PhotoBrain?.register)return setTimeout(registerBrain,120);
 window.PhotoBrain.register({name:'adaptive-local-core',score:t=>/mejora.*intelig|auto.*foto|corrige.*foto|color natural|modo retrato|foto nocturna|modo noche|documento/.test(t)?115:0,run:(t)=>{if(/retrato/.test(t))applyMode('portrait');else if(/noche|nocturna/.test(t))applyMode('night');else if(/documento/.test(t))applyMode('document');else if(/vibrante/.test(t))applyMode('vivid');else applyMode('natural');const box=$('brain-response');if(box){box.textContent='Apliqué un ajuste adaptativo local basado en el contenido de la fotografía.';box.className='brain-response success';}}});
 window.PhotoBrain.register({name:'smart-pc-router',score:t=>/abraz|pose|cambia.*ropa|vestido|ponme en|playa|paris|disney|agrega.*persona|quita.*persona|reconstru|genera|crea una escena|cambia.*cuerpo|face swap|intercambia.*cara|foto de referencia/.test(t)?110:0,run:(t,raw)=>{queueForPC(raw);const box=$('brain-response');if(box){box.textContent='Esta edición es generativa. La guardé para ejecutarla cuando enciendas el Alienware.';box.className='brain-response info';}}});
}
function bindSmartButtons(){
 const analyzeBtn=$('smart-analyze'),applyBtn=$('smart-apply');
 if(analyzeBtn)analyzeBtn.onclick=()=>analyze().catch(err=>{console.error(err);setStatus('No se pudo analizar','error');api()?.toast(err.message)});
 if(applyBtn)applyBtn.onclick=()=>applyRecommendations(applyBtn).catch(err=>{console.error(err);setStatus('Error al aplicar','error');api()?.toast(err.message)});
 const runMode=(button,event)=>{
  event?.preventDefault?.();event?.stopPropagation?.();
  if(button.dataset.running==='1')return;
  button.dataset.running='1';
  applyMode(button.dataset.smartMode,button).catch(err=>{console.error(err);setStatus('Error al aplicar','error');api()?.toast(err.message)}).finally(()=>button.dataset.running='0');
 };
 document.querySelectorAll('[data-smart-mode]').forEach(button=>{
  button.disabled=false;button.removeAttribute('disabled');button.style.pointerEvents='auto';
  button.onclick=e=>runMode(button,e);
 });
 // Respaldo delegado para Safari/PWA si el DOM se vuelve a renderizar.
 const grid=document.querySelector('.smart-mode-grid');
 if(grid&&!grid.dataset.bound){grid.dataset.bound='1';grid.addEventListener('click',e=>{const b=e.target.closest('[data-smart-mode]');if(b&&typeof b.onclick!=='function')runMode(b,e)});}
}

function boot(){
 renderQueue();bindSmartButtons();
 $('smart-queue-clear')?.addEventListener('click',()=>saveQueue([]));
 const input=$('command-input');input?.addEventListener('input',()=>{const text=input.value.trim();$('smart-route-hint').textContent=text?explainRoute(text):'PHOTO IA decidirá si la tarea se hace aquí o se guarda para la PC.';});
 registerBrain();window.PhotoSmartCore={version:VERSION,analyze,applyRecommendations,applyMode,classify,queueForPC,loadQueue,capabilities,bindSmartButtons};
 setStatus(api()?.state?.canvas?'Núcleo adaptativo listo':'Esperando editor…','ready');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
