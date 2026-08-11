(() => {
'use strict';

const VERSION='15.0';

function normalize(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function hasClothingIntent(prompt){
  const t=normalize(prompt);
  return /\b(ropa|camisa|playera|pantalon|pantalones|vestido|traje|chaqueta|chamarra|abrigo|sueter|sudadera|uniforme|zapatos|botas|gorra|sombrero|outfit|wear|shirt|pants|dress|suit|jacket|coat|sweater|uniform|shoes|boots|hat)\b/.test(t);
}
function hasSceneIntent(prompt){
  const t=normalize(prompt);
  return /\b(fondo|paisaje|playa|alaska|nieve|montana|bosque|ciudad|calle|atardecer|amanecer|desierto|campo|oficina|estudio|background|beach|snow|mountain|forest|city|sunset|desert|landscape)\b/.test(t);
}
function matches(mode,prompt){
  if(mode==='change_clothes') return true;
  return hasClothingIntent(prompt) && !hasSceneIntent(prompt);
}
function buildPrompt(userPrompt){
  const clean=String(userPrompt||'').trim();
  return `${clean}

WARDROBE ENGINE:
Replace the entire current outfit requested by the user, not just a patch or one visible section.
The Alienware semantic parser is the only authority for person and wardrobe masks.
Allow the new garment to change its natural silhouette around shoulders, sleeves, waist, hips and hem when needed.
Preserve the person's face, hair, eyewear, hands, visible legs, identity, body proportions, pose, camera angle and original background.
Do not preserve pixels from the old garment merely because they fall inside its former silhouette.
Photorealistic fabric, seams, folds, lighting, shadows and occlusion.`;
}
async function blobFromSource(source){
  if(source instanceof File) return source;
  if(typeof source==='string' && source.startsWith('data:')){
    const [head,b64]=source.split(',');
    const mime=(head.match(/:(.*?);/)||[])[1]||'image/png';
    const bin=atob(b64);
    const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    return new Blob([arr],{type:mime});
  }
  throw new Error('No hay fotografía original para Cambiar ropa.');
}
async function responseToDataUrl(response){
  const type=response.headers.get('content-type')||'';
  if(type.includes('application/json')){
    const j=await response.json();
    let result=j.image||j.dataUrl||j.result||'';
    if(result && !result.startsWith('data:') && !result.startsWith('http')){
      result=`data:image/png;base64,${result}`;
    }
    if(!result) throw new Error('El Alienware no devolvió una imagen.');
    return result;
  }
  const blob=await response.blob();
  return await new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>resolve(fr.result);
    fr.onerror=()=>reject(new Error('No pude leer el resultado del Alienware.'));
    fr.readAsDataURL(blob);
  });
}
function enter(){
  // Clean ownership boundary: local selection tools are not part of wardrobe mode.
  const seg=window.PhotoSegmentation;
  try{seg?.cancel?.()}catch(_){}
  try{seg?.clearMask?.()}catch(_){}
  document.dispatchEvent(new CustomEvent('photoia:wardrobe-engine-enter'));
}
function leave(){
  document.dispatchEvent(new CustomEvent('photoia:wardrobe-engine-leave'));
}
async function run({url,token,source,prompt,reference,signal,onProgress}){
  if(!url) throw new Error('Falta la dirección del Alienware.');
  enter();
  onProgress?.(8,'Preparando cambio de ropa','Enviando la fotografía original al Alienware…');

  const form=new FormData();
  form.append('prompt',buildPrompt(prompt));
  form.append('mode','change_clothes');
  form.append('profile','wardrobe_only');
  form.append('task','wardrobe_only');

  // Server owns segmentation. No client masks are ever attached here.
  form.append('server_semantic_parser','true');
  form.append('client_masks_authoritative','false');
  form.append('allow_wardrobe_change','true');

  form.append('preserve_identity','true');
  form.append('preserve_face','true');
  form.append('preserve_hair','true');
  form.append('preserve_pose','true');
  form.append('adapt_face_lighting','false');

  form.append('image',await blobFromSource(source),'main-original.png');
  if(reference){
    form.append('reference',await blobFromSource(reference),'reference.jpg');
  }

  onProgress?.(16,'Procesando en Alienware','El servidor está localizando persona y vestuario…');

  const response=await fetch(`${String(url).replace(/\/$/,'')}/api/v1/edit`,{
    method:'POST',
    headers:token?{'X-PhotoIA-Token':token}:{},
    body:form,
    signal,
    cache:'no-store'
  });

  if(!response.ok){
    let detail='';
    try{
      const j=await response.json();
      detail=j.detail||j.error||'';
    }catch(_){}
    throw new Error(detail||`Error ${response.status}`);
  }

  onProgress?.(94,'Recibiendo edición','PHOTO IA está recibiendo el resultado final del Alienware…');
  const result=await responseToDataUrl(response);
  return {
    image:result,
    headers:{
      mode:response.headers.get('X-PhotoIA-Edit-Mode')||'',
      identity:response.headers.get('X-PhotoIA-Identity-Protect')||response.headers.get('X-PhotoIA-Identity-Lock')||'',
      coverage:response.headers.get('X-PhotoIA-Wardrobe-Coverage')||response.headers.get('X-PhotoIA-Editable-Coverage')||''
    }
  };
}

window.PhotoWardrobeEngine={
  version:VERSION,
  matches,
  buildPrompt,
  enter,
  leave,
  run
};
})();
