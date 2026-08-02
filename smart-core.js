(() => {
'use strict';
const VERSION='8.4.0-smart-local-core';
const $=id=>document.getElementById(id);
const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const storeKey='photoia-smart-queue-v1';
let lastAnalysis=null;

function api(){return window.PhotoIA}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function loadQueue(){try{return JSON.parse(localStorage.getItem(storeKey)||'[]')}catch{return []}}
function saveQueue(q){localStorage.setItem(storeKey,JSON.stringify(q.slice(-20)));renderQueue()}
function renderQueue(){const el=$('smart-queue-list');if(!el)return;const q=loadQueue();$('smart-queue-count').textContent=String(q.length);el.innerHTML=q.length?q.slice().reverse().map((x,i)=>`<div class="smart-queue-item"><div><strong>${escapeHTML(x.title)}</strong><small>${new Date(x.createdAt).toLocaleString()}</small></div><button data-remove-smart="${q.length-1-i}" type="button">×</button></div>`).join(''):'<p class="smart-empty">No hay tareas pendientes para la PC.</p>';el.querySelectorAll('[data-remove-smart]').forEach(b=>b.onclick=()=>{const next=loadQueue();next.splice(Number(b.dataset.removeSmart),1);saveQueue(next)});}
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function setStatus(text,type='ready'){const b=$('smart-core-badge');if(!b)return;b.textContent=text;b.className=`smart-core-badge ${type}`}
function canvasPixels(max=420){const state=api()?.state;if(!state?.canvas||!state.photo)throw new Error('Abre una foto primero.');const dataUrl=api().exportDataUrl();return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const ratio=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*ratio));c.height=Math.max(1,Math.round(img.height*ratio));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);resolve({data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height})};img.onerror=reject;img.src=dataUrl;});}
async function analyze(){
 setStatus('Analizando…','working');
 const {data,width,height}=await canvasPixels();let lum=0,lum2=0,sat=0,r=0,g=0,b=0,edges=0,count=0;const gray=new Float32Array(width*height);
 for(let i=0,p=0;i<data.length;i+=4,p++){const R=data[i],G=data[i+1],B=data[i+2];const L=.2126*R+.7152*G+.0722*B;gray[p]=L;lum+=L;lum2+=L*L;r+=R;g+=G;b+=B;const mx=Math.max(R,G,B),mn=Math.min(R,G,B);sat+=mx?((mx-mn)/mx):0;count++;}
 for(let y=1;y<height-1;y+=2)for(let x=1;x<width-1;x+=2){const p=y*width+x;edges+=Math.abs(gray[p+1]-gray[p-1])+Math.abs(gray[p+width]-gray[p-width]);}
 const mean=lum/count;const contrast=Math.sqrt(Math.max(0,lum2/count-mean*mean));const saturation=sat/count;const warmth=((r-b)/count);const sharpness=edges/((width-2)*(height-2)/4);
 const rec={brightness:mean<92?18:mean>178?-12:0,contrast:contrast<42?16:contrast>78?-6:0,saturation:saturation<.18?18:saturation>.58?-10:0,temperature:warmth<-15?12:warmth>28?-8:0,sharpness:sharpness<42?18:sharpness>90?0:8};
 const detections=Number(document.querySelector('#vision-count')?.textContent?.match(/\d+/)?.[0]||0);
 lastAnalysis={mean,contrast,saturation,warmth,sharpness,recommendation:rec,detections,width,height,at:Date.now()};
 renderAnalysis(lastAnalysis);setStatus('Análisis listo','ready');return lastAnalysis;
}
function scoreLabel(v,low,high,labels){return v<low?labels[0]:v>high?labels[2]:labels[1]}
function renderAnalysis(a){const el=$('smart-analysis-result');if(!el)return;const items=[['Luz',scoreLabel(a.mean,92,178,['Baja','Equilibrada','Alta'])],['Contraste',scoreLabel(a.contrast,42,78,['Suave','Equilibrado','Fuerte'])],['Color',scoreLabel(a.saturation,.18,.58,['Apagado','Natural','Intenso'])],['Temperatura',a.warmth<-15?'Fría':a.warmth>28?'Cálida':'Neutral'],['Detalle',scoreLabel(a.sharpness,42,90,['Suave','Bueno','Muy marcado'])]];el.innerHTML=`<div class="smart-metrics">${items.map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('')}</div><p>${advice(a)}</p>`;$('smart-apply').disabled=false;}
function advice(a){const r=a.recommendation;const changes=[];if(r.brightness)changes.push(r.brightness>0?'aclarar':'bajar la luz');if(r.contrast)changes.push('equilibrar contraste');if(r.saturation)changes.push(r.saturation>0?'recuperar color':'reducir color');if(r.temperature)changes.push(r.temperature>0?'calentar tonos':'enfriar tonos');if(r.sharpness)changes.push('mejorar detalle');return changes.length?`Recomiendo ${changes.join(', ')}. El ajuste se calcula para esta foto, no es un filtro fijo.`:'La foto ya está equilibrada. Solo aplicaría una mejora ligera de detalle.'}
async function applyRecommendations(){const a=lastAnalysis||await analyze();const rec=a.recommendation;for(const [id,value] of Object.entries(rec)){const el=$(id);if(!el||!value)continue;el.value=clamp(value,Number(el.min||-100),Number(el.max||100));api().applySlider(id,el.value,false);}api().snapshot();api().toast('Mejora inteligente aplicada');setStatus('Mejora aplicada','ready');}
function classify(raw){const t=normalize(raw);const complex=/abraz|pose|cambia.*ropa|vestido|traje realista|ponme en|playa|paris|disney|agrega.*persona|quita.*persona|elimina.*objeto grande|reconstru|genera|crea una escena|cambia.*cuerpo|face swap|intercambia.*cara|foto de referencia/.test(t);const local=/brillo|contraste|color|satur|nitidez|desenfoc|recort|gira|espejo|texto|sticker|circulo|cuadrado|rectangulo|flecha|linea|fondo|mascara|separa.*persona|quita.*fondo|profesional|retrato|blanco y negro/.test(t);return complex?'pc':local?'phone':'unknown';}
function queueForPC(raw){const q=loadQueue();q.push({id:crypto.randomUUID?.()||String(Date.now()),title:raw.trim().slice(0,120),prompt:raw.trim(),createdAt:Date.now(),status:'waiting'});saveQueue(q);const prompt=$('ai-prompt');if(prompt&&!prompt.value)prompt.value=raw.trim();api().toast('Tarea guardada para cuando enciendas el Alienware');setStatus('Guardada para PC','queued');return true;}
function routeComplex(raw){return queueForPC(raw)}
function explainRoute(raw){const kind=classify(raw);if(kind==='phone')return 'Esta edición se puede hacer en el teléfono.';if(kind==='pc')return 'Esta edición necesita generar contenido nuevo; la guardaré para el Alienware.';return 'Primero intentaré resolverla en el teléfono. Si requiere generación, te lo indicaré.';}
function boot(){
 renderQueue();
 $('smart-analyze')?.addEventListener('click',()=>analyze().catch(e=>{console.error(e);setStatus('No se pudo analizar','error');api().toast(e.message)}));
 $('smart-apply')?.addEventListener('click',()=>applyRecommendations().catch(e=>api().toast(e.message)));
 $('smart-queue-clear')?.addEventListener('click',()=>saveQueue([]));
 const input=$('command-input');input?.addEventListener('input',()=>{const text=input.value.trim();$('smart-route-hint').textContent=text?explainRoute(text):'PHOTO IA decidirá si la tarea se hace aquí o se guarda para la PC.';});
 const tryRegister=()=>{if(!window.PhotoBrain?.register)return setTimeout(tryRegister,120);window.PhotoBrain.register({name:'smart-pc-router',score:(t)=>/abraz|pose|cambia.*ropa|vestido|ponme en|playa|paris|disney|agrega.*persona|quita.*persona|reconstru|genera|crea una escena|cambia.*cuerpo|face swap|intercambia.*cara|foto de referencia/.test(t)?110:0,run:(t,raw)=>{queueForPC(raw);const box=$('brain-response');if(box){box.textContent='Esta edición es generativa. La guardé para ejecutarla cuando enciendas el Alienware.';box.className='brain-response info';}}});};tryRegister();
 window.PhotoSmartCore={version:VERSION,analyze,applyRecommendations,classify,queueForPC,routeComplex,loadQueue};setStatus('Núcleo local listo','ready');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
