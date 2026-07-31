'use strict';
const $=id=>document.getElementById(id);
const canvas=$('editor-canvas');
const ctx=canvas.getContext('2d',{willReadFrequently:true});
let sourceImage=null, originalDataURL='', rotation=0, flipX=false, squareCrop=false, compareDown=false;
let history=[], historyIndex=-1, renderTimer=0;
const sliders=['brightness','contrast','saturation','temperature','sharpness','blur'];
const controls=[...document.querySelectorAll('button[data-preset], .slider-list input, #rotate-left,#rotate-right,#flip-x,#crop-square,#reset-btn,#compare-btn,#download-btn')];

function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
function values(){return Object.fromEntries(sliders.map(id=>[id,Number($(id).value)]))}
function setEnabled(enabled){controls.forEach(el=>el.disabled=!enabled);$('undo-btn').disabled=!enabled||historyIndex<=0;$('redo-btn').disabled=!enabled||historyIndex>=history.length-1}
function snapshot(){return {filters:values(),rotation,flipX,squareCrop}}
function applySnapshot(s){sliders.forEach(id=>{$(id).value=s.filters[id];$(id+'-out').value=s.filters[id]});rotation=s.rotation;flipX=s.flipX;squareCrop=s.squareCrop;render()}
function commit(){const s=snapshot();history=history.slice(0,historyIndex+1);history.push(JSON.parse(JSON.stringify(s)));historyIndex=history.length-1;setEnabled(true)}
function loadFile(file){if(!file||!file.type.startsWith('image/'))return toast('Selecciona una imagen válida.');const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{sourceImage=img;originalDataURL=e.target.result;rotation=0;flipX=false;squareCrop=false;sliders.forEach(id=>{$(id).value=0;$(id+'-out').value=0});history=[];historyIndex=-1;commit();$('empty-state').hidden=true;canvas.style.display='block';$('project-title').textContent=file.name||'Foto';$('image-info').textContent=`${img.naturalWidth} × ${img.naturalHeight}`;render();toast('Foto abierta');};img.src=e.target.result};reader.readAsDataURL(file)}
function dimensions(){let w=sourceImage.naturalWidth,h=sourceImage.naturalHeight;if(squareCrop){const s=Math.min(w,h);w=h=s}if(Math.abs(rotation)%180===90)[w,h]=[h,w];const max=1800,scale=Math.min(1,max/Math.max(w,h));return {w:Math.round(w*scale),h:Math.round(h*scale),scale}}
function render(useOriginal=false){if(!sourceImage)return;cancelAnimationFrame(renderTimer);renderTimer=requestAnimationFrame(()=>{const d=dimensions();canvas.width=d.w;canvas.height=d.h;ctx.save();ctx.clearRect(0,0,d.w,d.h);ctx.translate(d.w/2,d.h/2);ctx.rotate(rotation*Math.PI/180);ctx.scale(flipX?-1:1,1);let sw=sourceImage.naturalWidth,sh=sourceImage.naturalHeight,sx=0,sy=0;if(squareCrop){const s=Math.min(sw,sh);sx=(sw-s)/2;sy=(sh-s)/2;sw=sh=s}const rotated=Math.abs(rotation)%180===90;const dw=(rotated?d.h:d.w),dh=(rotated?d.w:d.h);const f=useOriginal?{brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0}:values();ctx.filter=`brightness(${100+f.brightness}%) contrast(${100+f.contrast}%) saturate(${100+f.saturation}%) blur(${f.blur}px)`;ctx.drawImage(sourceImage,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);ctx.restore();if(!useOriginal&&f.temperature!==0)applyTemperature(f.temperature);if(!useOriginal&&f.sharpness>0)applySharpen(f.sharpness/100);});}
function applyTemperature(amount){const im=ctx.getImageData(0,0,canvas.width,canvas.height),a=im.data,shift=amount*.65;for(let i=0;i<a.length;i+=4){a[i]=Math.max(0,Math.min(255,a[i]+shift));a[i+2]=Math.max(0,Math.min(255,a[i+2]-shift))}ctx.putImageData(im,0,0)}
function applySharpen(strength){const im=ctx.getImageData(0,0,canvas.width,canvas.height),src=im.data,out=new Uint8ClampedArray(src),w=canvas.width,h=canvas.height,s=Math.min(.8,strength*.8);for(let y=1;y<h-1;y++){for(let x=1;x<w-1;x++){const i=(y*w+x)*4;for(let c=0;c<3;c++){const center=src[i+c]*5-src[i-4+c]-src[i+4+c]-src[i-w*4+c]-src[i+w*4+c];out[i+c]=src[i+c]*(1-s)+center*s}}}im.data.set(out);ctx.putImageData(im,0,0)}
function preset(name){const p={auto:[10,12,10,4,18,0],portrait:[8,-2,-5,5,8,1],vivid:[6,18,28,3,14,0],bw:[5,15,-100,0,12,0]}[name];sliders.forEach((id,i)=>{$(id).value=p[i];$(id+'-out').value=p[i]});commit();render();toast('Ajuste aplicado')}
sliders.forEach(id=>{$(id).addEventListener('input',()=>{$(id+'-out').value=$(id).value;render()});$(id).addEventListener('change',commit)});
document.querySelectorAll('button[data-preset]').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.preset)));
$('file-input').addEventListener('change',e=>loadFile(e.target.files[0]));$('camera-input').addEventListener('change',e=>loadFile(e.target.files[0]));
$('rotate-left').onclick=()=>{rotation=(rotation-90)%360;commit();render()};$('rotate-right').onclick=()=>{rotation=(rotation+90)%360;commit();render()};$('flip-x').onclick=()=>{flipX=!flipX;commit();render()};$('crop-square').onclick=()=>{squareCrop=!squareCrop;commit();render();toast(squareCrop?'Recorte cuadrado':'Recorte original')};
$('reset-btn').onclick=()=>{sliders.forEach(id=>{$(id).value=0;$(id+'-out').value=0});rotation=0;flipX=false;squareCrop=false;commit();render();toast('Foto restablecida')};
$('undo-btn').onclick=()=>{if(historyIndex>0){historyIndex--;applySnapshot(history[historyIndex]);setEnabled(true)}};$('redo-btn').onclick=()=>{if(historyIndex<history.length-1){historyIndex++;applySnapshot(history[historyIndex]);setEnabled(true)}};
$('compare-btn').addEventListener('pointerdown',()=>{compareDown=true;render(true)});['pointerup','pointerleave','pointercancel'].forEach(ev=>$('compare-btn').addEventListener(ev,()=>{if(compareDown){compareDown=false;render()}}));
$('download-btn').onclick=()=>{render();setTimeout(()=>{const format=$('format').value,q=Number($('quality').value)/100;const ext=format==='image/png'?'png':format==='image/webp'?'webp':'jpg';const a=document.createElement('a');a.download=`photo-ia-${Date.now()}.${ext}`;a.href=canvas.toDataURL(format,q);a.click();toast('Imagen guardada')},60)};
$('theme-btn').onclick=()=>{document.documentElement.classList.toggle('dark');localStorage.setItem('photoIATheme',document.documentElement.classList.contains('dark')?'dark':'light')};
if(localStorage.getItem('photoIATheme')==='dark')document.documentElement.classList.add('dark');setEnabled(false);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
