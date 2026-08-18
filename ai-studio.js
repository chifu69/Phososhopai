(() => {
'use strict';
const $=id=>document.getElementById(id);
const STORE='photoia-ai-studio-v4';
const ENGINE_VERSION='15.21';
const SAME_ORIGIN=((location.protocol==='https:'&&location.port==='8443')||(location.protocol==='http:'&&location.port==='8189'))?location.origin:'';
const TAILSCALE_URL='https://100.79.114.52:8443';
const state={main:null,reference:null,controller:null,history:[],settings:{url:SAME_ORIGIN,token:'PHOTOIA-LOCAL-2026'},activeUrl:'',online:false,activeUrl:'',activeRouteKind:'',mode:'image_edit'};
function app(){return window.PhotoIA}
function toast(m){app()?.toast?.(m)}
function read(){
 try{
  const x=JSON.parse(localStorage.getItem(STORE)||'{}');
  state.settings={...state.settings,...(x.settings||{})};
  // Los resultados contienen imágenes grandes. Se mantienen solo en memoria
  // para no llenar el almacenamiento limitado de Safari/iPhone.
  state.history=[];
  if(Array.isArray(x.history)&&x.history.length){
   try{localStorage.removeItem(STORE)}catch(_){}
   safeSaveSettings();
  }
 }catch(_){
  state.history=[];
 }
}
function safeSaveSettings(){
 try{
  // Elimina primero versiones antiguas que podían guardar imágenes Base64.
  localStorage.removeItem(STORE);
  localStorage.setItem(STORE,JSON.stringify({settings:state.settings}));
  return true;
 }catch(err){
  console.warn('[PHOTO IA] No se pudo guardar la configuración local:',err);
  return false;
 }
}
function save(){return safeSaveSettings()}
function setBadge(mode,text){const el=$('ai-server-badge');el.className=`ai-server-badge ${mode}`;el.innerHTML=`<i></i>${text}`;state.online=mode==='online'}
function setStatus(mode,title,detail,pct=0){const box=$('ai-job-status');box.className=`ai-job-status ${mode}`;box.querySelector('strong').textContent=title;box.querySelector('small').textContent=detail;$('ai-progress-text').textContent=`${Math.round(pct)}%`;$('ai-progress-bar').style.width=`${Math.max(0,Math.min(100,pct))}%`}
function dataUrlToBlob(data){const [head,b64]=data.split(',');const mime=(head.match(/:(.*?);/)||[])[1]||'image/jpeg';const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}
function preview(id,source,emptyIcon,emptyText){const box=$(id);box.innerHTML='';if(source){const img=document.createElement('img');img.src=source instanceof File?URL.createObjectURL(source):source;box.appendChild(img)}else box.innerHTML=`<b>${emptyIcon}</b><small>${emptyText}</small>`}
function canvasImage(){try{return app()?.exportDataUrl?.()||''}catch{return ''}}
function useCanvas(silent=false){const d=canvasImage();if(!d){if(!silent)toast('Abre una foto primero.');return false;}state.main=d;if(!silent)toast('Foto del lienzo preparada');return true}
function chooseFile(input,key,previewId){const f=input.files?.[0];if(!f)return;state[key]=f;preview(previewId,f,key==='main'?'📷':'＋',key==='main'?'Foto principal':'Referencia');if(key==='reference')$('ai-clear-reference').disabled=false}
function renderHistory(){const wrap=$('ai-history');wrap.innerHTML='';if(!state.history.length){wrap.innerHTML='<p class="layers-empty">Todavía no hay resultados del Estudio IA.</p>';return}state.history.forEach((item,i)=>{const d=document.createElement('div');d.className='ai-history-item';d.innerHTML=`<img alt="Resultado IA ${i+1}" src="${item.image}"><button type="button">Usar resultado</button>`;d.querySelector('button').onclick=async()=>{await app()?.setMainImage?.(item.image,'Resultado Estudio IA');toast('Resultado colocado en el lienzo')};wrap.appendChild(d)})}
function connectionCandidates(){
 const primary=$('ai-server-url')?.value?.trim().replace(/\/$/,'')||state.settings.url||'';
 const list=[primary,TAILSCALE_URL].filter(Boolean);
 return [...new Set(list)];
}
async function probeServer(raw,timeoutMs=10000){
 const c=new AbortController();const timer=setTimeout(()=>c.abort(),timeoutMs);
 try{
  const r=await fetch(`${raw}/health`,{headers:state.settings.token?{'X-PhotoIA-Token':state.settings.token}:{},signal:c.signal,cache:'no-store'});
  let info={};try{info=await r.json()}catch{}
  if(!r.ok){const detail=info.detail||info.error||'';if(r.status===401)throw new Error(detail||'Token incorrecto');throw new Error(detail||`HTTP ${r.status}`)}
  return info;
 }finally{clearTimeout(timer)}
}
async function testConnection(){
 const router=window.PhotoConnectionRouter;
 if(!router){toast('Connection Router no está cargado.');return false}
 saveSettings();
 const btn=$('ai-test');
 if(btn)btn.disabled=true;
 setStatus('processing','Buscando Alienware','Probando red local…',6);
 try{
  const route=await router.resolve({
   primary:state.settings.url,
   token:state.settings.token,
   onTry:(c)=>{
    setStatus('processing','Buscando Alienware',c.kind==='tailscale'?'Probando Tailscale…':'Probando red local…',c.kind==='tailscale'?12:7);
   }
  });
  if(!route.ok){
   state.online=false;
   setStatus('error','Alienware no disponible','No respondió por red local ni por Tailscale.',0);
   toast('No se pudo conectar');
   return false;
  }
  state.online=true;
  state.activeUrl=route.url;
  state.activeRouteKind=route.kind;
  setStatus('done','Conectado',`Conectado por ${route.label}.`,100);
  toast(`Conectado por ${route.label}`);
  return true;
 }finally{
  if(btn)btn.disabled=false;
 }
}
function saveSettings(){
 state.settings.url=$('ai-server-url').value.trim().replace(/\/$/,'');
 state.settings.token=$('ai-server-token').value.trim();
 const stored=save();
 toast(stored?'Conexión guardada':'Conexión lista; Safari no permitió guardarla permanentemente');
}
async function sourceBlob(source){if(source instanceof File)return source;if(typeof source==='string'&&source.startsWith('data:'))return dataUrlToBlob(source);throw new Error('No hay fotografía principal.')}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No pude abrir una de las imágenes.'));img.src=src;});}
function smoothstep01(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)}
async function buildIdentityProtection(faceMask,skinMask){
 const items=[faceMask,skinMask].filter(Boolean);
 if(!items.length)return '';
 const imgs=await Promise.all(items.map(loadImage));
 const w=imgs[0].naturalWidth||imgs[0].width,h=imgs[0].naturalHeight||imgs[0].height;
 const out=document.createElement('canvas');out.width=w;out.height=h;
 const ctx=out.getContext('2d',{willReadFrequently:true});
 ctx.clearRect(0,0,w,h);
 // Union of exact face + skin masks.
 for(const img of imgs){ctx.globalCompositeOperation='source-over';ctx.drawImage(img,0,0,w,h)}
 // Infer a protected head/hair region from the face mask bounds. This mirrors
 // Photoshop-style object bounds: the generator may see the whole photo, but
 // identity pixels are treated as a separate locked region.
 if(faceMask){
  const fc=document.createElement('canvas');fc.width=w;fc.height=h;const fctx=fc.getContext('2d',{willReadFrequently:true});
  const fimg=imgs[0];fctx.drawImage(fimg,0,0,w,h);const d=fctx.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=d[(y*w+x)*4+3];if(a>55){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}}
  if(maxX>=minX&&maxY>=minY){
   const fw=Math.max(1,maxX-minX+1),fh=Math.max(1,maxY-minY+1);
   const cx=(minX+maxX)/2,cy=(minY+maxY)/2-fh*.22;
   ctx.save();ctx.globalCompositeOperation='source-over';
   const grad=ctx.createRadialGradient(cx,cy,Math.min(fw,fh)*.42,cx,cy,Math.max(fw*1.08,fh*1.16));
   grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(.72,'rgba(255,255,255,.98)');grad.addColorStop(1,'rgba(255,255,255,0)');
   ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(cx,cy,fw*1.05,fh*1.30,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
 }
 return out.toDataURL('image/png');
}
async function compositeGeneratedInsideMask(generated,original,maskDataUrl){
 const [gen,src,mask]=await Promise.all([loadImage(generated),loadImage(original),loadImage(maskDataUrl)]);
 const w=gen.naturalWidth||gen.width,h=gen.naturalHeight||gen.height;
 const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(src,0,0,w,h);
 const mc=document.createElement('canvas');mc.width=w;mc.height=h;const mctx=mc.getContext('2d',{willReadFrequently:true});mctx.drawImage(mask,0,0,w,h);
 const md=mctx.getImageData(0,0,w,h).data;
 const gc=document.createElement('canvas');gc.width=w;gc.height=h;const gctx=gc.getContext('2d',{willReadFrequently:true});gctx.drawImage(gen,0,0,w,h);
 const gd=gctx.getImageData(0,0,w,h),sd=ctx.getImageData(0,0,w,h);
 for(let i=0;i<gd.data.length;i+=4){let a=smoothstep01(md[i+3]/255);if(a>.86)a=1;for(let c=0;c<3;c++)sd.data[i+c]=Math.round(sd.data[i+c]*(1-a)+gd.data[i+c]*a);sd.data[i+3]=255}
 ctx.putImageData(sd,0,0);return out.toDataURL('image/png');
}
function normalizedText(value){
 return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function classifyEdit(prompt){
 const t=normalizedText(prompt);
 if(state.mode==='portrait_id')return 'portrait_id';
 const clothing=/\b(ropa|camisa|playera|pantalon|vestido|traje|chaqueta|chamarra|abrigo|sueter|sudadera|uniforme|zapatos|botas|gorra|sombrero|ponme|visteme|cambia.*ropa|wear|shirt|pants|dress|jacket|coat|sweater|outfit|uniform|shoes|boots|hat)\b/.test(t);
 const scene=/\b(fondo|paisaje|playa|alaska|nieve|montana|bosque|ciudad|calle|atardecer|amanecer|desierto|campo|oficina|estudio|background|beach|snow|mountain|forest|city|sunset|desert|landscape)\b/.test(t)||state.mode==='replace_background';
 if(scene&&clothing)return 'scene_and_wardrobe';
 if(scene)return 'background_only';
 if(clothing)return 'wardrobe_only';
 return 'general_edit';
}
function maskStats(maskPixels,sourcePixels,generatedPixels){
 let sr=0,sg=0,sb=0,gr=0,gg=0,gb=0,n=0;
 for(let i=0;i<maskPixels.length;i+=4){
  const a=maskPixels[i+3]/255;
  if(a<.12)continue;
  sr+=sourcePixels[i]*a;sg+=sourcePixels[i+1]*a;sb+=sourcePixels[i+2]*a;
  gr+=generatedPixels[i]*a;gg+=generatedPixels[i+1]*a;gb+=generatedPixels[i+2]*a;
  n+=a;
 }
 if(!n)return null;
 return {source:[sr/n,sg/n,sb/n],generated:[gr/n,gg/n,gb/n]};
}
async function compositeLockedRegion(generated,original,maskDataUrl,{lightingStrength=.30}={}){
 const [bg,src,mask]=await Promise.all([loadImage(generated),loadImage(original),loadImage(maskDataUrl)]);
 const w=bg.naturalWidth||bg.width,h=bg.naturalHeight||bg.height;
 const out=document.createElement('canvas');out.width=w;out.height=h;
 const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(bg,0,0,w,h);
 const srcCanvas=document.createElement('canvas');srcCanvas.width=w;srcCanvas.height=h;
 const sctx=srcCanvas.getContext('2d',{willReadFrequently:true});sctx.drawImage(src,0,0,w,h);
 const maskCanvas=document.createElement('canvas');maskCanvas.width=w;maskCanvas.height=h;
 const mctx=maskCanvas.getContext('2d',{willReadFrequently:true});mctx.drawImage(mask,0,0,w,h);

 const generatedPixels=ctx.getImageData(0,0,w,h);
 const sourcePixels=sctx.getImageData(0,0,w,h);
 const maskPixels=mctx.getImageData(0,0,w,h);
 const stats=maskStats(maskPixels.data,sourcePixels.data,generatedPixels.data);

 let gain=[1,1,1],offset=[0,0,0];
 if(stats){
  for(let c=0;c<3;c++){
   const s=Math.max(18,stats.source[c]),g=stats.generated[c];
   const rawGain=Math.max(.72,Math.min(1.28,g/s));
   gain[c]=1+(rawGain-1)*lightingStrength;
   offset[c]=Math.max(-18,Math.min(18,(g-s)*lightingStrength*.45));
  }
 }
 const outData=generatedPixels.data,srcData=sourcePixels.data,maskData=maskPixels.data;
 for(let i=0;i<outData.length;i+=4){
  let a=smoothstep01(maskData[i+3]/255);
  if(a<=0)continue;
  if(a>.82)a=1;
  for(let c=0;c<3;c++){
   const adjusted=Math.max(0,Math.min(255,srcData[i+c]*gain[c]+offset[c]));
   outData[i+c]=Math.round(outData[i+c]*(1-a)+adjusted*a);
  }
  outData[i+3]=255;
 }
 ctx.putImageData(generatedPixels,0,0);
 return out.toDataURL('image/png');
}
async function prepareTask(prompt){
 const task=classifyEdit(prompt);
 const segmentation=window.PhotoSegmentation;
 const originalSource=state.main;
 let source=state.main,personMask='',identityMask='',faceMask='',skinMask='',clothingMask='';

 // Wardrobe-only edits are handled exclusively by Wardrobe Engine 15.0.
 if(task==='wardrobe_only')throw new Error('Wardrobe Engine no tomó control de la tarea.');
 // Portrait/ID deliberately uses the FULL original image as context.
 // No client-side bust mask is generated or attached.
 if(task==='portrait_id'){
  try{segmentation?.clearMask?.()}catch(_){}
  source=originalSource;
 }
 if(task==='background_only'||task==='scene_and_wardrobe'){
  setStatus('processing','Semantic Face & Skin Engine','Separando persona y construyendo mapa semántico…',6);
  await segmentation?.segmentPerson?.();
  personMask=segmentation?.exportMaskDataUrl?.()||'';
  source=segmentation?.exportSourceDataUrl?.()||state.main;
  if(!personMask)throw new Error('No pude separar a la persona. Usa Selección IA y vuelve a intentarlo.');

  if(task==='scene_and_wardrobe'){
   await segmentation?.segmentFace?.();
   faceMask=segmentation?.exportMaskDataUrl?.()||'';
   setStatus('processing','Semantic Face & Skin Engine','Detectando identidad para el cambio de escenario…',9);
   try{await segmentation?.segmentSkin?.();skinMask=segmentation?.exportMaskDataUrl?.()||'';}catch(_){skinMask=''}
   identityMask=await buildIdentityProtection(faceMask,skinMask);
   if(!identityMask)identityMask=faceMask;
  }
 }

 let directed=prompt;
 if(task==='portrait_id'){
  directed=`${prompt || 'Mejora este retrato para una fotografía de identificación natural y profesional.'}

PORTRAIT / ID EDIT MODE — FULL IMAGE CONTEXT:
Usa la fotografía ORIGINAL COMPLETA como referencia principal. No recortes ni regeneres a la persona desde cero.

FOCUS:
- rostro, cabeza, cuello y hombros
- exposición y balance de blancos naturales
- tono de piel realista
- detalle moderado y textura fotográfica real

PRESERVE EXACTLY:
- identidad y geometría facial
- edad aparente, expresión y cabello
- proporciones del cuerpo y pose
- ropa y accesorios
- fondo, perspectiva, encuadre y composición

DO NOT:
- cambiar la cara o embellecerla artificialmente
- remodelar cuerpo, cuello u hombros
- cambiar ropa o fondo
- inventar rasgos, cabello, manos u objetos
- suavizar la piel en exceso
- sobresaturar, sobreenfocar o crear apariencia de imagen generada

EDIT STRENGTH: LOW. Resultado fotorealista, natural y lo más cercano posible a la fotografía original.`;
 }else if(task==='background_only'){
  directed=`${prompt}\n\nIDENTITY LOCK — CAMBIO DE FONDO:\nCambia únicamente el ambiente y el fondo. Conserva exactamente la misma persona, rostro, cabello, expresión, cuerpo, pose, manos y ropa. No reconstruyas ni embellezcas la cara. Ajusta de forma realista la dirección de la luz, temperatura de color, sombras y reflejos para integrar a la persona con el nuevo paisaje.`;

 }else if(task==='scene_and_wardrobe'){
  directed=`${prompt}\n\nSEMANTIC IDENTITY GUARD — ESCENARIO Y VESTUARIO:\nConserva la identidad, edad y rasgos faciales de la persona. Puedes cambiar el paisaje y adaptar la ropa de manera lógica al ambiente solicitado. Ajusta iluminación, temperatura de color, sombras y reflejos de forma natural.`;
 }else{
  directed=`${prompt}\n\nIDENTITY LOCK:\nPreserva exactamente el rostro, identidad, cabello, edad y expresión salvo que el usuario pida explícitamente editar el rostro. Realiza únicamente el cambio solicitado.`;
 }
 return {prompt:directed,task,source,originalSource,personMask,identityMask,faceMask,skinMask,clothingMask,editIntent:task==='portrait_id'?'portrait_id':''};
}

async function generateWardrobe(prompt){
 const engine=window.PhotoWardrobeEngine;
 if(!engine)throw new Error('Wardrobe Engine 15.0 no está cargado.');
 useCanvas(true);
 if(!state.main)throw new Error('Abre una foto primero.');

 state.controller=new AbortController();
 $('ai-generate').disabled=true;
 $('ai-cancel-job').hidden=false;

 let progressTimer=null;
 try{
  engine.enter();
  // Refresh from the visible canvas after removing any old selection overlay.
  useCanvas(true);
  const original=state.main;

  let displayed=16;
  progressTimer=setInterval(()=>{
   if(displayed<88){
    displayed=Math.min(88,displayed+Math.max(1,Math.random()*4));
    setStatus('processing','Procesando en Alienware','FLUX.2 Klein está creando el vestuario…',displayed);
   }
  },1200);

  const out=await engine.run({
   url:state.activeUrl||state.settings.url,
   token:state.settings.token,
   source:original,
   prompt,
   reference:state.reference,
   signal:state.controller.signal,
   onProgress:(pct,title,detail)=>setStatus('processing',title,detail,pct)
  });

  if(progressTimer){clearInterval(progressTimer);progressTimer=null}
  setStatus('done','Edición terminada','El Alienware procesó el cambio de ropa sin máscaras locales del iPhone.',100);
  state.history.unshift({image:out.image,prompt,date:Date.now(),task:'wardrobe_only'});
  state.history=state.history.slice(0,8);
  save();renderHistory();
  await app()?.setMainImage?.(out.image,'Resultado Estudio IA');
  toast('Cambio de ropa recibido del Alienware');
 }catch(e){
  if(progressTimer){clearInterval(progressTimer);progressTimer=null}
  if(e?.name==='AbortError')setStatus('error','Tarea cancelada','No se aplicaron cambios.',0);
  else{
   setStatus('error','No se pudo completar',e?.message||'Error desconocido.',0);
   toast(e?.message||'Error del servidor');
  }
 }finally{
  try{engine?.leave?.()}catch(_){}
  $('ai-generate').disabled=false;
  $('ai-cancel-job').hidden=true;
  state.controller=null;
 }
}

async function generate(){const prompt=$('ai-prompt').value.trim();if(!prompt)return toast('Escribe qué quieres hacer.');useCanvas(true);if(!state.main)return toast('Agrega una fotografía principal.');saveSettings();if(!state.settings.url){setStatus('error','Tarea preparada','Guarda la dirección del Alienware cuando estés en casa.',0);return toast('La tarea está lista, pero falta configurar el servidor.')}if(!state.online){await testConnection();if(!state.online){setStatus('error','Alienware no disponible','Enciende la PC y el servidor para enviar esta tarea.',0);return}}
 if(window.PhotoWardrobeEngine?.matches?.(state.mode,prompt)){await generateWardrobe(prompt);return}
 state.controller=new AbortController();$('ai-generate').disabled=true;$('ai-cancel-job').hidden=false;setStatus('processing','Enviando fotografías','Preparando la tarea para FLUX.2 Klein…',12);
 try{const task=await prepareTask(prompt);const form=new FormData();form.append('prompt',task.prompt);form.append('mode',state.reference&&state.mode==='image_edit'?'multi_reference_edit':state.mode||'image_edit');form.append('profile','smart_edit');form.append('task',task.task==='portrait_id'?'general_edit':task.task);form.append('edit_intent',task.editIntent||task.task);form.append('preserve_identity','true');form.append('preserve_face','true');form.append('preserve_hair','true');form.append('preserve_pose','true');form.append('preserve_body',String(task.task==='portrait_id'));form.append('preserve_clothing',String(task.task==='portrait_id'));form.append('preserve_background',String(task.task==='portrait_id'));form.append('focus_region',task.task==='portrait_id'?'face_head_neck_shoulders':'');form.append('edit_strength',task.task==='portrait_id'?'low':'auto');form.append('server_semantic_parser',String(task.task==='wardrobe_only'));form.append('client_masks_authoritative',String(task.task!=='wardrobe_only'&&task.task!=='portrait_id'));form.append('allow_wardrobe_change',String(task.task==='wardrobe_only'||task.task==='scene_and_wardrobe'));form.append('adapt_face_lighting','true');form.append('image',await sourceBlob(task.source),'main.png');if(task.personMask)form.append('mask',await sourceBlob(task.personMask),'person-mask.png');if(task.identityMask)form.append('identity_mask',await sourceBlob(task.identityMask),'identity-mask.png');if(state.reference)form.append('reference',await sourceBlob(state.reference),'reference.jpg');
 const progress=setInterval(()=>{const current=parseInt($('ai-progress-text').textContent)||12;if(current<88)setStatus('processing','Procesando en Alienware','FLUX.2 Klein está creando la edición…',current+Math.random()*5)},1200);
 const targetUrl=state.activeUrl||state.settings.url;
 const r=await fetch(`${targetUrl}/api/v1/edit`,{method:'POST',headers:state.settings.token?{'X-PhotoIA-Token':state.settings.token}:{},body:form,signal:state.controller.signal});clearInterval(progress);if(!r.ok){let msg='';try{msg=(await r.json()).error||''}catch{}throw new Error(msg||`Error ${r.status}`)}
 const type=r.headers.get('content-type')||'';let result;if(type.includes('application/json')){const j=await r.json();result=j.image||j.dataUrl||j.result;if(result&&!result.startsWith('data:')&&!result.startsWith('http'))result=`data:image/png;base64,${result}`}else{const blob=await r.blob();result=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=no;fr.readAsDataURL(blob)})}
 if(!result)throw new Error('El servidor no devolvió una imagen.');
 if(task.task==='background_only'&&task.personMask){
  setStatus('processing','Semantic Face & Skin Engine','Recomponiendo la persona desde los píxeles originales…',94);
  result=await compositeLockedRegion(result,task.originalSource,task.personMask,{lightingStrength:.24});

 }else if(task.task==='scene_and_wardrobe'&&task.identityMask){
  setStatus('processing','Semantic Face & Skin Engine','Restaurando rostro, cabello y piel desde el original…',94);
  result=await compositeLockedRegion(result,task.originalSource,task.identityMask,{lightingStrength:.28});
 }
 const doneDetail=task.task==='portrait_id'?'Retrato/ID mejorado usando la fotografía completa; identidad, ropa y fondo protegidos.':task.task==='background_only'?'Fondo cambiado; la persona original fue preservada.':task.task==='wardrobe_only'?'Cambio de ropa procesado en el Alienware sobre la fotografía original.':task.task==='scene_and_wardrobe'?'Escenario y ropa adaptados; identidad protegida con recomposición por capas.':'El resultado se colocó en el lienzo.';
 setStatus('done','Edición terminada',doneDetail,100);state.history.unshift({image:result,prompt,date:Date.now(),task:task.task});state.history=state.history.slice(0,8);save();renderHistory();await app()?.setMainImage?.(result,'Resultado Estudio IA');toast('Edición recibida del Alienware')
 }catch(e){if(e.name==='AbortError')setStatus('error','Tarea cancelada','No se aplicaron cambios.',0);else{setStatus('error','No se pudo completar',e.message||'Error desconocido.',0);toast(e.message||'Error del servidor')}}finally{$('ai-generate').disabled=false;$('ai-cancel-job').hidden=true;state.controller=null}}
function enterPortraitIdMode(){
 useCanvas(true);
 if(!state.main){toast('Abre una foto primero.');return false}
 try{window.PhotoSegmentation?.clearMask?.()}catch(_){}
 state.mode='portrait_id';
 document.querySelectorAll('[data-ai-action]').forEach(x=>x.classList.remove('active'));
 const prompt=$('ai-prompt');
 if(prompt){
  prompt.value='Mejora este retrato de forma natural para identificación. Conserva exactamente la identidad, rostro, cabello, cuerpo, pose, ropa, fondo y composición. Corrige solo luz, balance de blancos, tono de piel, ruido y detalle moderado. No regeneres a la persona ni cambies sus rasgos.';
 }
 setStatus('ready','Modo Retrato / ID','Foto completa preparada. Sin máscara de busto; identidad y composición protegidas.',0);
 toast('Modo Retrato / ID: se usará la foto completa, sin máscara azul.');
 return true;
}
window.PhotoAIStudio={version:ENGINE_VERSION,enterPortraitIdMode,get mode(){return state.mode}};
function init(){read();$('ai-server-url').value=state.settings.url;$('ai-server-token').value=state.settings.token;renderHistory();
 $('ai-choose-reference').onclick=()=>$('ai-reference-file').click();$('ai-reference-file').onchange=e=>chooseFile(e.target,'reference','ai-reference-preview');$('ai-clear-reference').onclick=()=>{state.reference=null;$('ai-reference-file').value='';preview('ai-reference-preview',null,'＋','Persona, ropa o estilo');$('ai-clear-reference').disabled=true};
 document.querySelectorAll('[data-ai-action]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-ai-action]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.mode=b.dataset.aiMode||'image_edit';if(state.mode==='change_clothes'){try{window.PhotoWardrobeEngine?.enter?.()}catch(_){}}$('ai-prompt').value=b.dataset.aiAction;$('ai-prompt').focus();toast(`Modo inteligente: ${b.textContent.trim()}`)});
 $('ai-save-settings').onclick=saveSettings;$('ai-test-server').onclick=async()=>{saveSettings();await testConnection()};$('ai-generate').onclick=generate;$('ai-cancel-job').onclick=async()=>{state.controller?.abort();try{if(state.activeUrl||state.settings.url)await fetch(`${state.activeUrl||state.settings.url}/api/v1/interrupt`,{method:'POST',headers:state.settings.token?{'X-PhotoIA-Token':state.settings.token}:{}})}catch{}};$('ai-clear-history').onclick=()=>{state.history=[];save();renderHistory();toast('Historial del Estudio IA limpiado')};
 window.addEventListener('photoia-ready',()=>{if(app()?.state?.photo)useCanvas(true)},{once:true});document.addEventListener('photoia:image-loaded',()=>useCanvas(true));document.addEventListener('photoia:image-cleared',()=>{state.main=null;state.reference=null;$('ai-reference-file').value='';preview('ai-reference-preview',null,'＋','Persona, ropa o estilo');$('ai-clear-reference').disabled=true});if(state.settings.url)testConnection();}
document.addEventListener('DOMContentLoaded',init);
})();
