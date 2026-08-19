(() => {
'use strict';
const VERSION='15.31.2';
const categoryMap={
 home:['.command-panel','.quick-actions'],smart:['.smart-core-panel','.vision-panel'],adjust:['.tools','.transform'],
 create:['.creative-panel','#object-inspector','.layers-panel'],ai:['#ai-studio'],export:['.export']
};
const $=id=>document.getElementById(id);

function button(icon,label,id){const b=document.createElement('button');b.type='button';b.className='pro-dock-item';b.id=id;b.innerHTML=`<span>${icon}</span><small class="pro-dock-label">${label}</small>`;b.setAttribute('aria-label',label);return b}
function createCard(icon,title,copy,action){const b=document.createElement('button');b.type='button';b.className='module-card';b.innerHTML=`<span>${icon}</span><div><strong>${title}</strong><small>${copy}</small></div>`;if(action)b.addEventListener('click',action);return b}

function initAdaptiveWorkspace(){
 const main=document.querySelector('.app-shell > main'),workspace=main?.querySelector('.workspace'),oldTabs=$('studio-tabs'),modeToolbar=$('mode-toolbar');
 if(!main||!workspace||!oldTabs||!modeToolbar)return;
 document.body.classList.add('photoia-pro-ui','photoia-modern-ui','photoia-adaptive-ui');main.classList.add('pro-stage');
 const allPanels=[...main.querySelectorAll(':scope > section.panel')],toolPanels=allPanels.filter(p=>p!==workspace);
 const stage=document.createElement('div');stage.className='pro-editor-stage';main.insertBefore(stage,main.firstChild);stage.appendChild(workspace);
 const sheet=document.createElement('aside');sheet.className='pro-tool-sheet';sheet.id='pro-tool-sheet';sheet.hidden=true;sheet.dataset.snap='medium';sheet.innerHTML=`
  <div class="sheet-grabber" aria-hidden="true"></div><div class="pro-sheet-head"><div><small>PHOTO IA ${VERSION}</small><strong id="pro-sheet-title">Herramientas</strong></div>
  <div class="sheet-actions"><button id="sheet-size" type="button" aria-label="Cambiar tamaño">↕</button><button id="pro-sheet-close" type="button" aria-label="Cerrar panel">×</button></div></div>
  <div id="pro-create-tools" class="pro-create-tools" hidden><span>Herramientas</span></div><div id="pro-sheet-content" class="pro-sheet-content"></div>`;
 document.body.appendChild(sheet);const content=$('pro-sheet-content'),createTools=$('pro-create-tools');toolPanels.forEach(p=>{p.classList.add('pro-tool-panel');content.appendChild(p)});
 const dock=document.createElement('nav');dock.className='pro-dock pro-dock-left';dock.setAttribute('aria-label','Módulos de PHOTO IA');document.body.appendChild(dock);
 const nav=[...oldTabs.querySelectorAll('[data-studio-tab]')],titles={home:'Inicio',smart:'Smart',adjust:'Ajustes',create:'Crear',ai:'Alienware',export:'Guardar'};
 nav.forEach(b=>{b.classList.remove('studio-tab');b.classList.add('pro-dock-item','pro-nav-item');b.querySelector('small')?.classList.add('pro-dock-label');dock.appendChild(b)});oldTabs.remove();
 const modes=[...modeToolbar.querySelectorAll('[data-canvas-mode]')],erase=modes.find(b=>b.dataset.canvasMode==='erase'),createModes=modes.filter(b=>b!==erase);
 createModes.forEach(b=>{b.classList.remove('mode-tool','active');b.classList.add('pro-create-tool');createTools.appendChild(b)});modeToolbar.remove();
 if(erase){erase.remove();}
 // Useful main modules only.
 const clean=button('🧽','Limpiar','dock-clean'),select=button('🎯','Selección IA','dock-select'),history=button('📚','Historial','dock-history'),inspect=button('🔍','Inspector IA','dock-inspector'),share=button('📤','Compartir','dock-share'),lab=button('🧪','Lab','dock-lab'),compare=button('◐','Antes/Después','dock-compare');
 [clean,select,history,inspect,share,lab,compare].forEach(b=>dock.appendChild(b));compare.disabled=true;
 const originalCompare=$('compare-btn');compare.addEventListener('pointerdown',()=>originalCompare?.dispatchEvent(new PointerEvent('pointerdown')));['pointerup','pointerleave','pointercancel'].forEach(ev=>compare.addEventListener(ev,()=>originalCompare?.dispatchEvent(new PointerEvent(ev))));
 const sync=()=>compare.disabled=originalCompare?.disabled??true;if(originalCompare)new MutationObserver(sync).observe(originalCompare,{attributes:true});sync();

 Object.entries(categoryMap).forEach(([cat,sels])=>sels.forEach(sel=>content.querySelectorAll(sel).forEach(p=>p.dataset.studioCategory=cat)));toolPanels.forEach(p=>{if(!p.dataset.studioCategory)p.dataset.studioCategory='home'});
 let active=null,timer=null;
 const pulse=b=>{dock.querySelectorAll('.peek').forEach(x=>x.classList.remove('peek'));b?.classList.add('peek');clearTimeout(timer);timer=setTimeout(()=>b?.classList.remove('peek'),1500)};
 const clearCustom=()=>content.querySelectorAll('.custom-module').forEach(x=>x.remove());
 function showSheet(title){$('pro-sheet-title').textContent=title;sheet.hidden=false;document.body.classList.add('pro-sheet-open');requestLayout()}
 function openCategory(cat,trigger){clearCustom();active=cat;toolPanels.forEach(p=>p.hidden=p.dataset.studioCategory!==cat);nav.forEach(b=>b.classList.toggle('active',b.dataset.studioTab===cat));createTools.hidden=cat!=='create';showSheet(titles[cat]||'Herramientas');pulse(trigger)}
 function custom(title,node,trigger){toolPanels.forEach(p=>p.hidden=true);createTools.hidden=true;nav.forEach(b=>b.classList.remove('active'));clearCustom();node.classList.add('custom-module');content.prepend(node);showSheet(title);pulse(trigger)}
 nav.forEach(b=>b.addEventListener('click',e=>{e.preventDefault();const cat=b.dataset.studioTab;if(!sheet.hidden&&active===cat){close();return}openCategory(cat,b)}));
 function close(){sheet.hidden=true;document.body.classList.remove('pro-sheet-open');dock.querySelectorAll('.active').forEach(b=>b.classList.remove('active'));requestLayout()}
 $('pro-sheet-close').onclick=close;$('sheet-size').onclick=()=>{sheet.dataset.snap=sheet.dataset.snap==='compact'?'medium':sheet.dataset.snap==='medium'?'full':'compact';requestLayout()};

 clean.onclick=()=>custom('Limpiar y proyecto',buildClean(),clean);
 select.onclick=()=>custom('Selección IA',buildSelection(),select);
 history.onclick=()=>custom('Historial',buildHistory(),history);
 inspect.onclick=()=>custom('Inspector IA',buildInspector(),inspect);
 share.onclick=()=>custom('Compartir y exportar',buildShare(),share);
 lab.onclick=()=>custom('Laboratorio',buildLab(),lab);

 function buildClean(){const n=document.createElement('section');n.className='module-grid-wrap';n.innerHTML='<p class="module-intro">Limpia la imagen, administra el proyecto o comienza con otra fotografía.</p><div class="module-grid"></div>';const g=n.querySelector('.module-grid');
  g.append(createCard('🪄','Eliminar objeto','Marca un área y envíala a Alienware',()=>{openCategory('ai');window.PhotoIA?.toast('Describe el objeto que quieres eliminar.')}),createCard('👤','Eliminar persona','Usa Selección IA y Alienware',()=>{window.PhotoSegmentation?.segmentPerson?.();window.PhotoIA?.toast('Persona seleccionada. Usa Alienware para rellenar el fondo.')}),createCard('📝','Eliminar texto','Detectar y reparar texto',()=>{openCategory('ai');window.PhotoIA?.toast('Escribe: elimina el texto de la foto.')}),createCard('🖌','Borrador manual','Borra capas creadas manualmente',()=>{window.PhotoIA?.setCanvasMode?.('erase',{openPanel:true});openCategory('create')}),createCard('↩️','Deshacer','Regresa un paso',()=>window.PhotoIA?.undo?.()),createCard('↪️','Rehacer','Recupera el paso siguiente',()=>window.PhotoIA?.redo?.()),createCard('💾','Guardar cambios','Descarga la imagen actual',()=>window.PhotoIA?.download?.()),createCard('📷','Cambiar foto','Borra la actual y abre otra',()=>document.getElementById('new-photo-btn')?.click()),createCard('🔄','Restaurar original','Quita todas las ediciones',()=>window.PhotoIA?.reset?.()));return n}
 
function openSkinTonePanel(){
 const old=document.getElementById('photoia-skin-tone-modal');
 if(old)old.remove();

 const ensureSkin=async()=>{
   if(window.PhotoSegmentation?.isSkinMask?.())return true;
   window.PhotoIA?.toast?.('Seleccionando piel…');
   await window.PhotoSegmentation?.segmentSkin?.();
   return !!window.PhotoSegmentation?.isSkinMask?.();
 };

 ensureSkin().then(async ok=>{
   if(!ok){
     window.PhotoIA?.toast?.('No pude preparar la máscara de piel.');
     return;
   }

   window.PhotoSegmentation?.showMask?.(false);
   try{await window.PhotoSegmentation?.beginSkinToneSession?.();}catch(e){console.error(e);}

   const wrap=document.createElement('div');
   wrap.id='photoia-skin-tone-modal';
   wrap.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(3,10,24,.56);display:flex;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box;';
   wrap.innerHTML=`
     <div style="width:min(680px,100%);background:#fff;border-radius:26px 26px 18px 18px;box-shadow:0 -12px 50px rgba(0,0,0,.28);padding:16px 18px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box;">
       <div style="width:54px;height:5px;border-radius:999px;background:#94a3b8;margin:0 auto 14px;"></div>
       <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
         <div>
           <div style="font-size:.78rem;font-weight:900;letter-spacing:.12em;color:#f59e0b;">PHOTO IA 15.31.2</div>
           <div style="font-size:1.45rem;font-weight:900;color:#111827;margin-top:3px;">Retoque de piel</div>
         </div>
         <button id="skin-tone-x" type="button" style="border:0;background:#f1f5f9;border-radius:999px;width:42px;height:42px;font-size:26px;font-weight:800;">×</button>
       </div>

       <p style="font-size:1rem;line-height:1.35;color:#64748b;margin:12px 0 18px;">
         Aclara u oscurece únicamente la piel seleccionada.
       </p>

       <div style="display:flex;justify-content:space-between;align-items:center;font-weight:900;color:#111827;">
         <span>Intensidad</span>
         <span id="skin-tone-value" style="font-size:1.25rem;">0</span>
       </div>

       <input id="skin-tone-range" type="range" min="-100" max="100" value="0" step="1"
         style="display:block;width:100%;height:36px;margin:16px 0 4px;accent-color:#f59e0b;">

       <div style="display:flex;justify-content:space-between;color:#64748b;font-size:.9rem;font-weight:800;">
         <span>Oscurecer</span><span>Natural</span><span>Aclarar</span>
       </div>

       <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:10px;margin-top:20px;">
         <button id="skin-tone-cancel" type="button"
           style="padding:15px;border-radius:15px;border:1px solid #cbd5e1;background:#fff;font-size:1rem;font-weight:900;color:#334155;">
           Cancelar
         </button>
         <button id="skin-tone-apply" type="button"
           style="padding:15px;border-radius:15px;border:0;background:#f59e0b;font-size:1rem;font-weight:900;color:#111827;">
           Aplicar
         </button>
       </div>
     </div>`;
   document.body.appendChild(wrap);

   const range=wrap.querySelector('#skin-tone-range');
   const value=wrap.querySelector('#skin-tone-value');
   let timer=0,closed=false;

   const cancel=async()=>{
     if(closed)return;closed=true;
     clearTimeout(timer);
     await window.PhotoSegmentation?.cancelSkinTonePreview?.();
     wrap.remove();
   };

   const apply=async()=>{
     if(closed)return;
     const amount=Number(range.value);
     if(amount===0){
       window.PhotoIA?.toast?.('Mueve el slider para elegir una intensidad.');
       return;
     }
     closed=true;
     clearTimeout(timer);
     await window.PhotoSegmentation?.adjustSkinTone?.(amount);
     wrap.remove();
   };

   range.addEventListener('input',()=>{
     const n=Number(range.value);
     value.textContent=(n>0?'+':'')+n;
     clearTimeout(timer);
     timer=setTimeout(()=>window.PhotoSegmentation?.previewSkinTone?.(n),80);
   });

   wrap.querySelector('#skin-tone-x').onclick=cancel;
   wrap.querySelector('#skin-tone-cancel').onclick=cancel;
   wrap.querySelector('#skin-tone-apply').onclick=apply;
 });
}

async function openGarmentColorPanel(part){
 const map={
   upper:{label:'Camisa / Top',icon:'👕',fn:'segmentGarmentUpper'},
   lower:{label:'Pantalón / Shorts',icon:'👖',fn:'segmentGarmentLower'},
   shoes:{label:'Zapatos',icon:'👟',fn:'segmentGarmentShoes'},
   touch:{label:'Prenda seleccionada',icon:'☝️',fn:null}
 };
 const cfg=map[part];if(!cfg)return;
 if(cfg.fn){
   window.PhotoIA?.toast?.(`Detectando ${cfg.label.toLowerCase()}…`);
   await window.PhotoSegmentation?.[cfg.fn]?.();
 }
 if(!window.PhotoSegmentation?.mask){
   window.PhotoIA?.toast?.(`No pude separar ${cfg.label.toLowerCase()}.`);
   return;
 }
 window.PhotoSegmentation?.showMask?.(false);
 try{await window.PhotoSegmentation?.beginGarmentColorSession?.();}catch(e){console.error(e)}

 const old=document.getElementById('photoia-garment-color-modal');if(old)old.remove();
 const wrap=document.createElement('div');
 wrap.id='photoia-garment-color-modal';
 wrap.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(3,10,24,.56);display:flex;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box;';
 wrap.innerHTML=`
 <div style="width:min(680px,100%);background:#fff;border-radius:26px 26px 18px 18px;box-shadow:0 -12px 50px rgba(0,0,0,.28);padding:16px 18px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box;">
  <div style="width:54px;height:5px;border-radius:999px;background:#94a3b8;margin:0 auto 14px;"></div>
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
   <div><div style="font-size:.78rem;font-weight:900;letter-spacing:.12em;color:#f59e0b;">PHOTO IA 15.31.2</div><div style="font-size:1.4rem;font-weight:900;color:#111827">${cfg.icon} Color de ${cfg.label}</div></div>
   <button id="garment-x" type="button" style="border:0;background:#f1f5f9;border-radius:999px;width:42px;height:42px;font-size:26px;font-weight:800">×</button>
  </div>
  <p style="color:#64748b;line-height:1.35">Cambia solo esta prenda conservando sombras, pliegues, textura y logos visibles.</p>
  <label style="display:flex;justify-content:space-between;align-items:center;font-weight:900;color:#111827"><span>Color</span><input id="garment-color" type="color" value="#1d4ed8" style="width:64px;height:42px;border:0;background:none"></label>
  <label style="display:flex;justify-content:space-between;align-items:center;font-weight:900;color:#111827;margin-top:10px"><span>Intensidad</span><strong id="garment-int-value">75</strong></label>
  <input id="garment-intensity" type="range" min="0" max="100" value="75" step="1" style="display:block;width:100%;height:34px;accent-color:#f59e0b">
  <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:10px;margin-top:18px">
   <button id="garment-cancel" type="button" style="padding:15px;border-radius:15px;border:1px solid #cbd5e1;background:#fff;font-weight:900">Cancelar</button>
   <button id="garment-apply" type="button" style="padding:15px;border-radius:15px;border:0;background:#f59e0b;font-weight:900">Aplicar</button>
  </div>
 </div>`;
 document.body.appendChild(wrap);

 const color=wrap.querySelector('#garment-color'),range=wrap.querySelector('#garment-intensity'),value=wrap.querySelector('#garment-int-value');
 let timer=0,closed=false;
 const preview=()=>{clearTimeout(timer);timer=setTimeout(()=>window.PhotoSegmentation?.previewGarmentColor?.(color.value,Number(range.value)),80)};
 color.oninput=preview;
 range.oninput=()=>{value.textContent=range.value;preview()};
 const cancel=async()=>{if(closed)return;closed=true;clearTimeout(timer);await window.PhotoSegmentation?.cancelGarmentColorPreview?.();wrap.remove()};
 const apply=async()=>{if(closed)return;closed=true;clearTimeout(timer);await window.PhotoSegmentation?.applyGarmentColor?.(color.value,Number(range.value));wrap.remove()};
 wrap.querySelector('#garment-x').onclick=cancel;wrap.querySelector('#garment-cancel').onclick=cancel;wrap.querySelector('#garment-apply').onclick=apply;
 preview();
}
function openClothingColorChooser(){
 const old=document.getElementById('photoia-clothing-chooser');if(old)old.remove();
 const wrap=document.createElement('div');
 wrap.id='photoia-clothing-chooser';
 wrap.style.cssText='position:fixed;inset:0;z-index:2147483645;background:rgba(3,10,24,.50);display:flex;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box;';
 wrap.innerHTML=`
 <div style="width:min(680px,100%);background:#fff;border-radius:26px 26px 18px 18px;padding:16px 18px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box">
  <div style="display:flex;justify-content:space-between;align-items:center"><div><small style="font-weight:900;color:#f59e0b">PHOTO IA 15.31.2</small><h2 style="margin:3px 0">🎨 Cambiar color de ropa</h2></div><button id="cloth-x" style="border:0;background:#f1f5f9;border-radius:50%;width:42px;height:42px;font-size:26px">×</button></div>
  <p style="color:#64748b">PHOTO IA usa Pose Landmarker + la máscara de Ropa para separar cada prenda.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
   <button data-part="upper" class="secondary" style="padding:15px;border-radius:15px;font-weight:900">👕 Camisa / Top</button>
   <button data-part="lower" class="secondary" style="padding:15px;border-radius:15px;font-weight:900">👖 Pantalón / Shorts</button>
   <button data-part="shoes" class="secondary" style="padding:15px;border-radius:15px;font-weight:900">👟 Zapatos</button>
   <button id="cloth-touch" class="secondary" style="padding:15px;border-radius:15px;font-weight:900">☝️ Tocar prenda</button>
  </div>
 </div>`;
 document.body.appendChild(wrap);
 wrap.querySelector('#cloth-x').onclick=()=>wrap.remove();
 wrap.querySelectorAll('[data-part]').forEach(b=>b.onclick=async()=>{const part=b.dataset.part;wrap.remove();await openGarmentColorPanel(part)});
 wrap.querySelector('#cloth-touch').onclick=()=>{
   wrap.remove();
   const ready=()=>openGarmentColorPanel('touch');
   window.addEventListener('photoia-garment-touch-ready',ready,{once:true});
   window.PhotoSegmentation?.beginGarmentTapMode?.();
 };
}



async function openHairColorPanel(){
  if(!window.PhotoSegmentation?.mask || !/cabello|hair/i.test(String(window.PhotoSegmentation?.maskKind||''))){
    window.PhotoIA?.toast?.('Seleccionando cabello…');
    await window.PhotoSegmentation?.segmentHair?.();
  }
  if(!window.PhotoSegmentation?.mask){window.PhotoIA?.toast?.('No pude preparar la selección de cabello.');return;}
  window.PhotoSegmentation?.showMask?.(false);
  try{await window.PhotoSegmentation?.beginHairColorSession?.();}catch(e){console.error(e)}

  const old=document.getElementById('photoia-hair-color-modal');if(old)old.remove();
  const colors=[['#15110f','Negro'],['#2b1b14','Castaño oscuro'],['#4a2f22','Castaño medio'],['#76513a','Castaño claro'],['#7a3e2b','Auburn / rojizo natural'],['#8b6a47','Rubio oscuro'],['#c3a36a','Rubio'],['#6b6b68','Gris'],['#a8a8a4','Plateado'],['#dedbd2','Blanco']];
  const wrap=document.createElement('div');
  wrap.id='photoia-hair-color-modal';
  wrap.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(3,10,24,.56);display:flex;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box;';
  const swatches=colors.map(([hex,name],i)=>`<button type="button" class="hair-swatch" data-hair-color="${hex}" data-hair-name="${name}" aria-label="${name}" style="height:52px;border-radius:14px;border:${i===0?'3px solid #f59e0b':'2px solid #cbd5e1'};background:${hex};"></button>`).join('');
  wrap.innerHTML=`<div style="width:min(680px,100%);background:#fff;border-radius:26px 26px 18px 18px;padding:16px 18px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:.78rem;font-weight:900;letter-spacing:.12em;color:#f59e0b;">PHOTO IA 15.31.2</div><div style="font-size:1.4rem;font-weight:900">💇 Color de cabello</div></div><button id="hair-x" type="button" style="border:0;background:#f1f5f9;border-radius:999px;width:42px;height:42px;font-size:26px">×</button></div>
    <p style="color:#64748b">Elige un tono natural. No se usa el selector de colores del iPhone.</p>
    <div style="font-weight:900;margin-bottom:10px">Tono natural</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px">${swatches}</div>
    <div id="hair-color-name" style="color:#64748b;font-weight:800;margin-bottom:14px">Negro</div>
    <label style="display:flex;justify-content:space-between;font-weight:900"><span>Intensidad</span><strong id="hair-int-value">75</strong></label>
    <input id="hair-intensity" type="range" min="0" max="100" value="75" step="1" style="display:block;width:100%;height:34px;accent-color:#f59e0b">
    <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:10px;margin-top:18px"><button id="hair-cancel" type="button" style="padding:15px;border-radius:15px;border:1px solid #cbd5e1;background:#fff;font-weight:900">Cancelar</button><button id="hair-apply" type="button" style="padding:15px;border-radius:15px;border:0;background:#f59e0b;font-weight:900">Aplicar</button></div>
  </div>`;
  document.body.appendChild(wrap);

  const range=wrap.querySelector('#hair-intensity'),value=wrap.querySelector('#hair-int-value'),nameEl=wrap.querySelector('#hair-color-name');
  let timer=0,closed=false,selectedColor='#15110f';
  const preview=()=>{clearTimeout(timer);timer=setTimeout(()=>window.PhotoSegmentation?.previewHairColor?.(selectedColor,Number(range.value)),80)};
  wrap.querySelectorAll('.hair-swatch').forEach(btn=>btn.onclick=()=>{
    selectedColor=btn.dataset.hairColor;
    wrap.querySelectorAll('.hair-swatch').forEach(b=>b.style.border='2px solid #cbd5e1');
    btn.style.border='3px solid #f59e0b';
    nameEl.textContent=btn.dataset.hairName;
    preview();
  });
  range.oninput=()=>{value.textContent=range.value;preview()};
  const cancel=async()=>{if(closed)return;closed=true;clearTimeout(timer);await window.PhotoSegmentation?.cancelHairColorPreview?.();wrap.remove()};
  const apply=async()=>{if(closed)return;closed=true;clearTimeout(timer);await window.PhotoSegmentation?.applyHairColor?.(selectedColor,Number(range.value));wrap.remove()};
  wrap.querySelector('#hair-x').onclick=cancel;wrap.querySelector('#hair-cancel').onclick=cancel;wrap.querySelector('#hair-apply').onclick=apply;
  preview();
}

function buildSelection(){const n=document.createElement('section');n.className='module-grid-wrap';n.innerHTML='<p class="module-intro">Selecciona la parte exacta que quieres editar. La imagen completa puede volver a mostrarse sin perder los cambios.</p><div class="module-grid"></div>';const g=n.querySelector('.module-grid');
  g.append(createCard('🧍','Persona completa','Conserva todo el cuerpo visible',()=>window.PhotoSegmentation?.segmentPerson?.()),createCard('🪪','Busto / identificación','Silueta Persona + recorte por rostro',()=>window.PhotoSegmentation?.segmentBust?.()),createCard('🙂','Rostro preciso','Cara separada de cabello, piel y ropa',()=>window.PhotoSegmentation?.segmentFace?.()),createCard('✨','Piel','Piel facial + corporal por IA',()=>window.PhotoSegmentation?.segmentSkin?.()),createCard('☀️','Aclarar / oscurecer piel','Ajusta solo la piel seleccionada',()=>openSkinTonePanel()),createCard('💇','Cabello','Protección independiente del cabello',()=>window.PhotoSegmentation?.segmentHair?.()),createCard('🎨','Color de cabello','Cambia el tono sin perder textura',()=>openHairColorPanel()),createCard('👕','Ropa','Selecciona vestuario sin cara ni piel',()=>window.PhotoSegmentation?.segmentClothing?.()),createCard('🎨','Color de ropa','Camisa, pantalón o zapatos por separado',()=>openClothingColorChooser()),createCard('☝️','Objeto por toque','Toca el objeto en la foto',()=>window.PhotoSegmentation?.beginTapMode?.()),createCard('✂️','Refinar máscara','Recupera bordes y suaviza halos',()=>window.PhotoSegmentation?.refineCurrentMask?.()),createCard('👁','Mostrar máscara','Visualiza la selección',()=>window.PhotoSegmentation?.showMask?.(true)),createCard('🌄','Regresar fondo','Muestra la imagen completa y conserva cambios',()=>window.PhotoSegmentation?.restoreBackground?.()),createCard('🧹','Limpiar máscara','Elimina la selección actual',()=>window.PhotoSegmentation?.clearMask?.()),createCard('🩺','Diagnóstico motor','Worker, modelo, resolución y tiempos',()=>window.PhotoSegmentation?.showWorkerDiagnostics?.()));return n}
 function buildHistory(){const n=document.createElement('section');n.className='history-module';const h=window.PhotoIA?.state?.history||[];n.innerHTML=`<p class="module-intro">${h.length} estado${h.length===1?'':'s'} guardado${h.length===1?'':'s'}. Toca uno para regresar.</p><div class="history-timeline"></div>`;const list=n.querySelector('.history-timeline');h.forEach((json,i)=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<span>${i===0?'📷':'✦'}</span><div><strong>${i===0?'Original / inicio':`Edición ${i}`}</strong><small>${i===h.length-1?'Estado actual':'Toca para restaurar'}</small></div>`;b.onclick=()=>{window.PhotoIA?.restoreJSON?.(json);window.PhotoIA?.toast(`Restaurado al paso ${i}`)};list.appendChild(b)});if(!h.length)list.innerHTML='<p>Aún no hay historial.</p>';return n}
 function buildInspector(){const n=document.createElement('section');n.className='inspector-module';n.innerHTML='<p class="module-intro">Diagnóstico local y crítica fotográfica antes de editar.</p><div id="adaptive-inspector-results" class="inspector-results"><p>Pulsa analizar para medir la imagen.</p></div><button class="primary inspector-run">🔍 Analizar ahora</button><button class="secondary critic-run">🧠 Crítica fotográfica</button>';n.querySelector('.critic-run').onclick=async()=>{try{const a=await window.PhotoSmartCore?.analyze?.();window.PhotoIA?.toast(a?.critic?.summary||'Crítica lista')}catch(e){window.PhotoIA?.toast(e.message)}};n.querySelector('.inspector-run').onclick=async()=>{const r=n.querySelector('#adaptive-inspector-results');r.innerHTML='<p>Analizando…</p>';try{const c=window.PhotoIA?.getPhotoAnalysisCanvas?.(720);if(!c)throw Error('Abre una foto primero.');const ctx=c.getContext('2d'),d=ctx.getImageData(0,0,c.width,c.height).data;let lum=0,lum2=0,sat=0,dark=0,bright=0;for(let i=0;i<d.length;i+=4){const mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]),l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];lum+=l;lum2+=l*l;sat+=mx?((mx-mn)/mx):0;if(l<25)dark++;if(l>235)bright++}const px=d.length/4,mean=lum/px,std=Math.sqrt(Math.max(0,lum2/px-mean*mean));r.innerHTML=`<div class="metric-grid"><div><strong>${c.width}×${c.height}</strong><small>Análisis</small></div><div><strong>${Math.round(mean)}</strong><small>Luz media</small></div><div><strong>${Math.round(std)}</strong><small>Contraste</small></div><div><strong>${Math.round(sat/px*100)}%</strong><small>Saturación</small></div><div><strong>${(dark/px*100).toFixed(1)}%</strong><small>Sombras cerradas</small></div><div><strong>${(bright/px*100).toFixed(1)}%</strong><small>Luces altas</small></div></div>`}catch(e){r.innerHTML=`<p>${e.message}</p>`}};return n}
 function buildShare(){const n=document.createElement('section');n.className='module-grid-wrap';n.innerHTML='<p class="module-intro">Guarda, comparte o elige el formato desde el módulo de exportación.</p><div class="module-grid"></div>';const g=n.querySelector('.module-grid');g.append(createCard('💾','Guardar imagen','Descargar con la calidad elegida',()=>window.PhotoIA?.download?.()),createCard('📤','Compartir','Abrir hoja de compartir del teléfono',async()=>{try{const url=window.PhotoIA?.exportDataUrl?.();const blob=await(await fetch(url)).blob();const f=new File([blob],'PHOTO-IA.jpg',{type:blob.type});if(navigator.share&&navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'PHOTO IA'});else window.PhotoIA?.download?.()}catch(e){window.PhotoIA?.download?.()}}),createCard('⚙️','Formato y calidad','Abrir opciones avanzadas',()=>openCategory('export')));return n}
 function buildLab(){const n=document.createElement('section');n.className='module-grid-wrap';n.innerHTML='<p class="module-intro">Herramientas experimentales. Las funciones estables se moverán a sus módulos principales.</p><div class="module-grid"></div>';const g=n.querySelector('.module-grid');g.append(createCard('🧬','Segmentación avanzada','Selecciona por toque o persona',()=>custom('Selección IA',buildSelection(),select)),createCard('🖥️','Pruebas Alienware','Diagnóstico del servidor privado',()=>openCategory('ai')),createCard('🧠','Vision Lab','Detección de objetos y caras',()=>window.PhotoVision?.analyze?.()));return n}

 // Adaptive Workspace Engine
 const root=document.documentElement;
 function requestLayout(){requestAnimationFrame(layout)}
 function layout(){const vv=window.visualViewport,w=Math.round(vv?.width||innerWidth),h=Math.round(vv?.height||innerHeight),land=w>h;let device=w<430?'compact':w<768?'phone':w<1100?'tablet':'desktop';root.dataset.device=device;root.dataset.orientation=land?'landscape':'portrait';root.style.setProperty('--aw-vw',`${w}px`);root.style.setProperty('--aw-vh',`${h}px`);root.style.setProperty('--aw-dock',device==='compact'?'28px':device==='phone'?'32px':device==='tablet'?'42px':'48px');const open=!sheet.hidden,snap=sheet.dataset.snap||'medium';let panel=0;if(open){if(device==='desktop')panel=Math.min(430,Math.round(w*.30));else panel=snap==='compact'?Math.round(h*.27):snap==='full'?Math.round(h*.76):Math.round(h*(land?.42:.46))}root.style.setProperty('--aw-panel-size',`${panel}px`);root.style.setProperty('--aw-canvas-h',`${Math.max(300,h-(device==='desktop'?110:84))}px`);document.body.classList.toggle('aw-landscape',land);document.body.classList.toggle('aw-keyboard',vv?innerHeight-vv.height>140:false);window.dispatchEvent(new CustomEvent('photoia:workspace-layout',{detail:{w,h,device,land,panel}}))}
 window.addEventListener('resize',requestLayout);window.visualViewport?.addEventListener('resize',requestLayout);window.visualViewport?.addEventListener('scroll',requestLayout);new ResizeObserver(requestLayout).observe(document.body);requestLayout();
 document.addEventListener('photoia:image-loaded',()=>{compare.disabled=false;close();requestLayout()});document.addEventListener('photoia:preset-applied',()=>requestLayout());
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAdaptiveWorkspace,{once:true});else initAdaptiveWorkspace();
})();