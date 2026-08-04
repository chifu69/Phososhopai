(() => {
'use strict';
const VERSION='10.3.0-smart-engine-2';
const $=id=>document.getElementById(id);
const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const storeKey='photoia-smart-queue-v2';
let lastAnalysis=null;
const api=()=>window.PhotoIA;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const escapeHTML=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percentile=(arr,p)=>{const a=Array.from(arr).sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.round((a.length-1)*p)))]||0};
function loadQueue(){try{return JSON.parse(localStorage.getItem(storeKey)||'[]')}catch{return []}}
function saveQueue(q){localStorage.setItem(storeKey,JSON.stringify(q.slice(-20)));renderQueue()}
function renderQueue(){const el=$('smart-queue-list');if(!el)return;const q=loadQueue();$('smart-queue-count').textContent=String(q.length);el.innerHTML=q.length?q.slice().reverse().map((x,i)=>`<div class="smart-queue-item"><div><strong>${escapeHTML(x.title)}</strong><small>${new Date(x.createdAt).toLocaleString()}</small></div><button data-remove-smart="${q.length-1-i}" type="button">×</button></div>`).join(''):'<p class="smart-empty">No hay tareas pendientes para la PC.</p>';el.querySelectorAll('[data-remove-smart]').forEach(b=>b.onclick=()=>{const next=loadQueue();next.splice(Number(b.dataset.removeSmart),1);saveQueue(next)});}
function setStatus(text,type='ready'){const b=$('smart-core-badge');if(!b)return;b.textContent=text;b.className=`smart-core-badge ${type}`}
function ensurePhoto(){if(!api()?.state?.photo)throw new Error('Abre una foto primero.');}
function sourceCanvas(max=720){ensurePhoto();const c=api().getPhotoAnalysisCanvas?.(max);if(!c)throw new Error('No pude leer la fotografía original.');return c;}
function capabilities(){return {webgpu:!!navigator.gpu,wasm:typeof WebAssembly==='object',cores:navigator.hardwareConcurrency||2,online:navigator.onLine};}
function showProgress(active){const el=$('smart-analysis-result');if(!el)return;if(!active)return;el.innerHTML=`<div class="smart-progress-list">
<span>✓ Fotografía original aislada</span><span>✓ Histograma y exposición</span><span>✓ Sombras y altas luces</span><span>✓ Color y temperatura</span><span>✓ Nitidez y ruido con OpenCV</span><span class="working">● Comparando recetas…</span></div>`;}
function metricsFromPixels(data,width,height){
 const n=width*height, gray=new Float32Array(n), samples=[], chroma=[];
 let lum=0,lum2=0,sat=0,r=0,g=0,b=0,edges=0,noise=0,skin=0,sky=0,green=0,brightNeutral=0,clippedBlack=0,clippedWhite=0;
 for(let i=0,p=0;i<data.length;i+=4,p++){
  const R=data[i],G=data[i+1],B=data[i+2],L=.2126*R+.7152*G+.0722*B;gray[p]=L;lum+=L;lum2+=L*L;r+=R;g+=G;b+=B;
  const mx=Math.max(R,G,B),mn=Math.min(R,G,B),s=mx?((mx-mn)/mx):0;sat+=s;if((p&7)===0){samples.push(L);chroma.push(s)}
  if(L<8)clippedBlack++;if(L>247)clippedWhite++;
  if(R>G&&G>B&&R>70&&G>35&&(R-B)>15)skin++;
  if(B>R*1.08&&B>G*1.03&&B>85)sky++;
  if(G>R*1.08&&G>B*1.06&&G>65)green++;
  if(L>178&&Math.max(R,G,B)-Math.min(R,G,B)<20)brightNeutral++;
 }
 let checks=0;
 for(let y=1;y<height-1;y+=2)for(let x=1;x<width-1;x+=2){const p=y*width+x;edges+=Math.abs(gray[p+1]-gray[p-1])+Math.abs(gray[p+width]-gray[p-width]);noise+=Math.abs(gray[p]-((gray[p-1]+gray[p+1]+gray[p-width]+gray[p+width])/4));checks++;}
 const mean=lum/n,contrast=Math.sqrt(Math.max(0,lum2/n-mean*mean)),saturation=sat/n,warmth=(r-b)/n;
 return {mean,contrast,saturation,warmth,sharpness:edges/Math.max(1,checks),noiseLevel:noise/Math.max(1,checks),p05:percentile(samples,.05),p50:percentile(samples,.5),p95:percentile(samples,.95),dynamicRange:percentile(samples,.95)-percentile(samples,.05),blackClip:clippedBlack/n,whiteClip:clippedWhite/n,ratios:{skin:skin/n,sky:sky/n,green:green/n,brightNeutral:brightNeutral/n}};
}
function sceneFrom(m){const doc=m.ratios.brightNeutral>.52&&m.saturation<.18&&m.mean>145&&m.dynamicRange>45;if(m.ratios.skin>.13)return'Retrato';if(m.ratios.sky>.25)return'Exterior / cielo';if(m.ratios.green>.22)return'Naturaleza';if(m.dynamicRange<55&&m.mean<105)return'Noche / poca luz';if(doc)return'Documento / texto';return'General';}
function baseRecipe(m,scene){const r={brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0};
 if(m.p50<88)r.brightness=clamp(Math.round((112-m.p50)*.25),5,16);else if(m.p50>180)r.brightness=-clamp(Math.round((m.p50-170)*.22),4,12);
 if(m.dynamicRange<72)r.contrast=clamp(Math.round((90-m.dynamicRange)*.28),5,14);else if(m.blackClip>.025||m.whiteClip>.025)r.contrast=-clamp(Math.round((m.blackClip+m.whiteClip)*140),3,10);
 if(m.saturation<.18)r.saturation=scene==='Retrato'?7:13;else if(m.saturation>.58)r.saturation=-8;
 if(m.warmth<-20)r.temperature=8;else if(m.warmth>34)r.temperature=-7;
 if(m.sharpness<40)r.sharpness=m.noiseLevel>14?5:10;else if(m.sharpness<65)r.sharpness=5;
 if(m.noiseLevel>20&&scene==='Noche / poca luz')r.blur=1;
 if(scene==='Retrato'){r.brightness=clamp(r.brightness,-6,12);r.contrast=clamp(r.contrast,-5,8);r.saturation=clamp(r.saturation,-5,9);r.temperature=clamp(r.temperature,-5,8);r.sharpness=clamp(r.sharpness,0,8)}
 if(scene==='Documento / texto'){r.brightness=clamp(r.brightness,-5,6);r.contrast=clamp(Math.max(r.contrast,10),8,14);r.saturation=-12;r.sharpness=clamp(Math.max(r.sharpness,8),8,12)}
 return r;
}
function makeCandidates(base,scene,m){const c=[];const add=(name,v)=>c.push({name,values:{brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0,...v}});
 add('Equilibrada',base);
 add('Natural',{...base,brightness:Math.round(base.brightness*.75),contrast:Math.round(base.contrast*.75),saturation:Math.round(base.saturation*.7),temperature:Math.round(base.temperature*.7),sharpness:Math.round(base.sharpness*.7)});
 add('Clara',{...base,brightness:clamp(base.brightness+4,-10,16),contrast:clamp(base.contrast-2,-10,12),saturation:clamp(base.saturation+2,-10,14)});
 add('Profunda',{...base,brightness:clamp(base.brightness-1,-10,14),contrast:clamp(base.contrast+4,-8,16),saturation:clamp(base.saturation+3,-10,16)});
 if(scene==='Retrato')add('Retrato natural',{...base,brightness:clamp(base.brightness+3,0,14),contrast:clamp(base.contrast-2,-5,6),saturation:clamp(base.saturation,2,8),temperature:clamp(base.temperature+2,-3,8),sharpness:clamp(base.sharpness,2,7),blur:m.noiseLevel>18?1:0});
 if(scene==='Noche / poca luz')add('Noche limpia',{...base,brightness:clamp(base.brightness+4,8,18),contrast:clamp(base.contrast,2,10),saturation:clamp(base.saturation,-3,7),sharpness:clamp(base.sharpness,2,6),blur:m.noiseLevel>16?1:0});
 return c;
}
function transformPixel(R,G,B,v){
 let r=R,g=G,b=B;
 const bright=v.brightness*2.2;r+=bright;g+=bright;b+=bright;
 const cf=1+v.contrast/100;r=(r-128)*cf+128;g=(g-128)*cf+128;b=(b-128)*cf+128;
 const l=.2126*r+.7152*g+.0722*b,sf=1+v.saturation/100;r=l+(r-l)*sf;g=l+(g-l)*sf;b=l+(b-l)*sf;
 const temp=v.temperature*.32;r+=temp;b-=temp;
 return [clamp(r,0,255),clamp(g,0,255),clamp(b,0,255)];
}
function scoreCandidate(data,v,scene){let n=0,lum=0,lum2=0,sat=0,black=0,white=0,warm=0;const vals=[];for(let i=0;i<data.length;i+=32){const [R,G,B]=transformPixel(data[i],data[i+1],data[i+2],v);const L=.2126*R+.7152*G+.0722*B;vals.push(L);lum+=L;lum2+=L*L;const mx=Math.max(R,G,B),mn=Math.min(R,G,B);sat+=mx?((mx-mn)/mx):0;if(L<5)black++;if(L>250)white++;warm+=R-B;n++;}
 const mean=lum/n,contrast=Math.sqrt(Math.max(0,lum2/n-mean*mean)),saturation=sat/n,clip=(black+white)/n,p50=percentile(vals,.5);
 let score=100;score-=Math.abs(p50-(scene==='Noche / poca luz'?108:scene==='Documento / texto'?190:132))*.28;score-=Math.abs(contrast-(scene==='Retrato'?48:scene==='Documento / texto'?70:58))*.22;score-=clip*900;
 const satTarget=scene==='Retrato'?.30:scene==='Documento / texto'?.06:.38;score-=Math.abs(saturation-satTarget)*40;
 score-=Math.max(0,Math.abs(v.brightness)-16)*2;score-=Math.max(0,Math.abs(v.contrast)-18)*2;score-=Math.max(0,Math.abs(v.saturation)-22)*1.5;
 return {score,preview:{mean,contrast,saturation,clip,warmth:warm/n}};
}
async function analyze(){
 setStatus('Analizando…','working');showProgress(true);
 const c=sourceCanvas(),ctx=c.getContext('2d',{willReadFrequently:true}),img=ctx.getImageData(0,0,c.width,c.height),m=metricsFromPixels(img.data,c.width,c.height);
 const cvReport=window.PhotoOpenCV?.ready?await window.PhotoOpenCV.analyzeCurrent().catch(()=>null):null;
 if(cvReport){m.sharpness=cvReport.laplacianVariance||m.sharpness;m.noiseLevel=cvReport.noiseEstimate||m.noiseLevel;}
 const scene=sceneFrom(m),base=baseRecipe(m,scene),candidates=makeCandidates(base,scene,m).map(x=>({...x,...scoreCandidate(img.data,x.values,scene)})).sort((a,b)=>b.score-a.score);
 const best=candidates[0];
 const confidence=clamp(Math.round(62+Math.min(18,m.dynamicRange/7)+Math.min(10,c.width*c.height/30000)+(best.score-candidates.at(-1).score)/3),58,96);
 lastAnalysis={...m,scene,confidence,recommendation:best.values,recipeName:best.name,candidates,opencv:cvReport,capabilities:capabilities(),width:c.width,height:c.height,at:Date.now()};
 renderAnalysis(lastAnalysis);setStatus('Receta PRO lista','ready');return lastAnalysis;
}
function scoreLabel(v,low,high,labels){return v<low?labels[0]:v>high?labels[2]:labels[1]}
function renderAnalysis(a){const el=$('smart-analysis-result');if(!el)return;const items=[['Escena',a.scene],['Luz',scoreLabel(a.p50,92,176,['Baja','Equilibrada','Alta'])],['Rango',scoreLabel(a.dynamicRange,65,125,['Corto','Bueno','Amplio'])],['Color',scoreLabel(a.saturation,.16,.58,['Apagado','Natural','Intenso'])],['Detalle',scoreLabel(a.sharpness,42,110,['Suave','Bueno','Marcado'])],['Ruido',scoreLabel(a.noiseLevel,9,20,['Bajo','Medio','Alto'])]];
 el.innerHTML=`<div class="smart-pro-result"><div class="smart-pro-title"><strong>⭐ Receta PRO: ${escapeHTML(a.recipeName)}</strong><small>${a.confidence}% confianza</small></div><div class="smart-metrics smart-metrics-six">${items.map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('')}</div><p>${advice(a)}</p><small class="smart-confidence">Se compararon ${a.candidates.length} recetas sobre la fotografía original · ${a.opencv?'OpenCV activo':'Análisis compatible'} · Fabric renderiza el resultado</small></div>`;$('smart-apply').disabled=false;}
function advice(a){const r=a.recommendation,changes=[];if(r.brightness)changes.push(r.brightness>0?'mejorar luz y sombras':'recuperar altas luces');if(r.contrast)changes.push(r.contrast>0?'dar profundidad':'suavizar contraste');if(r.saturation)changes.push(r.saturation>0?'recuperar color':'naturalizar color');if(r.temperature)changes.push(r.temperature>0?'aportar calidez':'corregir exceso de calidez');if(r.sharpness)changes.push('mejorar detalle');if(r.blur)changes.push('controlar ruido');return `Detecté ${a.scene.toLowerCase()}. Elegí la receta que mejora más la imagen sin quemar luces, cerrar sombras ni alterar demasiado la piel. ${changes.length?`Aplicará: ${changes.join(', ')}.`:'La foto ya está equilibrada; el ajuste será mínimo.'}`;}
function setButtonBusy(button,busy,label){if(!button)return;if(busy){button.dataset.originalText=button.textContent;button.textContent=label||'Aplicando…';button.disabled=true;button.setAttribute('aria-busy','true')}else{button.textContent=button.dataset.originalText||button.textContent;button.disabled=false;button.removeAttribute('aria-busy')}}
function applyValues(values){ensurePhoto();if(typeof api()?.applyAdaptiveAdjustments!=='function')throw new Error('El motor de ajustes no está disponible. Recarga la aplicación.');return api().applyAdaptiveAdjustments(values,true);}
async function applyRecommendations(button){setButtonBusy(button,true,'Aplicando receta PRO…');setStatus('Aplicando…','working');try{const a=lastAnalysis||await analyze();api().normalizePhotoVisualState?.();const applied=applyValues(a.recommendation);api().normalizePhotoVisualState?.();renderRecipe(a.recipeName,applied,a);api().toast(`Receta PRO ${a.recipeName} aplicada`);setStatus('Mejora aplicada','ready')}finally{setButtonBusy(button,false)}}
async function applyMode(mode,button){setButtonBusy(button,true,'Calculando…');setStatus('Creando receta…','working');try{const a=lastAnalysis||await analyze(),base=a.recommendation;const recipes={natural:{...base,brightness:Math.round(base.brightness*.75),contrast:Math.round(base.contrast*.75),saturation:Math.round(base.saturation*.7),temperature:Math.round(base.temperature*.7),sharpness:Math.round(base.sharpness*.7)},portrait:{...base,brightness:clamp(base.brightness+3,0,14),contrast:clamp(base.contrast-2,-5,7),saturation:clamp(base.saturation,2,9),temperature:clamp(base.temperature+2,-3,9),sharpness:clamp(base.sharpness,2,7),blur:a.noiseLevel>18?1:0},night:{...base,brightness:clamp(base.brightness+4,8,18),contrast:clamp(base.contrast,2,10),saturation:clamp(base.saturation,-3,7),sharpness:clamp(base.sharpness,2,6),blur:a.noiseLevel>16?1:0},document:{brightness:4,contrast:13,saturation:-12,temperature:0,sharpness:10,blur:0},vivid:{...base,brightness:clamp(base.brightness,-5,12),contrast:clamp(base.contrast+5,5,18),saturation:clamp(base.saturation+12,10,25),temperature:clamp(base.temperature,-5,8),sharpness:clamp(base.sharpness+4,5,14),blur:0}};const rec=recipes[mode]||recipes.natural;applyValues(rec);api().normalizePhotoVisualState?.();document.querySelectorAll('[data-smart-mode]').forEach(x=>x.classList.toggle('active',x===button));const labels={natural:'Natural',portrait:'Retrato',night:'Noche',document:'Documento',vivid:'Vibrante'};renderRecipe(labels[mode]||mode,rec,a);api().toast(`Modo ${labels[mode]||mode} aplicado`);setStatus(`${labels[mode]||mode} aplicado`,'ready')}finally{setButtonBusy(button,false)}}
function renderRecipe(name,rec,a){const el=$('smart-recipe-result');if(!el)return;const names={brightness:'Luz',contrast:'Contraste',saturation:'Color',temperature:'Temperatura',sharpness:'Detalle',blur:'Suavizado'};const rows=Object.entries(rec).map(([k,v])=>`<div><span>${names[k]}</span><strong>${v>0?'+':''}${v}</strong></div>`).join('');el.hidden=false;el.innerHTML=`<div class="smart-recipe-head"><strong>Receta ${escapeHTML(name)}</strong><small>${escapeHTML(a.scene)} · ${a.confidence}% confianza</small></div><div class="smart-recipe-values">${rows}</div>`;}
function classify(raw){const t=normalize(raw);const complex=/abraz|pose|cambia.*ropa|vestido|traje realista|ponme en|playa|paris|disney|agrega.*persona|quita.*persona|elimina.*objeto grande|reconstru|genera|crea una escena|cambia.*cuerpo|face swap|intercambia.*cara|foto de referencia/.test(t);const local=/brillo|contraste|color|satur|nitidez|desenfoc|recort|gira|espejo|texto|sticker|circulo|cuadrado|rectangulo|flecha|linea|fondo|mascara|separa.*persona|quita.*fondo|profesional|retrato|blanco y negro|natural|noche|documento|mejora/.test(t);return complex?'pc':local?'phone':'unknown'}
function queueForPC(raw){const q=loadQueue();q.push({id:crypto.randomUUID?.()||String(Date.now()),title:raw.trim().slice(0,120),prompt:raw.trim(),createdAt:Date.now(),status:'waiting'});saveQueue(q);const prompt=$('ai-prompt');if(prompt&&!prompt.value)prompt.value=raw.trim();api().toast('Tarea guardada para cuando enciendas el Alienware');setStatus('Guardada para PC','queued');return true}
function explainRoute(raw){const kind=classify(raw);if(kind==='phone')return'Esta edición se puede resolver directamente en el teléfono.';if(kind==='pc')return'Esta edición necesita crear contenido nuevo; se guardará para el Alienware.';return'Primero intentaré resolverla localmente y solo usaré la PC si hace falta generar contenido.'}
function registerBrain(){if(!window.PhotoBrain?.register)return setTimeout(registerBrain,120);window.PhotoBrain.register({name:'adaptive-local-core',score:t=>/mejora.*intelig|auto.*foto|corrige.*foto|color natural|modo retrato|foto nocturna|modo noche|documento/.test(t)?115:0,run:t=>{if(/retrato/.test(t))applyMode('portrait');else if(/noche|nocturna/.test(t))applyMode('night');else if(/documento/.test(t))applyMode('document');else if(/vibrante/.test(t))applyMode('vivid');else applyRecommendations($('smart-apply'));const box=$('brain-response');if(box){box.textContent='Analicé varias recetas y apliqué la mejor opción local.';box.className='brain-response success'}}});window.PhotoBrain.register({name:'smart-pc-router',score:t=>/abraz|pose|cambia.*ropa|vestido|ponme en|playa|paris|disney|agrega.*persona|quita.*persona|reconstru|genera|crea una escena|cambia.*cuerpo|face swap|intercambia.*cara|foto de referencia/.test(t)?110:0,run:(t,raw)=>{queueForPC(raw);const box=$('brain-response');if(box){box.textContent='Esta edición es generativa. La guardé para ejecutarla cuando enciendas el Alienware.';box.className='brain-response info'}}})}
function bindSmartButtons(){const analyzeBtn=$('smart-analyze'),applyBtn=$('smart-apply');if(analyzeBtn)analyzeBtn.onclick=()=>analyze().catch(err=>{console.error(err);setStatus('No se pudo analizar','error');api()?.toast(err.message)});if(applyBtn)applyBtn.onclick=()=>applyRecommendations(applyBtn).catch(err=>{console.error(err);setStatus('Error al aplicar','error');api()?.toast(err.message)});const runMode=(button,event)=>{event?.preventDefault?.();event?.stopPropagation?.();if(button.dataset.running==='1')return;button.dataset.running='1';applyMode(button.dataset.smartMode,button).catch(err=>{console.error(err);setStatus('Error al aplicar','error');api()?.toast(err.message)}).finally(()=>button.dataset.running='0')};document.querySelectorAll('[data-smart-mode]').forEach(button=>{button.disabled=false;button.removeAttribute('disabled');button.style.pointerEvents='auto';button.onclick=e=>runMode(button,e)});const grid=document.querySelector('.smart-mode-grid');if(grid&&!grid.dataset.bound){grid.dataset.bound='1';grid.addEventListener('click',e=>{const b=e.target.closest('[data-smart-mode]');if(b&&typeof b.onclick!=='function')runMode(b,e)})}}
function boot(){renderQueue();bindSmartButtons();$('smart-queue-clear')?.addEventListener('click',()=>saveQueue([]));const input=$('command-input');input?.addEventListener('input',()=>{const text=input.value.trim();$('smart-route-hint').textContent=text?explainRoute(text):'PHOTO IA decidirá si la tarea se hace aquí o se guarda para la PC.'});document.addEventListener('photoia:image-loaded',()=>{lastAnalysis=null;setStatus('Lista para analizar','ready');const el=$('smart-analysis-result');if(el)el.innerHTML='<p>Pulsa <strong>Analizar fotografía</strong> para crear una receta PRO.</p>'});document.addEventListener('photoia:image-cleared',()=>{lastAnalysis=null;$('smart-apply')?.setAttribute('disabled','');setStatus('Esperando foto…','ready')});registerBrain();window.PhotoSmartCore={version:VERSION,analyze,applyRecommendations,applyMode,classify,queueForPC,loadQueue,capabilities,bindSmartButtons};setStatus(api()?.state?.canvas?'Smart Engine 2.0 listo':'Esperando editor…','ready')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
