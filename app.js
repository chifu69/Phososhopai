(() => {
'use strict';
const VERSION='5.0.0';
const $=id=>document.getElementById(id);
const controls=[...document.querySelectorAll('button[disabled],input[disabled]')];
const sliders=['brightness','contrast','saturation','temperature','sharpness','blur'];
const state={canvas:null,photo:null,originalDataUrl:'',history:[],future:[],cropper:null,compare:false,loading:false,cvReady:false};

function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}
function processing(on,label='Procesando…'){state.loading=on;$('processing').hidden=!on;$('processing').querySelector('b').textContent=label}
function setEnabled(enabled){document.querySelectorAll('[data-command],[data-preset],#command-input,#command-btn,#compare-btn,#reset-btn,#rotate-left,#rotate-right,#flip-x,#crop-btn,#add-text,#add-sticker,#download-btn,.slider-list input').forEach(el=>el.disabled=!enabled)}
function normalize(text){return String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}
function fitCanvas(){const wrap=$('canvas-wrap');const w=Math.max(280,wrap.clientWidth);const h=Math.max(360,Math.min(window.innerHeight*.62,650));state.canvas.setDimensions({width:w,height:h});if(state.photo) fitPhoto();state.canvas.requestRenderAll()}
function fitPhoto(){const p=state.photo;if(!p)return;const pad=20;const scale=Math.min((state.canvas.width-pad*2)/p.width,(state.canvas.height-pad*2)/p.height);p.scale(scale);p.set({left:state.canvas.width/2,top:state.canvas.height/2,originX:'center',originY:'center'});p.setCoords()}
function snapshot(){if(!state.photo)return;state.history.push(state.canvas.toJSON(['photoRole']));if(state.history.length>30)state.history.shift();state.future=[];updateHistoryButtons()}
function updateHistoryButtons(){$('undo-btn').disabled=state.history.length<2;$('redo-btn').disabled=!state.future.length}
function restoreJSON(json){state.canvas.loadFromJSON(json,()=>{state.photo=state.canvas.getObjects().find(o=>o.photoRole==='main')||null;state.canvas.requestRenderAll();updateHistoryButtons()})}
function undo(){if(state.history.length<2)return;state.future.push(state.history.pop());restoreJSON(state.history[state.history.length-1])}
function redo(){if(!state.future.length)return;const next=state.future.pop();state.history.push(next);restoreJSON(next)}

async function fileToImage(file){
 if(!file||!file.type.startsWith('image/'))throw new Error('Selecciona un archivo de imagen.');
 const url=URL.createObjectURL(file);
 try{
   const img=new Image();img.decoding='async';img.src=url;
   if(img.decode) await img.decode(); else await new Promise((res,rej)=>{img.onload=res;img.onerror=rej});
   return img;
 } finally {setTimeout(()=>URL.revokeObjectURL(url),2000)}
}
async function loadFile(file){
 processing(true,'Abriendo fotografía…');
 try{
   const img=await fileToImage(file);
   const max=1800;const ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
   const off=document.createElement('canvas');off.width=Math.max(1,Math.round(img.naturalWidth*ratio));off.height=Math.max(1,Math.round(img.naturalHeight*ratio));
   const ctx=off.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,off.width,off.height);
   const data=off.toDataURL('image/jpeg',.94);state.originalDataUrl=data;
   await setMainImage(data,file.name||'camera.jpg');
   toast('Foto abierta correctamente');
 }catch(err){console.error(err);toast('No pude abrir la foto. Intenta otra vez.')}finally{processing(false)}
}
function fabricImageFromURL(url){return new Promise((resolve,reject)=>fabric.Image.fromURL(url,img=>img?resolve(img):reject(new Error('Fabric no cargó la imagen')),{crossOrigin:'anonymous'}))}
async function setMainImage(dataUrl,name='image.jpg'){
 const img=await fabricImageFromURL(dataUrl);
 state.canvas.clear();img.photoRole='main';img.set({selectable:false,evented:false,objectCaching:false});state.photo=img;state.canvas.add(img);state.canvas.sendToBack(img);fitPhoto();state.canvas.requestRenderAll();
 $('empty-state').hidden=true;$('project-title').textContent=name;$('image-info').textContent=`${img.width} × ${img.height}px`;setEnabled(true);resetSliderUI();state.history=[];state.future=[];snapshot();
}
function resetSliderUI(){sliders.forEach(id=>{$(id).value=0;$(`${id}-out`).textContent='0'})}
function getFilters(){return state.photo?.filters||[]}
function replaceFilter(key,filter){const list=getFilters().filter(f=>f.__key!==key);if(filter){filter.__key=key;list.push(filter)}state.photo.filters=list;state.photo.applyFilters();state.canvas.requestRenderAll()}
function applySlider(id,value,commit=false){if(!state.photo)return;const v=Number(value);$(`${id}-out`).textContent=v;const F=fabric.Image.filters;let filter=null;
 if(id==='brightness')filter=new F.Brightness({brightness:v/100});
 if(id==='contrast')filter=new F.Contrast({contrast:v/100});
 if(id==='saturation')filter=new F.Saturation({saturation:v/100});
 if(id==='temperature'){const warm=v/100;filter=new F.BlendColor({color:warm>=0?'#ff9a48':'#63a6ff',mode:'tint',alpha:Math.abs(warm)*.28})}
 if(id==='blur')filter=v?new F.Blur({blur:Math.min(.8,v/20*.6)}):null;
 if(id==='sharpness')filter=v?new F.Convolute({matrix:[0,-v/200,0,-v/200,1+v/50,-v/200,0,-v/200,0]}):null;
 replaceFilter(id,Math.abs(v)>0?filter:null);if(commit)snapshot()
}
function applyPreset(name){if(!state.photo)return;resetSliderUI();state.photo.filters=[];const F=fabric.Image.filters;
 const add=(key,f)=>{f.__key=key;state.photo.filters.push(f)};
 if(name==='bw')add('preset',new F.Grayscale());
 if(name==='vivid'){add('brightness',new F.Brightness({brightness:.05}));add('contrast',new F.Contrast({contrast:.15}));add('saturation',new F.Saturation({saturation:.35}))}
 if(name==='portrait'){add('brightness',new F.Brightness({brightness:.06}));add('contrast',new F.Contrast({contrast:.05}));add('saturation',new F.Saturation({saturation:.06}));add('blur',new F.Blur({blur:.025}))}
 if(name==='auto'||name==='professional'){add('brightness',new F.Brightness({brightness:.04}));add('contrast',new F.Contrast({contrast:.12}));add('saturation',new F.Saturation({saturation:.16}));add('sharpness',new F.Convolute({matrix:[0,-.15,0,-.15,1.6,-.15,0,-.15,0]}))}
 state.photo.applyFilters();state.canvas.requestRenderAll();snapshot();toast(name==='bw'?'Blanco y negro aplicado':'Ajuste aplicado')
}
function executeCommand(raw){const t=normalize(raw);if(!t)return toast('Escribe una instrucción.');
 if(/blanco|negro|grayscale|escala de grises|\bbw\b/.test(t))return applyPreset('bw');
 if(/profesional|mejorar|enhance|automatic/.test(t))return applyPreset('professional');
 if(/retrato|portrait/.test(t))return applyPreset('portrait');
 if(/vibrante|mas color|saturacion/.test(t))return applyPreset('vivid');
 if(/mas brillo|brillante|aclara/.test(t)){const v=Math.min(100,Number($('brightness').value)+20);$('brightness').value=v;applySlider('brightness',v,true);return toast('Brillo aumentado')}
 if(/menos brillo|oscurece/.test(t)){const v=Math.max(-100,Number($('brightness').value)-20);$('brightness').value=v;applySlider('brightness',v,true);return toast('Brillo reducido')}
 if(/cuadrad|1:1|recort/.test(t))return openCrop(1);
 if(/gira.*derecha|rotate right/.test(t))return rotate(90);
 if(/gira.*izquierda|rotate left/.test(t))return rotate(-90);
 if(/espejo|mirror/.test(t))return flip();
 if(/ropa|cabello|pelo|cara|cuerpo|fondo|face swap|outfit/.test(t))return toast('Esa función necesita conectar el motor de IA generativa.');
 toast('Todavía no reconozco esa instrucción. Prueba “blanco y negro” o “hazla profesional”.')
}
function rotate(deg){if(!state.photo)return;state.photo.rotate((state.photo.angle||0)+deg);fitPhoto();state.canvas.requestRenderAll();snapshot()}
function flip(){if(!state.photo)return;state.photo.set('flipX',!state.photo.flipX);state.canvas.requestRenderAll();snapshot()}
function addText(){const text=new fabric.IText('Tu texto',{left:state.canvas.width/2,top:state.canvas.height/2,originX:'center',originY:'center',fontSize:42,fontWeight:'bold',fill:'#ffffff',stroke:'#111111',strokeWidth:1});state.canvas.add(text);state.canvas.setActiveObject(text);state.canvas.requestRenderAll();snapshot()}
function addSticker(){const text=new fabric.Text('⭐',{left:state.canvas.width/2,top:state.canvas.height/2,originX:'center',originY:'center',fontSize:72});state.canvas.add(text);state.canvas.setActiveObject(text);state.canvas.requestRenderAll();snapshot()}
function exportDataUrl(){state.canvas.discardActiveObject();state.canvas.requestRenderAll();const format=$('format').value;const quality=Number($('quality').value)/100;return state.canvas.toDataURL({format:format.split('/')[1],quality,multiplier:2})}
function download(){const url=exportDataUrl();const a=document.createElement('a');a.href=url;a.download=`PHOTO-IA-${Date.now()}.${$('format').value.split('/')[1].replace('jpeg','jpg')}`;a.click();toast('Imagen preparada para guardar')}
function compare(showOriginal){if(!state.photo)return;if(showOriginal){state.photo.setSrc(state.originalDataUrl,()=>{fitPhoto();state.canvas.requestRenderAll()})}else restoreJSON(state.history[state.history.length-1])}
function reset(){if(!state.originalDataUrl)return;processing(true,'Restableciendo…');setMainImage(state.originalDataUrl,$('project-title').textContent).finally(()=>{processing(false);toast('Foto restablecida')})}

function openCrop(ratio=NaN){if(!state.photo)return;const modal=$('crop-modal');$('crop-image').src=exportDataUrl();modal.hidden=false;setTimeout(()=>{state.cropper?.destroy();state.cropper=new Cropper($('crop-image'),{viewMode:1,autoCropArea:1,responsive:true,background:false,aspectRatio:ratio})},50)}
function closeCrop(){state.cropper?.destroy();state.cropper=null;$('crop-modal').hidden=true}
async function applyCrop(){if(!state.cropper)return;processing(true,'Aplicando recorte…');const c=state.cropper.getCroppedCanvas({maxWidth:1800,maxHeight:1800,imageSmoothingEnabled:true,imageSmoothingQuality:'high'});const data=c.toDataURL('image/jpeg',.94);closeCrop();await setMainImage(data,$('project-title').textContent);state.originalDataUrl=data;processing(false);toast('Recorte aplicado')}

function init(){
 if(!window.fabric){toast('No se pudo cargar Fabric.js. Revisa la conexión.');return}
 state.canvas=new fabric.Canvas('editor-canvas',{selection:true,preserveObjectStacking:true});fitCanvas();window.addEventListener('resize',()=>setTimeout(fitCanvas,120));
 $('file-input').addEventListener('change',e=>loadFile(e.target.files[0]));$('camera-input').addEventListener('change',e=>loadFile(e.target.files[0]));
 sliders.forEach(id=>{$(id).addEventListener('input',e=>applySlider(id,e.target.value,false));$(id).addEventListener('change',()=>snapshot())});
 document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>executeCommand(b.dataset.command));
 $('command-btn').onclick=()=>executeCommand($('command-input').value);$('command-input').addEventListener('keydown',e=>{if(e.key==='Enter')executeCommand(e.target.value)});
 $('rotate-left').onclick=()=>rotate(-90);$('rotate-right').onclick=()=>rotate(90);$('flip-x').onclick=flip;$('crop-btn').onclick=()=>openCrop(NaN);$('add-text').onclick=addText;$('add-sticker').onclick=addSticker;
 $('undo-btn').onclick=undo;$('redo-btn').onclick=redo;$('download-btn').onclick=download;$('reset-btn').onclick=reset;
 $('compare-btn').addEventListener('pointerdown',()=>compare(true));['pointerup','pointerleave','pointercancel'].forEach(ev=>$('compare-btn').addEventListener(ev,()=>compare(false)));
 $('crop-close').onclick=closeCrop;$('crop-apply').onclick=applyCrop;document.querySelectorAll('[data-ratio]').forEach(b=>b.onclick=()=>state.cropper?.setAspectRatio(Number(b.dataset.ratio)));
 $('theme-btn').onclick=()=>{document.documentElement.classList.toggle('dark');localStorage.setItem('photoIATheme',document.documentElement.classList.contains('dark')?'dark':'light')};if(localStorage.getItem('photoIATheme')==='dark')document.documentElement.classList.add('dark');
 document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files?.[0];if(f)loadFile(f)});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v='+VERSION).catch(console.warn);
}
window.addEventListener('opencv-script-loaded',()=>{const wait=()=>{if(window.cv&&cv.Mat){state.cvReady=true;$('engine-badge').textContent='Fabric + OpenCV listo';$('engine-badge').classList.add('ready')}else setTimeout(wait,250)};wait()});
document.addEventListener('DOMContentLoaded',init);
})();
