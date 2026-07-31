'use strict';
const $=id=>document.getElementById(id), canvas=$('editor-canvas'), ctx=canvas.getContext('2d',{willReadFrequently:true});
let sourceImage=null,rotation=0,flipX=false,squareCrop=false,compareDown=false,history=[],historyIndex=-1,renderTimer=0;
const sliders=['brightness','contrast','saturation','temperature','sharpness','blur'];
const controls=[...document.querySelectorAll('button[data-preset],button[data-command],button[data-studio],.slider-list input,#rotate-left,#rotate-right,#flip-x,#crop-square,#reset-btn,#compare-btn,#download-btn,#command-input,#command-btn')];
const studioData={
 magic:{title:'One Click Magic',desc:'Analiza la foto con reglas locales y aplica una mejora equilibrada.',options:[['✨','Mejora profesional','Color, contraste y nitidez','local','auto'],['🙂','Retrato natural','Tonos más suaves','local','portrait'],['🌈','Color vibrante','Más fuerza sin exagerar','local','vivid']]},
 outfit:{title:'Outfit Studio',desc:'Arquitectura preparada para cambiar ropa conservando pose, cuerpo y rostro.',options:[['👔','Traje elegante','Negro, azul o gris','IA'],['🧥','Chaqueta','Cuero, denim o casual','IA'],['🏭','Uniforme industrial','Casco, chaleco y uniforme','IA'],['🦸','Disfraces y personajes','Para ediciones divertidas','IA']]},
 hair:{title:'Hair Studio',desc:'Peinados, color, barba y cambios de apariencia.',options:[['💇','Cambiar peinado','Corto, largo, rizado o liso','IA'],['🎨','Cambiar color','Rubio, negro, rojo o fantasía','IA'],['🧔','Barba y bigote','Agregar, quitar o cambiar estilo','IA'],['✨','Reflejos','Mechas y tonos selectivos','IA']]},
 face:{title:'Face Studio',desc:'Retoques y transformaciones faciales para uso personal y creativo.',options:[['😁','Sonrisa','Cambiar expresión','IA'],['🕰️','Edad','Rejuvenecer o envejecer','IA'],['💄','Retoque natural','Piel, ojos y dientes','IA'],['👓','Accesorios','Lentes, sombreros y joyería','IA']]},
 swap:{title:'Fun Swap',desc:'Intercambia caras o cuerpos entre personas de una fotografía.',options:[['🔄','Face Swap','Intercambiar rostros','IA'],['🕺','Body Swap','Intercambiar cuerpos','IA'],['🎭','Cambio de cabeza','Colocar una cabeza en otro cuerpo','IA'],['🎲','Surprise Me','Una transformación al azar','IA']]},
 background:{title:'Background Studio',desc:'Herramientas para modificar el fondo.',options:[['🫥','Quitar fondo','Crear transparencia','IA'],['🌫️','Desenfocar todo','Desenfoque local rápido','local','blur'],['🌅','Cambiar escenario','Playa, ciudad o estudio','IA'],['🎨','Color sólido','Fondo limpio de estudio','IA']]},
 design:{title:'Text & Design',desc:'Herramientas visuales sin necesidad de experiencia.',options:[['🔤','Agregar texto','Próximo módulo local','next'],['😊','Stickers','Próximo módulo local','next'],['✏️','Dibujar','Próximo módulo local','next'],['🖼️','Marco','Próximo módulo local','next']]},
 repair:{title:'Magic Repair',desc:'Limpieza, restauración y borrado inteligente.',options:[['🧽','Borrar objeto','Relleno inteligente','IA'],['🩹','Healing Brush','Reparar pequeñas áreas','next'],['🕰️','Restaurar foto vieja','Ruido, contraste y daños','IA'],['🔍','Aumentar resolución','Upscale inteligente','IA']]}
};
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1900)}
function values(){return Object.fromEntries(sliders.map(id=>[id,Number($(id).value)]))}
function setEnabled(enabled){controls.forEach(el=>el.disabled=!enabled);$('undo-btn').disabled=!enabled||historyIndex<=0;$('redo-btn').disabled=!enabled||historyIndex>=history.length-1}
function snapshot(){return {filters:values(),rotation,flipX,squareCrop}}
function applySnapshot(s){sliders.forEach(id=>{$(id).value=s.filters[id];$(id+'-out').value=s.filters[id]});rotation=s.rotation;flipX=s.flipX;squareCrop=s.squareCrop;render()}
function commit(){history=history.slice(0,historyIndex+1);history.push(JSON.parse(JSON.stringify(snapshot())));historyIndex=history.length-1;setEnabled(true)}
function loadFile(file){if(!file||!file.type.startsWith('image/'))return toast('Selecciona una imagen válida.');const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{sourceImage=img;rotation=0;flipX=false;squareCrop=false;sliders.forEach(id=>{$(id).value=0;$(id+'-out').value=0});history=[];historyIndex=-1;commit();$('empty-state').hidden=true;canvas.style.display='block';$('project-title').textContent=file.name||'Foto';$('image-info').textContent=`${img.naturalWidth} × ${img.naturalHeight}`;render();toast('Foto abierta');};img.src=e.target.result};reader.readAsDataURL(file)}
function dimensions(){let w=sourceImage.naturalWidth,h=sourceImage.naturalHeight;if(squareCrop){const s=Math.min(w,h);w=h=s}if(Math.abs(rotation)%180===90)[w,h]=[h,w];const max=1100,scale=Math.min(1,max/Math.max(w,h));return{w:Math.round(w*scale),h:Math.round(h*scale)}}
function render(useOriginal=false){
  if(!sourceImage)return;
  cancelAnimationFrame(renderTimer);
  renderTimer=requestAnimationFrame(()=>{
    try{
      const d=dimensions();
      canvas.width=d.w;canvas.height=d.h;
      ctx.save();ctx.clearRect(0,0,d.w,d.h);
      ctx.translate(d.w/2,d.h/2);ctx.rotate(rotation*Math.PI/180);ctx.scale(flipX?-1:1,1);
      let sw=sourceImage.naturalWidth,sh=sourceImage.naturalHeight,sx=0,sy=0;
      if(squareCrop){const size=Math.min(sw,sh);sx=(sw-size)/2;sy=(sh-size)/2;sw=sh=size}
      const rotated=Math.abs(rotation)%180===90,dw=rotated?d.h:d.w,dh=rotated?d.w:d.h;
      const f=useOriginal?{brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0}:values();
      ctx.filter=f.blur?`blur(${Math.min(12,f.blur)}px)`:'none';
      ctx.drawImage(sourceImage,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);
      ctx.restore();ctx.filter='none';
      if(!useOriginal)applyColorAdjustments(f);
      // Sharpening is expensive on phones. Run only at low strength and smaller previews.
      if(!useOriginal&&f.sharpness>0&&canvas.width*canvas.height<=900000)applySharpen(Math.min(f.sharpness,35)/100);
    }catch(error){
      console.error(error);
      toast('La foto es demasiado grande para este ajuste. Intenta otra vez.');
    }
  })
}
function applyColorAdjustments(f){
  if(!f.brightness&&!f.contrast&&!f.saturation&&!f.temperature)return;
  const im=ctx.getImageData(0,0,canvas.width,canvas.height),a=im.data;
  const brightness=f.brightness*2.55;
  const contrastValue=Math.max(-100,Math.min(100,f.contrast));
  const contrast=(259*(contrastValue+255))/(255*(259-contrastValue));
  const saturation=Math.max(0,(100+f.saturation)/100);
  const temp=f.temperature*.65;
  for(let i=0;i<a.length;i+=4){
    let r=a[i],g=a[i+1],b=a[i+2];
    r=contrast*(r-128)+128+brightness;
    g=contrast*(g-128)+128+brightness;
    b=contrast*(b-128)+128+brightness;
    const gray=.2126*r+.7152*g+.0722*b;
    if(f.saturation<=-100){
      r=g=b=gray;
    }else{
      r=gray+(r-gray)*saturation;
      g=gray+(g-gray)*saturation;
      b=gray+(b-gray)*saturation;
    }
    r+=temp;b-=temp;
    a[i]=Math.max(0,Math.min(255,r));
    a[i+1]=Math.max(0,Math.min(255,g));
    a[i+2]=Math.max(0,Math.min(255,b));
  }
  ctx.putImageData(im,0,0);
}
function applySharpen(strength){const im=ctx.getImageData(0,0,canvas.width,canvas.height),src=im.data,out=new Uint8ClampedArray(src),w=canvas.width,h=canvas.height,s=Math.min(.8,strength*.8);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;for(let c=0;c<3;c++){const center=src[i+c]*5-src[i-4+c]-src[i+4+c]-src[i-w*4+c]-src[i+w*4+c];out[i+c]=src[i+c]*(1-s)+center*s}}im.data.set(out);ctx.putImageData(im,0,0)}
function preset(name){const p={auto:[10,12,10,4,18,0],professional:[10,14,12,3,20,0],portrait:[8,-2,-5,5,8,1],vivid:[6,18,28,3,14,0],bw:[0,10,-100,0,0,0]}[name]||[0,0,0,0,0,0];sliders.forEach((id,i)=>{$(id).value=p[i];$(id+'-out').value=p[i]});commit();render();toast(name==='bw'?'Blanco y negro aplicado':'Ajuste aplicado')}
function normalizeCommand(text=''){
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9+\-\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const commandIntents=[
  {id:'professional',patterns:[/\bprofessional\b/,/\bprofesional\b/,/\bmejorar\b/,/\bmejora automatica\b/,/\bauto enhance\b/,/\bhazla pro\b/,/\bcalidad profesional\b/]},
  {id:'portrait',patterns:[/\bportrait\b/,/\bretrato\b/,/\bpiel natural\b/,/\bsuaviza(?:r)? piel\b/,/\bmejorar rostro\b/]},
  {id:'vivid',patterns:[/\bvivid\b/,/\bvibrante\b/,/\bmas color\b/,/\bsube(?:r)? saturacion\b/,/\bcolor intenso\b/]},
  {id:'bw',patterns:[/\bbw\b/,/\bb w\b/,/\bblack and white\b/,/\bblanco y negro\b/,/\bblanco negro\b/,/\bescala de grises\b/,/\bmonocrom(?:o|atico)?\b/,/\bsin color\b/,/\bgrayscale\b/]},
  {id:'brighten',patterns:[/\bmas brillo\b/,/\bmas brillante\b/,/\baclara(?:r)?\b/,/\bsube(?:r)? brillo\b/,/\bmore light\b/,/\bbrighten\b/]},
  {id:'darken',patterns:[/\bmenos brillo\b/,/\boscurece(?:r)?\b/,/\bbaja(?:r)? brillo\b/,/\bdarken\b/]},
  {id:'contrastUp',patterns:[/\bmas contraste\b/,/\bsube(?:r)? contraste\b/,/\bcontrast up\b/]},
  {id:'contrastDown',patterns:[/\bmenos contraste\b/,/\bbaja(?:r)? contraste\b/,/\bcontrast down\b/]},
  {id:'warm',patterns:[/\bmas calida\b/,/\bcalentar color\b/,/\btono calido\b/,/\bwarm\b/]},
  {id:'cool',patterns:[/\bmas fria\b/,/\benfriar color\b/,/\btono frio\b/,/\bcool\b/]},
  {id:'blur',patterns:[/\bdesenfoca(?:r)?\b/,/\bdesenfoque\b/,/\bblur\b/]},
  {id:'sharpen',patterns:[/\bmas nitida\b/,/\bnitidez\b/,/\benfoca(?:r)?\b/,/\bsharpen\b/]},
  {id:'reset',patterns:[/\brestablece(?:r)?\b/,/\boriginal\b/,/\bquita(?:r)? filtros\b/,/\breset\b/]},
  {id:'rotateLeft',patterns:[/\bgira(?:r)? izquierda\b/,/\brotar izquierda\b/,/\brotate left\b/]},
  {id:'rotateRight',patterns:[/\bgira(?:r)? derecha\b/,/\brotar derecha\b/,/\brotate right\b/]},
  {id:'flip',patterns:[/\bespejo\b/,/\bvoltea(?:r)? horizontal\b/,/\bflip\b/]},
  {id:'square',patterns:[/\brecorte cuadrado\b/,/\bhazla cuadrada\b/,/\bsquare crop\b/]},
  {id:'aiOutfit',patterns:[/\bcambia(?:r)? ropa\b/,/\bpon(?:er)? (?:un|una) (?:traje|camisa|vestido|uniforme|chaqueta)\b/,/\boutfit\b/]},
  {id:'aiHair',patterns:[/\bcambia(?:r)? (?:el )?(?:pelo|cabello|peinado)\b/,/\bpon(?:er)? (?:el )?cabello\b/,/\bhair\b/]},
  {id:'aiSwap',patterns:[/\bface swap\b/,/\bbody swap\b/,/\bintercambia(?:r)? (?:caras|cuerpos|cabezas)\b/,/\bmi cabeza\b/,/\bmi cara en\b/]},
  {id:'aiBackground',patterns:[/\bquita(?:r)? (?:el )?fondo\b/,/\bcambia(?:r)? (?:el )?fondo\b/,/\bfondo transparente\b/,/\bremove background\b/]},
  {id:'aiErase',patterns:[/\bborra(?:r)? (?:objeto|persona|algo)\b/,/\belimina(?:r)? (?:objeto|persona|algo)\b/,/\bmagic eraser\b/]}
];

function setSlider(id,value){
  const input=$(id),output=$(id+'-out');
  if(!input)return;
  const min=Number(input.min),max=Number(input.max);
  const safe=Math.max(min,Math.min(max,Number(value)));
  input.value=safe;
  if(output)output.value=safe;
}
function changeSlider(id,delta){setSlider(id,Number($(id).value)+delta)}
function resetLocalEdits(){
  sliders.forEach(id=>setSlider(id,0));
  rotation=0;flipX=false;squareCrop=false;
  commit();render();toast('Foto restablecida');
}
function runIntent(id){
  switch(id){
    case 'professional': preset('professional'); return true;
    case 'portrait': preset('portrait'); return true;
    case 'vivid': preset('vivid'); return true;
    case 'bw': preset('bw'); return true;
    case 'brighten': changeSlider('brightness',25); break;
    case 'darken': changeSlider('brightness',-20); break;
    case 'contrastUp': changeSlider('contrast',18); break;
    case 'contrastDown': changeSlider('contrast',-18); break;
    case 'warm': changeSlider('temperature',20); break;
    case 'cool': changeSlider('temperature',-20); break;
    case 'blur': changeSlider('blur',5); break;
    case 'sharpen': changeSlider('sharpness',22); break;
    case 'reset': resetLocalEdits(); return true;
    case 'rotateLeft': rotation=(rotation-90)%360; break;
    case 'rotateRight': rotation=(rotation+90)%360; break;
    case 'flip': flipX=!flipX; break;
    case 'square': squareCrop=!squareCrop; break;
    case 'aiOutfit': toast('Outfit Studio está listo; falta conectar el motor generativo para cambiar ropa.'); return true;
    case 'aiHair': toast('Hair Studio está listo; falta conectar el motor generativo para cambiar cabello.'); return true;
    case 'aiSwap': toast('Fun Swap está listo; falta conectar el motor generativo para intercambiar caras o cuerpos.'); return true;
    case 'aiBackground': toast('Background Studio está listo; quitar o reemplazar fondo requiere el módulo de IA.'); return true;
    case 'aiErase': toast('Magic Eraser está listo; el borrado inteligente requiere el módulo de IA.'); return true;
    default:return false;
  }
  commit();render();
  const messages={brighten:'Foto aclarada',darken:'Brillo reducido',contrastUp:'Contraste aumentado',contrastDown:'Contraste reducido',warm:'Tono más cálido',cool:'Tono más frío',blur:'Desenfoque aplicado',sharpen:'Nitidez aplicada',rotateLeft:'Foto girada',rotateRight:'Foto girada',flip:'Espejo aplicado',square:squareCrop?'Recorte cuadrado':'Recorte original'};
  toast(messages[id]||'Ajuste aplicado');
  return true;
}
function detectIntents(q){
  const direct={professional:'professional',portrait:'portrait',vivid:'vivid',bw:'bw',auto:'professional'};
  if(direct[q])return [direct[q]];
  return commandIntents.filter(intent=>intent.patterns.some(pattern=>pattern.test(q))).map(intent=>intent.id);
}
function executeCommand(raw){
  if(!sourceImage)return toast('Primero abre una foto.');
  const q=normalizeCommand(raw);
  if(!q)return toast('Escribe lo que quieres hacer.');
  const intents=detectIntents(q);
  if(!intents.length){
    toast('No entendí esa instrucción. Prueba “blanco y negro”, “más brillo” o “hazla profesional”.');
    return;
  }
  // Run one preset at a time; allow multiple simple adjustments in a sentence.
  const presetIntent=intents.find(id=>['professional','portrait','vivid','bw'].includes(id));
  if(presetIntent)return runIntent(presetIntent);
  const aiIntent=intents.find(id=>id.startsWith('ai'));
  if(aiIntent)return runIntent(aiIntent);
  intents.slice(0,4).forEach(runIntent);
}
function openStudio(key){const data=studioData[key];if(!data)return;$('sheet-title').textContent=data.title;$('sheet-description').textContent=data.desc;$('sheet-content').innerHTML='';data.options.forEach(([icon,title,sub,type,action])=>{const b=document.createElement('button');b.className='sheet-option';b.innerHTML=`<span>${icon}</span><div><strong>${title}</strong><small>${sub}</small></div><em class="badge">${type==='local'?'LOCAL':type==='next'?'PRÓXIMO':'IA'}</em>`;b.onclick=()=>{if(type==='local'){if(action==='blur'){$('blur').value=6;$('blur-out').value=6;commit();render();toast('Desenfoque aplicado')}else preset(action);closeSheet()}else toast(type==='next'?'Se añadirá como herramienta local en la próxima actualización.':'Esta opción necesita conectar el motor de IA generativa.')};$('sheet-content').appendChild(b)});$('studio-sheet').hidden=false}
function closeSheet(){$('studio-sheet').hidden=true}
sliders.forEach(id=>{$(id).addEventListener('input',()=>{$(id+'-out').value=$(id).value;render()});$(id).addEventListener('change',commit)});document.querySelectorAll('button[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));document.querySelectorAll('button[data-command]').forEach(b=>b.onclick=()=>{const cmd=b.dataset.command; if(['professional','portrait','vivid','bw'].includes(cmd)) preset(cmd); else executeCommand(cmd)});document.querySelectorAll('button[data-studio]').forEach(b=>b.onclick=()=>openStudio(b.dataset.studio));
$('command-btn').onclick=()=>executeCommand($('command-input').value);$('command-input').addEventListener('keydown',e=>{if(e.key==='Enter')executeCommand(e.target.value)});$('file-input').onchange=e=>loadFile(e.target.files[0]);$('camera-input').onchange=e=>loadFile(e.target.files[0]);$('rotate-left').onclick=()=>{rotation=(rotation-90)%360;commit();render()};$('rotate-right').onclick=()=>{rotation=(rotation+90)%360;commit();render()};$('flip-x').onclick=()=>{flipX=!flipX;commit();render()};$('crop-square').onclick=()=>{squareCrop=!squareCrop;commit();render();toast(squareCrop?'Recorte cuadrado':'Recorte original')};$('reset-btn').onclick=()=>{sliders.forEach(id=>{$(id).value=0;$(id+'-out').value=0});rotation=0;flipX=false;squareCrop=false;commit();render();toast('Foto restablecida')};$('undo-btn').onclick=()=>{if(historyIndex>0){historyIndex--;applySnapshot(history[historyIndex]);setEnabled(true)}};$('redo-btn').onclick=()=>{if(historyIndex<history.length-1){historyIndex++;applySnapshot(history[historyIndex]);setEnabled(true)}};$('compare-btn').addEventListener('pointerdown',()=>{compareDown=true;render(true)});['pointerup','pointerleave','pointercancel'].forEach(ev=>$('compare-btn').addEventListener(ev,()=>{if(compareDown){compareDown=false;render()}}));$('download-btn').onclick=()=>{render();setTimeout(()=>{const format=$('format').value,q=Number($('quality').value)/100,ext=format==='image/png'?'png':format==='image/webp'?'webp':'jpg',a=document.createElement('a');a.download=`photo-ia-${Date.now()}.${ext}`;a.href=canvas.toDataURL(format,q);a.click();toast('Imagen guardada')},80)};$('theme-btn').onclick=()=>{document.documentElement.classList.toggle('dark');localStorage.setItem('photoIATheme',document.documentElement.classList.contains('dark')?'dark':'light')};$('sheet-close').onclick=closeSheet;$('sheet-backdrop').onclick=closeSheet;
if(localStorage.getItem('photoIATheme')==='dark')document.documentElement.classList.add('dark');
setEnabled(false);
// Force old PHOTO IA caches to disappear after every update.
window.addEventListener('load',async()=>{
  try{
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith('photo-ia-')&&k!=='photo-ia-2.1.1').map(k=>caches.delete(k)));
    }
    if('serviceWorker' in navigator){
      const reg=await navigator.serviceWorker.register('sw.js?v=2.1.1',{updateViaCache:'none'});
      await reg.update();
    }
  }catch(_){ }
});
