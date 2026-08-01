(() => {
'use strict';
const VERSION='6.4.0';
const $=id=>document.getElementById(id);
const normalize=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const colors={
 rojo:'#ef4444',red:'#ef4444',azul:'#2563eb',blue:'#2563eb',verde:'#22c55e',green:'#22c55e',amarillo:'#eab308',yellow:'#eab308',
 naranja:'#f97316',orange:'#f97316',morado:'#9333ea',purple:'#9333ea',rosa:'#ec4899',pink:'#ec4899',negro:'#111111',black:'#111111',
 blanco:'#ffffff',white:'#ffffff',gris:'#6b7280',gray:'#6b7280',dorado:'#d4a017',gold:'#d4a017',cafe:'#8b5e3c',brown:'#8b5e3c'
};
const registry=[];
const register=plugin=>registry.push(plugin);
function api(){return window.PhotoIA}
function ready(){return !!api()?.state?.canvas}
function say(message,type='ok'){
  api()?.toast?.(message);
  let box=$('brain-response');
  if(!box){box=document.createElement('div');box.id='brain-response';box.className='brain-response';$('command-input')?.closest('.command-panel')?.appendChild(box)}
  box.className=`brain-response ${type}`;box.textContent=`🤖 ${message}`;
}
function colorFrom(text,fallback='#ef4444'){
  for(const [name,value] of Object.entries(colors))if(new RegExp(`\\b${name}\\b`).test(text))return value;
  const hex=text.match(/#[0-9a-f]{6}\b/i);return hex?hex[0]:fallback;
}
function quoted(raw){
  const m=raw.match(/["“”']([^"“”']+)["“”']/);if(m)return m[1].trim();
  const q=raw.match(/(?:que diga|texto|escribe|poner)\s+(.+?)(?:\s+(?:en|con|color)\s+\w+)?$/i);return q?q[1].trim():'';
}
function snapshot(){api().snapshot();api().renderLayers()}
function select(obj){const c=api().state.canvas;c.add(obj);c.setActiveObject(obj);c.requestRenderAll();snapshot()}
function layerId(){return api().nextLayerId()}

register({name:'filters',score:t=>/blanco y negro|escala de grises|profesional|retrato|vibrante|mas color|brillo|contraste|nitidez|desenfoc/.test(t)?100:0,run(t){
  if(/blanco y negro|escala de grises/.test(t))api().applyPreset('bw');
  else if(/profesional|mejora/.test(t))api().applyPreset('professional');
  else if(/retrato/.test(t))api().applyPreset('portrait');
  else if(/vibrante|mas color/.test(t))api().applyPreset('vivid');
  else if(/brillo/.test(t)){const el=$('brightness'),delta=/menos|baja|reduce|oscure/.test(t)?-20:20;el.value=Math.max(-100,Math.min(100,Number(el.value)+delta));api().applySlider('brightness',el.value,true)}
  else if(/contraste/.test(t)){const el=$('contrast'),delta=/menos|baja|reduce/.test(t)?-20:20;el.value=Math.max(-100,Math.min(100,Number(el.value)+delta));api().applySlider('contrast',el.value,true)}
  else if(/nitidez/.test(t)){const el=$('sharpness');el.value=Math.min(100,Number(el.value)+20);api().applySlider('sharpness',el.value,true)}
  else if(/desenfoc/.test(t)){const el=$('blur');el.value=Math.min(20,Number(el.value)+5);api().applySlider('blur',el.value,true)}
  say('Ajuste aplicado.');
}});
register({name:'text',score:t=>/agrega|anade|pon|crear/.test(t)&&/texto|que diga|escribe/.test(t)?95:0,run(t,raw){
  const value=quoted(raw)||'Tu texto';const c=api().state.canvas;const fill=colorFrom(t,'#ffffff');
  const obj=new fabric.IText(value,{left:c.width/2,top:c.height/2,originX:'center',originY:'center',fontSize:/titulo|grande/.test(t)?64:44,fontWeight:/negrita|bold|titulo/.test(t)?'bold':'normal',fontStyle:/cursiva|italic/.test(t)?'italic':'normal',fill,stroke:fill==='#ffffff'?'#111111':null,strokeWidth:fill==='#ffffff'?1:0});
  obj.layerId=layerId();obj.layerName=`Texto: ${value.slice(0,18)}`;obj.layerType='text';select(obj);say(`Texto “${value}” agregado.`);
}});
register({name:'shape',score:t=>/cuadrado|rectangulo|circulo|triangulo|flecha|linea/.test(t)?90:0,run(t){
  const c=api().state.canvas,stroke=colorFrom(t),transparent=/sin relleno|transparente|solo contorno/.test(t);let obj,name;
  const common={left:c.width/2,top:c.height/2,originX:'center',originY:'center',fill:transparent?'rgba(0,0,0,0)':stroke,stroke,strokeWidth:/grues/.test(t)?8:4};
  if(/circulo/.test(t)){obj=new fabric.Circle({...common,radius:75});name='Círculo'}
  else if(/triangulo/.test(t)){obj=new fabric.Triangle({...common,width:170,height:145});name='Triángulo'}
  else if(/flecha/.test(t)){const line=new fabric.Line([-90,0,65,0],{stroke,strokeWidth:6});const head=new fabric.Triangle({left:80,top:0,width:28,height:34,angle:90,originX:'center',originY:'center',fill:stroke,stroke});obj=new fabric.Group([line,head],{left:c.width/2,top:c.height/2,originX:'center',originY:'center'});name='Flecha'}
  else if(/linea/.test(t)){obj=new fabric.Line([-90,0,90,0],{...common,fill:null});name='Línea'}
  else {obj=new fabric.Rect({...common,width:190,height:/cuadrado/.test(t)?190:120,rx:/redondead/.test(t)?22:0,ry:/redondead/.test(t)?22:0});name=/cuadrado/.test(t)?'Cuadrado':'Rectángulo'}
  if(/puntead/.test(t))obj.set('strokeDashArray',[4,8]);else if(/discontinu/.test(t))obj.set('strokeDashArray',[14,9]);
  obj.layerId=layerId();obj.layerName=name;obj.layerType='shape';select(obj);say(`${name} ${transparent?'sin relleno ':''}agregado.`);
}});
register({name:'layers',score:t=>/duplica|duplicar|elimina|borrar capa|trae al frente|manda atras|envia atras|bloquea/.test(t)?85:0,run(t){
  const c=api().state.canvas,o=c.getActiveObject();if(!o||o.photoRole==='main')return say('Primero selecciona un objeto o una capa.','warn');
  if(/duplica/.test(t)){o.clone(cl=>{cl.set({left:(o.left||0)+18,top:(o.top||0)+18});cl.layerId=layerId();cl.layerName=(o.layerName||'Objeto')+' copia';cl.userLocked=false;select(cl)});say('Objeto duplicado.');return}
  if(/elimina|borrar capa/.test(t)){c.remove(o);c.discardActiveObject();c.requestRenderAll();snapshot();say('Objeto eliminado.');return}
  if(/frente/.test(t))c.bringToFront(o);else if(/atras/.test(t)){c.sendToBack(o);if(api().state.photo)c.sendToBack(api().state.photo)}else if(/bloquea/.test(t)){o.userLocked=true;o.set({selectable:false,evented:false});c.discardActiveObject()}
  c.requestRenderAll();snapshot();say('Orden de la capa actualizado.');
}});
register({name:'transform',score:t=>/gira|rotar|espejo|voltea|recorta|cuadrad/.test(t)?70:0,run(t){
  if(/derecha/.test(t))api().rotate(90);else if(/izquierda/.test(t))api().rotate(-90);else if(/espejo|voltea/.test(t))api().flip();else if(/recorta|cuadrad/.test(t))api().openCrop(/cuadrad|1:1/.test(t)?1:NaN);say('Transformación preparada.');
}});
register({name:'future-ai',score:t=>/cabello|pelo|peinado|ropa|outfit|face swap|intercambia.*cara|cambiar fondo|quita.*fondo|borra.*objeto/.test(t)?60:0,run(t){
  const module=/cabello|pelo|peinado/.test(t)?'Hair Studio':/ropa|outfit/.test(t)?'Outfit Studio':/face swap|intercambia.*cara/.test(t)?'Face Swap':/fondo/.test(t)?'Background Studio':'Magic Eraser';
  say(`${module} quedó identificado. Falta conectar el modelo generativo para ejecutar ese cambio.`, 'info');
}});

function execute(raw){
  if(!ready())return say('Abre una foto primero.','warn');
  const t=normalize(raw);if(!t)return say('Escribe lo que quieres hacer.','warn');
  const ranked=registry.map(p=>({p,score:p.score(t,raw)})).sort((a,b)=>b.score-a.score);
  if(!ranked[0]||ranked[0].score<=0){api().executeLegacyCommand(raw);return}
  try{ranked[0].p.run(t,raw)}catch(err){console.error(err);say('No pude completar esa acción. Prueba con una instrucción más sencilla.','error')}
}
function boot(){
  const input=$('command-input'),button=$('command-btn');if(!input||!button)return;
  button.onclick=()=>execute(input.value);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();execute(input.value)}};
  input.placeholder='Ej.: agrega un cuadrado rojo sin relleno, texto “Oferta”, más brillo…';
  const panel=input.closest('.command-panel');if(panel&&!$('brain-examples')){const x=document.createElement('div');x.id='brain-examples';x.className='brain-examples';x.innerHTML='<button>Cuadrado rojo sin relleno</button><button>Texto “Oferta” en amarillo</button><button>Hazla profesional</button>';x.querySelectorAll('button').forEach(b=>b.onclick=()=>{input.value=b.textContent;execute(b.textContent)});panel.appendChild(x)}
  window.PhotoBrain={version:VERSION,register,execute,plugins:registry};
}
window.addEventListener('photoia-ready',boot,{once:true});
})();
