(() => {
'use strict';
const VERSION='7.1.1';
const MACRO_KEY='photoIAMacrosV1';
const CONTEXT_KEY='photoIABrainContextV1';
const $=id=>document.getElementById(id);
const normalize=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
const COLOR_WORDS={
 rojo:'#ef4444',roja:'#ef4444',rojos:'#ef4444',rojas:'#ef4444',red:'#ef4444',carmesi:'#dc143c',escarlata:'#ff2400',
 azul:'#2563eb',azules:'#2563eb',blue:'#2563eb',celeste:'#38bdf8',celestes:'#38bdf8',cyan:'#06b6d4',turquesa:'#14b8a6',turquesas:'#14b8a6',
 verde:'#22c55e',verdes:'#22c55e',green:'#22c55e',lima:'#84cc16',amarillo:'#eab308',amarilla:'#eab308',amarillos:'#eab308',amarillas:'#eab308',yellow:'#eab308',
 naranja:'#f97316',naranjas:'#f97316',orange:'#f97316',morado:'#9333ea',morada:'#9333ea',morados:'#9333ea',moradas:'#9333ea',violeta:'#7c3aed',violetas:'#7c3aed',purple:'#9333ea',
 rosa:'#ec4899',rosado:'#ec4899',rosada:'#ec4899',rosados:'#ec4899',rosadas:'#ec4899',pink:'#ec4899',
 negro:'#111111',negra:'#111111',negros:'#111111',negras:'#111111',black:'#111111',oscuro:'#111111',oscura:'#111111',
 blanco:'#ffffff',blanca:'#ffffff',blancos:'#ffffff',blancas:'#ffffff',white:'#ffffff',
 gris:'#6b7280',grises:'#6b7280',gray:'#6b7280',plateado:'#94a3b8',plateada:'#94a3b8',plateados:'#94a3b8',plateadas:'#94a3b8',
 dorado:'#d4a017',dorada:'#d4a017',dorados:'#d4a017',doradas:'#d4a017',oro:'#d4a017',gold:'#d4a017',
 cafe:'#8b5e3c',marron:'#8b5e3c',marrones:'#8b5e3c',brown:'#8b5e3c',beige:'#d6c6a5'
};
const registry=[];
const register=plugin=>registry.push(plugin);
const api=()=>window.PhotoIA;
const ready=()=>!!api()?.state?.canvas;
const brainState={lastObjectId:null,lastPlugin:null,lastCommand:'',batch:null,conversation:[],lastIntent:null};
try{Object.assign(brainState,JSON.parse(localStorage.getItem(CONTEXT_KEY)||'{}'));}catch(_){ }
function persistContext(){
  try{localStorage.setItem(CONTEXT_KEY,JSON.stringify({lastObjectId:brainState.lastObjectId,lastPlugin:brainState.lastPlugin,lastCommand:brainState.lastCommand}));}catch(_){ }
}
function logConversation(role,text){
  brainState.conversation.push({role,text,time:Date.now()});
  if(brainState.conversation.length>12)brainState.conversation.shift();
}
function renderMessage(message,type='ok'){
  api()?.toast?.(message);
  let box=$('brain-response');
  if(!box){box=document.createElement('div');box.id='brain-response';box.className='brain-response';$('command-input')?.closest('.command-panel')?.appendChild(box);}
  box.className=`brain-response ${type}`;box.textContent=`🤖 ${message}`;
}
function say(message,type='ok'){
  logConversation('assistant',message);
  if(brainState.batch){brainState.batch.messages.push(message);if(type==='error')brainState.batch.type='error';else if(type==='warn'&&brainState.batch.type!=='error')brainState.batch.type='warn';return;}
  renderMessage(message,type);
}
function remember(obj,plugin='object'){
  if(obj?.layerId)brainState.lastObjectId=obj.layerId;
  brainState.lastPlugin=plugin;persistContext();
}
function canvasObjects(){return api().state.canvas.getObjects().filter(o=>o.photoRole!=='main');}
function findByLayerId(id){return canvasObjects().find(o=>o.layerId===id)||null;}
function currentObject(){return api().state.canvas.getActiveObject()||findByLayerId(brainState.lastObjectId);}
function colorMatches(text){
  const found=[];
  for(const [name,value] of Object.entries(COLOR_WORDS)){const re=new RegExp(`\\b${name}\\b`,'g');let m;while((m=re.exec(text)))found.push({name,value,index:m.index});}
  const hex=/#[0-9a-f]{6}\b/ig;let hm;while((hm=hex.exec(text)))found.push({name:hm[0],value:hm[0],index:hm.index});
  return found.sort((a,b)=>a.index-b.index);
}
function colorAfter(text,phrases){for(const phrase of phrases){const idx=text.indexOf(phrase);if(idx<0)continue;const match=colorMatches(text.slice(idx+phrase.length))[0];if(match)return match.value;}return null;}
function parseColors(text){
  const all=colorMatches(text),explicitFill=colorAfter(text,['relleno ','fondo ','interior ']),explicitStroke=colorAfter(text,['borde ','contorno ','linea exterior ','orilla ']);
  const transparent=/sin relleno|relleno transparente|fondo transparente|solo contorno/.test(text);let fill=explicitFill,stroke=explicitStroke;
  if(!fill&&!stroke){fill=all[0]?.value||'#ef4444';stroke=fill;}
  else if(fill&&!stroke){const idx=Math.max(text.indexOf('relleno'),text.indexOf('fondo'),text.indexOf('interior'));stroke=all.find(c=>c.index<idx)?.value||fill;}
  else if(stroke&&!fill)fill=all.find(c=>c.value!==stroke)?.value||stroke;
  if(transparent)fill='rgba(0,0,0,0)';return {fill:fill||'#ef4444',stroke:stroke||fill||'#ef4444',transparent};
}
function colorName(value){
  const preferred=[['#111111','negro'],['#ffffff','blanco'],['#ef4444','rojo'],['#2563eb','azul'],['#22c55e','verde'],['#eab308','amarillo'],['#f97316','naranja'],['#9333ea','morado'],['#ec4899','rosa'],['#6b7280','gris'],['#d4a017','dorado'],['#8b5e3c','café']];
  return preferred.find(([hex])=>hex===String(value).toLowerCase())?.[1]||value;
}
function parseNumber(text,words,def,min,max){for(const word of words){const m=text.match(new RegExp(`${word}\\s*(?:de\\s*)?(\\d+(?:\\.\\d+)?)`));if(m)return Math.max(min,Math.min(max,Number(m[1])));}return def;}
function parseOpacity(text){const pct=text.match(/(?:opacidad|transparencia)\s*(?:de\s*)?(\d{1,3})\s*%?/);if(pct)return Math.max(.05,Math.min(1,Number(pct[1])/100));if(/semitransparente|medio transparente|mitad transparente/.test(text))return .5;if(/muy transparente/.test(text))return .25;if(/casi transparente/.test(text))return .15;return 1;}
function parseSize(text,type){
  const explicit=text.match(/(?:tamano|ancho|de)\s*(\d{2,4})(?:\s*(?:px|pixeles))?/);if(explicit){const n=Math.max(30,Math.min(700,Number(explicit[1])));return {w:n,h:type==='rectangle'?Math.round(n*.65):n};}
  if(/enorme|gigante|muy grande/.test(text))return {w:360,h:type==='rectangle'?230:360};if(/grande/.test(text))return {w:280,h:type==='rectangle'?180:280};if(/pequeno|chico/.test(text))return {w:95,h:type==='rectangle'?62:95};if(/mini|muy pequeno/.test(text))return {w:60,h:type==='rectangle'?40:60};return {w:190,h:type==='rectangle'?120:190};
}
function parsePosition(text,c,objW=0,objH=0){let left=c.width/2,top=c.height/2;const margin=35;if(/izquierda/.test(text))left=margin+objW/2;if(/derecha/.test(text))left=c.width-margin-objW/2;if(/arriba|superior/.test(text))top=margin+objH/2;if(/abajo|inferior/.test(text))top=c.height-margin-objH/2;if(/centro|centrad/.test(text)){if(!/izquierda|derecha/.test(text))left=c.width/2;if(!/arriba|abajo|superior|inferior/.test(text))top=c.height/2;}return {left,top};}
function quoted(raw){const m=raw.match(/["“”']([^"“”']+)["“”']/);if(m)return m[1].trim();const q=raw.match(/(?:que diga|texto|escribe|poner)\s+(.+?)(?:\s+(?:en|con|color|arriba|abajo|centro)\b.*)?$/i);return q?q[1].trim():'';}
function snapshot(){api().snapshot();api().renderLayers();}
function addAndSelect(obj,plugin='object'){const c=api().state.canvas;c.add(obj);c.setActiveObject(obj);c.requestRenderAll();snapshot();remember(obj,plugin);return obj;}
const layerId=()=>api().nextLayerId();
function objectKind(obj){
  const n=normalize(`${obj.layerName||''} ${obj.layerType||''} ${obj.type||''}`);
  if(/texto|text|i-text/.test(n))return 'texto';if(/sticker/.test(n))return 'sticker';if(/circulo|circle/.test(n))return 'circulo';if(/triangulo|triangle/.test(n))return 'triangulo';if(/flecha|arrow/.test(n))return 'flecha';if(/linea|line/.test(n))return 'linea';if(/cuadrado/.test(n))return 'cuadrado';if(/rectangulo|rect/.test(n))return 'rectangulo';if(/trazo|path/.test(n))return 'trazo';return 'objeto';
}
function targetKind(text){if(/texto/.test(text))return 'texto';if(/sticker|emoji/.test(text))return 'sticker';if(/circulo/.test(text))return 'circulo';if(/triangulo/.test(text))return 'triangulo';if(/flecha/.test(text))return 'flecha';if(/linea/.test(text))return 'linea';if(/cuadrado|cuadro/.test(text))return 'cuadrado';if(/rectangulo/.test(text))return 'rectangulo';if(/trazo|dibujo/.test(text))return 'trazo';return null;}
function objectColors(obj){
  const values=[];
  const push=v=>{if(typeof v==='string'&&v&&!/rgba\(0,\s*0,\s*0,\s*0\)|transparent/i.test(v))values.push(v.toLowerCase());};
  push(obj.fill);push(obj.stroke);push(obj.photoColor);
  if(Array.isArray(obj._objects))obj._objects.forEach(child=>{push(child.fill);push(child.stroke);});
  return values;
}
function hexToRgb(hex){const value=String(hex||'').replace('#','');if(!/^[0-9a-f]{6}$/i.test(value))return null;return [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)];}
function colorDistance(a,b){const ar=hexToRgb(a),br=hexToRgb(b);if(!ar||!br)return a===b?0:999;return Math.sqrt(ar.reduce((sum,v,i)=>sum+(v-br[i])**2,0));}
function objectMatchesColor(obj,color){if(!color)return true;return objectColors(obj).some(value=>value===color.toLowerCase()||colorDistance(value,color)<38);}
function textNeedle(text){const m=text.match(/(?:texto|que diga|llamado|nombre)\s+["“”']?([^"“”']+?)["“”']?(?:\s+(?:rojo|azul|verde|amarillo|negro|blanco|arriba|abajo|centro)|$)/);return m?m[1].trim():'';}
function findTargets(text){
  const kind=targetKind(text),requestedColor=colorMatches(text)[0]?.value||null,needle=textNeedle(text),objects=canvasObjects().slice().reverse();
  const explicitLast=/ultimo|ultima|mas reciente/.test(text),explicitSelected=/seleccionad|actual|este|esta|ese|esa|hazlo|ponlo|muevelo|giralo|rotalo/.test(text);
  if(explicitSelected&&!kind&&!requestedColor&&!needle){const active=currentObject();return active?[active]:[];}
  const matches=objects.filter(o=>{
    const actual=objectKind(o);
    const kindOk=!kind||actual===kind||(kind==='cuadrado'&&actual==='rectangulo')||(kind==='rectangulo'&&actual==='cuadrado');
    const colorOk=objectMatchesColor(o,requestedColor);
    const textOk=!needle||normalize(o.text||o.layerName||'').includes(normalize(needle));
    return kindOk&&colorOk&&textOk;
  });
  if(explicitLast)return matches.slice(0,1);
  if(matches.length)return matches;
  if(kind||requestedColor||needle)return [];
  const active=currentObject();return active?[active]:(objects[0]?[objects[0]]:[]);
}
function findTarget(text){return findTargets(text)[0]||null;}
function wantsAll(text){return /\b(todos|todas|cada)\b/.test(text);}

function detectIntent(t){
  if(/\b(elimina|eliminar|borra|borrar|quita|quitar|remueve|remover)\b/.test(t))return 'delete';
  if(/\b(selecciona|seleccionar|escoge|elige|toca)\b/.test(t))return 'select';
  if(/\b(duplica|duplicar|copia|copiar)\b/.test(t))return 'duplicate';
  if(/\b(cambia|cambiar|ponlo|hazlo|muevelo|mueve|gira|giralo|rota|rotalo|agranda|reduce|bloquea|desbloquea|trae|envia|manda|alinea|centra)\b/.test(t))return 'modify';
  if(/^(?:ahora\s+)?(?:sin relleno|con relleno|relleno|borde|contorno|mas grande|mas pequeno|arriba|abajo|izquierda|derecha|centro|transparente|opacidad)/.test(t))return 'modify';
  if(/\b(agrega|agregar|anade|anadir|crea|crear|pon|inserta|insertar|escribe)\b/.test(t))return 'create';
  return 'unknown';
}

function describeTarget(t,obj){return {intent:detectIntent(t),kind:targetKind(t)||'objeto',color:colorMatches(t)[0]?.name||'cualquiera',matches:obj?1:0};}
function renderDebug(info){
  let box=$('brain-debug');
  if(!box){box=document.createElement('div');box.id='brain-debug';box.className='brain-debug';$('brain-response')?.insertAdjacentElement('afterend',box);}
  if(!box)return;
  box.innerHTML=`<strong>🧠 ${info.intent}</strong><span>🎯 ${info.kind}</span><span>🎨 ${info.color}</span><span>🔎 ${info.matches} coincidencia${info.matches===1?'':'s'}</span>`;
}
function runPriorityIntent(t,raw){
  const intent=detectIntent(t);
  if(!['delete','select','duplicate','modify'].includes(intent))return false;
  const matches=findTargets(t),obj=matches[0]||null,all=wantsAll(t);
  renderDebug({intent,kind:targetKind(t)||'objeto',color:colorMatches(t)[0]?.name||'cualquiera',matches:matches.length});
  brainState.lastIntent=intent;persistContext();
  if(!obj){say('No encontré un objeto que coincida con esa descripción.','warn');return true;}
  const c=api().state.canvas,targets=all?matches:[obj];
  if(intent==='select'){
    if(targets.length>1){const active=new fabric.ActiveSelection(targets,{canvas:c});c.setActiveObject(active);c.requestRenderAll();api().renderLayers();brainState.lastObjectId=targets[0].layerId;persistContext();say(`${targets.length} objetos seleccionados.`);}else if(activate(obj))say(`${objectKind(obj)} seleccionado.`);
    return true;
  }
  if(intent==='delete'){
    const removable=targets.filter(o=>!o.userLocked);
    if(!removable.length){say('Los objetos encontrados están bloqueados.','warn');return true;}
    removable.forEach(o=>c.remove(o));c.discardActiveObject();c.requestRenderAll();snapshot();brainState.lastObjectId=null;persistContext();say(removable.length===1?`${objectKind(removable[0])} eliminado.`:`${removable.length} objetos eliminados.`);return true;
  }
  if(intent==='duplicate'){
    let pending=targets.length,created=[];
    const finish=()=>{if(!created.length)return say('No pude duplicar objetos bloqueados.','warn');const active=created.length===1?created[0]:new fabric.ActiveSelection(created,{canvas:c});c.setActiveObject(active);c.requestRenderAll();snapshot();remember(created[0],'layers');say(created.length===1?'Objeto duplicado.':`${created.length} objetos duplicados.`);};
    targets.forEach(source=>{if(source.userLocked){if(--pending===0)finish();return;}source.clone(cl=>{cl.set({left:(source.left||0)+18,top:(source.top||0)+18});cl.layerId=layerId();cl.layerName=(source.layerName||'Objeto')+' copia';cl.userLocked=false;c.add(cl);created.push(cl);if(--pending===0)finish();});});
    return true;
  }
  if(intent==='modify'){
    let changed=0;
    targets.forEach(target=>{
      if(target.userLocked)return;
      const colors=parseColors(t);let local=false;
      if(/relleno\s+|fondo\s+/.test(t)&&colorMatches(t).length){target.set('fill',colors.fill);local=true;}
      else if(/borde|contorno/.test(t)&&colorMatches(t).length){target.set('stroke',colors.stroke);local=true;}
      else if(colorMatches(t).length){if(objectKind(target)==='texto'||objectKind(target)==='sticker')target.set('fill',colors.fill);else{target.set('stroke',colors.stroke);target.set('fill',colors.fill);}local=true;}
      if(/sin relleno|relleno transparente|solo contorno/.test(t)){target.set('fill','rgba(0,0,0,0)');local=true;}
      if(/con relleno/.test(t)&&!/sin relleno/.test(t)){target.set('fill',colors.fill||target.stroke||'#ef4444');local=true;}
      const pct=t.match(/(?:opacidad|transparencia)\s*(?:de\s*)?(\d{1,3})\s*%?/);if(pct){target.set('opacity',Math.max(.05,Math.min(1,Number(pct[1])/100)));local=true;}
      if(/mas grande|agranda|aumenta/.test(t)){target.scaleX=(target.scaleX||1)*1.2;target.scaleY=(target.scaleY||1)*1.2;local=true;}
      if(/mas pequeno|reduce|disminuye|achica/.test(t)){target.scaleX=(target.scaleX||1)*.82;target.scaleY=(target.scaleY||1)*.82;local=true;}
      const angle=t.match(/(?:gira|giralo|rota|rotalo)\s*(?:a|de)?\s*(-?\d+)?/);if(angle){target.rotate((target.angle||0)+Number(angle[1]||15));local=true;}
      if(/arriba|abajo|izquierda|derecha|centro|centrad/.test(t)){target.set(parsePosition(t,c,target.getScaledWidth?.()||0,target.getScaledHeight?.()||0));local=true;}
      if(/trae.*frente/.test(t)){c.bringToFront(target);local=true;}
      if(/envia.*atras|manda.*atras/.test(t)){c.sendToBack(target);if(api().state.photo)c.sendToBack(api().state.photo);local=true;}
      if(/desbloquea/.test(t)){target.userLocked=false;target.set({selectable:true,evented:true});local=true;}else if(/bloquea/.test(t)){target.userLocked=true;target.set({selectable:false,evented:false});local=true;}
      if(local){target.setCoords();changed++;}
    });
    if(changed){c.requestRenderAll();snapshot();remember(obj,'context');if(!obj.userLocked)activate(obj);say(changed===1?'Objeto actualizado.':`${changed} objetos actualizados.`);}else say('Seleccioné el objeto, pero no entendí qué cambio aplicar.','warn');
    return true;
  }
  return false;
}

function activate(obj){if(!obj)return false;const c=api().state.canvas;if(obj.userLocked||obj.selectable===false){say('Ese objeto está bloqueado. Desbloquéalo primero.','warn');return false;}api()?.setCanvasMode?.('move',{openPanel:false,announce:false});c.setActiveObject(obj);c.requestRenderAll();api().renderLayers();remember(obj,'selection');return true;}
function splitCommands(raw){
  const protectedQuotes=[];let safe=raw.replace(/["“”'][^"“”']+["“”']/g,m=>{protectedQuotes.push(m);return `__QUOTE_${protectedQuotes.length-1}__`;});
  safe=safe.replace(/\s+(?:y\s+luego|despues|luego|a continuacion)\s+/gi,';').replace(/\s*;\s*/g,';').replace(/\s*,\s*(?=(?:agrega|anade|pon|crea|haz|selecciona|elimina|borra|duplica|mueve|gira|cambia|ahora|y\s+un|y\s+una)\b)/gi,';');
  return safe.split(';').map(s=>s.replace(/__QUOTE_(\d+)__/g,(_,i)=>protectedQuotes[Number(i)]).replace(/^\s*y\s+/i,'').trim()).filter(Boolean);
}
function macros(){try{return JSON.parse(localStorage.getItem(MACRO_KEY)||'{}')}catch(_){return {}}}
function saveMacros(value){localStorage.setItem(MACRO_KEY,JSON.stringify(value));renderMacros();}
function renderMacros(){
  const host=$('brain-macros');if(!host)return;const data=macros(),names=Object.keys(data);host.innerHTML='';host.hidden=!names.length;
  if(!names.length)return;const title=document.createElement('strong');title.textContent='Macros';host.appendChild(title);
  names.forEach(name=>{const wrap=document.createElement('span');const run=document.createElement('button');run.type='button';run.textContent=`▶ ${name}`;run.onclick=()=>execute(`aplica macro ${name}`);const del=document.createElement('button');del.type='button';del.className='macro-delete';del.textContent='×';del.title='Eliminar macro';del.onclick=()=>{const all=macros();delete all[name];saveMacros(all);say(`Macro “${name}” eliminada.`);};wrap.append(run,del);host.appendChild(wrap);});
}
function extractMacro(raw,t){
  const apply=t.match(/^(?:aplica|ejecuta|usa|corre)\s+(?:la\s+)?macro\s+(.+)$/);if(apply)return {mode:'apply',name:apply[1].trim()};
  const save=raw.match(/^(?:guarda|crea|graba)\s+(?:esta\s+)?(?:secuencia\s+)?(?:como\s+)?macro\s+["“”']?([^:"“”']+)["“”']?\s*:\s*(.+)$/i);if(save)return {mode:'save',name:save[1].trim(),commands:save[2].trim()};
  const save2=raw.match(/^(?:guarda|crea|graba)\s+(?:esta\s+)?(?:secuencia\s+)?como\s+["“”']([^"“”']+)["“”']\s*:\s*(.+)$/i);if(save2)return {mode:'save',name:save2[1].trim(),commands:save2[2].trim()};return null;
}

register({name:'selection',score:t=>/selecciona|escoge|elige|toca/.test(t)&&targetKind(t)?120:0,run(t){const obj=findTarget(t);if(!obj)return say('No encontré ese tipo de objeto.','warn');if(activate(obj))say(`${objectKind(obj)} seleccionado.`);}});
register({name:'context',score:t=>/^(?:ahora\s+)?(?:hazlo|ponlo|cambialo|muevelo|giralo|rotalo|duplicalo|eliminalo|borralo|bloquealo|desbloquealo)|mas grande|mas pequeno/.test(t)?115:0,run(t){
  const o=currentObject();if(!o)return say('No hay un objeto anterior para modificar. Selecciona uno primero.','warn');if(!activate(o))return;
  const c=api().state.canvas,colors=parseColors(t);let changed=false;
  if(/mas grande|agrand|enorme/.test(t)){o.scaleX=(o.scaleX||1)*1.25;o.scaleY=(o.scaleY||1)*1.25;changed=true;}
  if(/mas pequeno|reduce|achica/.test(t)){o.scaleX=(o.scaleX||1)*.8;o.scaleY=(o.scaleY||1)*.8;changed=true;}
  if(colorMatches(t).length){if(objectKind(o)==='texto'||objectKind(o)==='sticker')o.set('fill',colors.fill);else{o.set('stroke',colors.stroke);if(!/borde|contorno/.test(t))o.set('fill',colors.fill);}changed=true;}
  if(/sin relleno|transparente/.test(t)){o.set('fill','rgba(0,0,0,0)');changed=true;}
  const angle=t.match(/(?:gira|giralo|rota|rotalo)\s*(?:a|de)?\s*(-?\d+)?/);if(angle){o.rotate((o.angle||0)+Number(angle[1]||15));changed=true;}
  const pos=parsePosition(t,c,o.getScaledWidth?.()||0,o.getScaledHeight?.()||0);if(/arriba|abajo|izquierda|derecha|centro/.test(t)){o.set(pos);changed=true;}
  if(/duplica/.test(t)){o.clone(cl=>{cl.set({left:(o.left||0)+18,top:(o.top||0)+18});cl.layerId=layerId();cl.layerName=(o.layerName||'Objeto')+' copia';cl.userLocked=false;addAndSelect(cl,'context');});return say('Objeto duplicado.');}
  if(/elimina|borra/.test(t)){c.remove(o);c.discardActiveObject();c.requestRenderAll();snapshot();brainState.lastObjectId=null;persistContext();return say('Objeto eliminado.');}
  if(/desbloquea/.test(t)){o.userLocked=false;o.set({selectable:true,evented:true});changed=true;}else if(/bloquea/.test(t)){o.userLocked=true;o.set({selectable:false,evented:false});c.discardActiveObject();changed=true;}
  if(changed){o.setCoords();c.requestRenderAll();snapshot();remember(o,'context');say('Objeto actualizado.');}else say('No identifiqué qué cambio hacerle al objeto.','warn');
}});
register({name:'photo-critic',score:t=>/(cara|rostro).*(oscura|sombra|clara|quemada|brillante)|menos cansad|ojeras|solo.*fondo|mejora.*fondo|solo.*piel|identificacion|credencial|pasaporte|regresa.*fondo|restaura.*fondo/.test(t)?180:0,run(t,raw){Promise.resolve(api().executeLegacyCommand(raw)).catch(err=>say(err?.message||'No pude completar la edición regional.','error'));}});
register({name:'filters',score:t=>/blanco y negro|escala de grises|profesional|retrato|vibrante|mas color|brillo|contraste|nitidez|desenfoc/.test(t)?100:0,run(t){
  if(/blanco y negro|escala de grises/.test(t))api().applyPreset('bw');else if(/profesional|mejora/.test(t))api().applyPreset('professional');else if(/retrato/.test(t))api().applyPreset('portrait');else if(/vibrante|mas color/.test(t))api().applyPreset('vivid');
  else if(/brillo/.test(t)){const el=$('brightness'),delta=/menos|baja|reduce|oscure/.test(t)?-20:20;el.value=Math.max(-100,Math.min(100,Number(el.value)+delta));api().applySlider('brightness',el.value,true);}
  else if(/contraste/.test(t)){const el=$('contrast'),delta=/menos|baja|reduce/.test(t)?-20:20;el.value=Math.max(-100,Math.min(100,Number(el.value)+delta));api().applySlider('contrast',el.value,true);}
  else if(/nitidez/.test(t)){const el=$('sharpness');el.value=Math.min(100,Number(el.value)+20);api().applySlider('sharpness',el.value,true);}else if(/desenfoc/.test(t)){const el=$('blur');el.value=Math.min(20,Number(el.value)+5);api().applySlider('blur',el.value,true);}brainState.lastPlugin='filters';say('Ajuste aplicado.');
}});
register({name:'text',score:(t,raw)=>(/texto|que diga|escribe/.test(t)&&(/agrega|anade|pon|crear|crea|escribe/.test(t)||/["“”'][^"“”']+["“”']/.test(raw)))?95:0,run(t,raw){
  const value=quoted(raw)||'Tu texto',c=api().state.canvas,colors=parseColors(t),fill=colors.fill==='rgba(0,0,0,0)'?'#ffffff':colors.fill,size=/enorme|gigante/.test(t)?86:/titulo|grande/.test(t)?64:/pequeno/.test(t)?30:44,pos=parsePosition(t,c,300,size*1.3);
  const obj=new fabric.IText(value,{...pos,originX:'center',originY:'center',fontSize:size,fontWeight:/negrita|bold|titulo/.test(t)?'bold':'normal',fontStyle:/cursiva|italic/.test(t)?'italic':'normal',underline:/subrayad/.test(t),fill,opacity:parseOpacity(t),stroke:/contorno|borde/.test(t)?colors.stroke:null,strokeWidth:/contorno|borde/.test(t)?2:0,textAlign:/derecha/.test(t)?'right':/centro|centrad/.test(t)?'center':'left'});
  obj.layerId=layerId();obj.layerName=`Texto: ${value.slice(0,18)}`;obj.layerType='text';addAndSelect(obj,'text');say(`Texto “${value}” agregado.`);
}});
register({name:'sticker',score:t=>/sticker|emoji/.test(t)&&/agrega|anade|pon|crear|crea/.test(t)?93:0,run(t){
  const map={flecha:'➡️',corazon:'❤️',fiesta:'🎉',fuego:'🔥',estrella:'⭐',sonrisa:'😀',camara:'📷',trabajo:'🚧',check:'✅'};let emoji='😀';for(const [word,value] of Object.entries(map))if(t.includes(word)){emoji=value;break;}const c=api().state.canvas,pos=parsePosition(t,c,110,110);const obj=new fabric.Text(emoji,{...pos,originX:'center',originY:'center',fontSize:/grande|enorme/.test(t)?120:/pequeno/.test(t)?48:82,opacity:parseOpacity(t)});obj.layerId=layerId();obj.layerName=`Sticker ${emoji}`;obj.layerType='sticker';addAndSelect(obj,'sticker');say('Sticker agregado.');
}});
register({name:'shape',score:t=>/cuadrado|cuadro|rectangulo|circulo|triangulo|flecha|linea/.test(t)?90:0,run(t){
  const c=api().state.canvas;let type=/circulo/.test(t)?'circle':/triangulo/.test(t)?'triangle':/flecha/.test(t)?'arrow':/linea/.test(t)?'line':/rectangulo/.test(t)?'rectangle':'square';const colors=parseColors(t),size=parseSize(t,type),opacity=parseOpacity(t),strokeWidth=parseNumber(t,['grosor','borde','contorno'],/muy grues|extra grues/.test(t)?14:/grues/.test(t)?8:/delgad/.test(t)?2:4,1,40),pos=parsePosition(t,c,size.w,size.h),common={...pos,originX:'center',originY:'center',fill:colors.fill,stroke:colors.stroke,strokeWidth,opacity};let obj,name;
  if(type==='circle'){obj=new fabric.Circle({...common,radius:size.w/2});name='Círculo';}else if(type==='triangle'){obj=new fabric.Triangle({...common,width:size.w,height:size.h});name='Triángulo';}else if(type==='arrow'){const line=new fabric.Line([-size.w/2,0,size.w/2-28,0],{stroke:colors.stroke,strokeWidth,opacity});const head=new fabric.Triangle({left:size.w/2-12,top:0,width:Math.max(22,strokeWidth*3),height:Math.max(28,strokeWidth*4),angle:90,originX:'center',originY:'center',fill:colors.stroke,stroke:colors.stroke,opacity});obj=new fabric.Group([line,head],{...pos,originX:'center',originY:'center',opacity});obj.photoColor=colors.stroke;obj.stroke=colors.stroke;obj.fill=colors.stroke;name='Flecha';}
  else if(type==='line'){obj=new fabric.Line([-size.w/2,0,size.w/2,0],{...pos,originX:'center',originY:'center',stroke:colors.stroke,strokeWidth,opacity,fill:null});name='Línea';}else{const square=type==='square';obj=new fabric.Rect({...common,width:size.w,height:square?size.w:size.h,rx:/redondead/.test(t)?parseNumber(t,['radio','esquinas'],22,0,100):0,ry:/redondead/.test(t)?parseNumber(t,['radio','esquinas'],22,0,100):0});name=square?'Cuadrado':'Rectángulo';}
  if(/puntead/.test(t))obj.set('strokeDashArray',[4,8]);else if(/discontinu|rayad/.test(t))obj.set('strokeDashArray',[14,9]);if(/rotad|inclinado/.test(t)){const m=t.match(/(?:rotado|inclinado)\s*(\d+)?/);obj.set('angle',m?Number(m[1]||15):15);}obj.layerId=layerId();obj.layerName=name;obj.layerType='shape';addAndSelect(obj,'shape');say(`${name} ${colorName(colors.stroke)} agregado.`);
}});
register({name:'layers',score:t=>/duplica|duplicar|elimina|borrar capa|trae al frente|manda atras|envia atras|bloquea|desbloquea/.test(t)?85:0,run(t){
  const c=api().state.canvas,o=findTarget(t);if(!o)return say('No encontré un objeto para esa acción.','warn');if(!activate(o)&&!/desbloquea/.test(t))return;
  if(/duplica/.test(t)){o.clone(cl=>{cl.set({left:(o.left||0)+18,top:(o.top||0)+18});cl.layerId=layerId();cl.layerName=(o.layerName||'Objeto')+' copia';cl.userLocked=false;addAndSelect(cl,'layers');});return say('Objeto duplicado.');}
  if(/elimina|borrar capa/.test(t)){c.remove(o);c.discardActiveObject();c.requestRenderAll();snapshot();brainState.lastObjectId=null;persistContext();return say('Objeto eliminado.');}
  if(/frente/.test(t))c.bringToFront(o);else if(/atras/.test(t)){c.sendToBack(o);if(api().state.photo)c.sendToBack(api().state.photo);}else if(/desbloquea/.test(t)){o.userLocked=false;o.set({selectable:true,evented:true});}else if(/bloquea/.test(t)){o.userLocked=true;o.set({selectable:false,evented:false});c.discardActiveObject();}c.requestRenderAll();snapshot();remember(o,'layers');say('Capa actualizada.');
}});
register({name:'transform',score:t=>/gira|rotar|espejo|voltea|recorta/.test(t)?70:0,run(t){if(/derecha/.test(t))api().rotate(90);else if(/izquierda/.test(t))api().rotate(-90);else if(/espejo|voltea/.test(t))api().flip();else if(/recorta/.test(t))api().openCrop(/cuadrad|1:1/.test(t)?1:NaN);say('Transformación preparada.');}});
register({name:'future-ai',score:t=>/cabello|pelo|peinado|ropa|outfit|face swap|intercambia.*cara|cambiar fondo|quita.*fondo|borra.*objeto/.test(t)?60:0,run(t){const module=/cabello|pelo|peinado/.test(t)?'Hair Studio':/ropa|outfit/.test(t)?'Outfit Studio':/face swap|intercambia.*cara/.test(t)?'Face Swap':/fondo/.test(t)?'Background Studio':'Magic Eraser';say(`${module} quedó identificado. Falta conectar el modelo generativo para ejecutar ese cambio.`,'info');}});

function executeSingle(raw){
  logConversation('user',raw);
  const t=normalize(raw);if(!t)return say('Escribe lo que quieres hacer.','warn');
  const macro=extractMacro(raw,t);if(macro){
    if(macro.mode==='save'){const all=macros();all[macro.name]=macro.commands;saveMacros(all);return say(`Macro “${macro.name}” guardada.`);}
    const commands=macros()[macro.name];if(!commands)return say(`No existe una macro llamada “${macro.name}”.`,'warn');return execute(commands,{fromMacro:macro.name});
  }
  if(runPriorityIntent(t,raw))return;
  renderDebug({intent:detectIntent(t),kind:targetKind(t)||'acción',color:colorMatches(t)[0]?.name||'cualquiera',matches:0});
  const ranked=registry.map(p=>({p,score:p.score(t,raw)})).sort((a,b)=>b.score-a.score);if(!ranked[0]||ranked[0].score<=0){api().executeLegacyCommand(raw);return;}
  try{brainState.lastCommand=raw;brainState.lastPlugin=ranked[0].p.name;persistContext();ranked[0].p.run(t,raw);}catch(err){console.error(err);say('No pude completar esa acción. Prueba con una instrucción más sencilla.','error');}
}
function execute(raw,options={}){
  if(!ready())return renderMessage('Abre una foto primero.','warn');
  const normalized=normalize(raw);
  const macroDefinition=extractMacro(raw,normalized);
  if(macroDefinition?.mode==='save')return executeSingle(raw);
  const parts=splitCommands(raw);if(parts.length<=1)return executeSingle(raw);
  brainState.batch={messages:[],type:'ok'};parts.forEach(executeSingle);const batch=brainState.batch;brainState.batch=null;
  const completed=batch.messages.length;const prefix=options.fromMacro?`Macro “${options.fromMacro}”`: `${completed} acción${completed===1?'':'es'}`;renderMessage(`${prefix} completada${completed===1?'':'s'}. ${batch.messages.join(' ')}`.trim(),batch.type);
}
function boot(){
  const input=$('command-input'),button=$('command-btn');if(!input||!button)return;button.onclick=()=>execute(input.value);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();execute(input.value);}};input.placeholder='Ej.: agrega un círculo azul; ahora hazlo más grande; luego muévelo arriba…';
  const panel=input.closest('.command-panel');if(panel&&!$('brain-examples')){const x=document.createElement('div');x.id='brain-examples';x.className='brain-examples';x.innerHTML='<button>Agrega un cuadro rojo; ahora sin relleno; luego hazlo más grande</button><button>Selecciona todos los círculos azules</button><button>Elimina todos los stickers</button>';x.querySelectorAll('button').forEach(b=>b.onclick=()=>{input.value=b.textContent;execute(b.textContent);});panel.appendChild(x);}
  if(panel&&!$('brain-macros')){const m=document.createElement('div');m.id='brain-macros';m.className='brain-macros';m.hidden=true;panel.appendChild(m);}renderMacros();const c=api().state.canvas;c.on('selection:created',e=>{const o=e.selected?.[0]||c.getActiveObject();if(o&&o.photoRole!=='main')remember(o,'selection');});c.on('selection:updated',e=>{const o=e.selected?.[0]||c.getActiveObject();if(o&&o.photoRole!=='main')remember(o,'selection');});window.PhotoBrain={version:VERSION,register,execute,plugins:registry,parseColors,parsePosition,splitCommands,macros};
}
let booted=false;function safeBoot(){if(booted)return;if(window.PhotoIA?.state?.canvas){booted=true;boot();return;}setTimeout(safeBoot,80);}window.addEventListener('photoia-ready',safeBoot,{once:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',safeBoot,{once:true});else safeBoot();
})();
