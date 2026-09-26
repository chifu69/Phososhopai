(() => {
'use strict';
const VERSION='15.40.1';
const $=id=>document.getElementById(id);
const IDS=['smartselect-subjecthd','smartselect-person','smartselect-face','smartselect-hair','smartselect-skin','smartselect-object','smartselect-upper','smartselect-lower','smartselect-dress','smartselect-shoes','smartselect-show','smartselect-hide','smartselect-refine','smartselect-clear','smartselect-cutout','smartselect-aifill','smartselect-expand-btn','smartselect-shrink-btn','smartselect-soften-btn','smartselect-apply-edge','smartselect-invert','smartselect-largest'];
function boot(){
  const api=window.PhotoIA,seg=window.PhotoSegmentation;
  if(!api||!seg)return;
  const statusEl=$('smartselect-status'),statsEl=$('smartselect-stats');
  const edgeInput=$('smartselect-edge'),edgeOut=$('smartselect-edge-out'),softInput=$('smartselect-soften'),softOut=$('smartselect-soften-out');
  const setStatus=(text,kind='')=>{if(statusEl){statusEl.textContent=text;statusEl.dataset.kind=kind;}};
  const syncOutputs=()=>{if(edgeInput&&edgeOut)edgeOut.textContent=String(edgeInput.value); if(softInput&&softOut)softOut.textContent=String(softInput.value);};
  function renderStats(){
    if(!statsEl)return;
    const stats=seg.currentMaskStats?.();
    if(!stats||!stats.area){statsEl.innerHTML='<small>Sin máscara activa.</small>';return;}
    statsEl.innerHTML=`<div><strong>${stats.label}</strong><small>Activa</small></div><div><strong>${(stats.coverage*100).toFixed(1)}%</strong><small>Cobertura</small></div><div><strong>${stats.width}×${stats.height}</strong><small>Resolución</small></div>`;
  }
  const refresh=()=>{
    const hasPhoto=!!api.state?.photo;
    const hasMask=!!seg.mask;
    IDS.forEach(id=>{const el=$(id);if(!el)return;const needsMask=['smartselect-show','smartselect-hide','smartselect-refine','smartselect-clear','smartselect-cutout','smartselect-aifill','smartselect-expand-btn','smartselect-shrink-btn','smartselect-soften-btn','smartselect-apply-edge','smartselect-invert','smartselect-largest'].includes(id);el.disabled=!hasPhoto || (needsMask&&!hasMask);});
    if(edgeInput)edgeInput.disabled=!hasPhoto||!hasMask;
    if(softInput)softInput.disabled=!hasPhoto||!hasMask;
    if(!hasPhoto)setStatus('Abre una foto para empezar una selección inteligente local.');
    else if(seg.mask)setStatus(`Máscara lista: ${seg.maskKind||seg.mask.label||'Selección'}. Puedes afinar borde, invertir, aislar el objeto principal o enviarla a AI Fill.`,'ready');
    else setStatus('Prueba Sujeto HD, Persona, Cabello o Tocar objeto. Después afina la selección abajo.','');
    renderStats();
    syncOutputs();
  };
  async function run(label,fn,{tap=false}={}){
    try{
      if(!api.state?.photo){api.toast('Abre una foto primero.');refresh();return;}
      setStatus(label,'working');
      if(tap){fn();api.toast('Toca el centro del objeto en la foto');setStatus('Toca el centro del objeto en la foto para crear la selección.','working');return;}
      await fn();
      refresh();
    }catch(err){console.error(err);const msg=String(err?.message||err);setStatus(msg,'error');api.toast(msg);refresh();}
  }
  async function subjectHD(){
    try{await seg.segmentPerson();}catch(err){throw err;}
    try{await seg.refineCurrentMask?.();}catch(_){}
    try{await seg.growCurrentMask?.(1,'Sujeto HD');}catch(_){}
    try{await seg.softenCurrentMask?.(1,'Sujeto HD');}catch(_){}
  }
  async function applyEdgeRecipe(){
    const edge=Number(edgeInput?.value||0),soft=Math.max(0,Number(softInput?.value||0));
    if(edge>0)await seg.growCurrentMask?.(edge,'Selección afinada');
    else if(edge<0)await seg.shrinkCurrentMask?.(Math.abs(edge),'Selección afinada');
    if(soft>0)await seg.softenCurrentMask?.(soft,'Selección afinada');
    if(!edge && !soft){await seg.refineCurrentMask?.();}
  }
  function openAIFillTab(){
    document.querySelectorAll('.creative-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.toolTab==='aifill'));
    document.querySelectorAll('.creative-pane').forEach(p=>p.classList.toggle('active',p.dataset.toolPane==='aifill'));
  }
  $('smartselect-subjecthd')?.addEventListener('click',()=>run('Creando Sujeto HD…',subjectHD));
  $('smartselect-person')?.addEventListener('click',()=>run('Seleccionando persona…',()=>seg.segmentPerson()));
  $('smartselect-face')?.addEventListener('click',()=>run('Seleccionando rostro…',()=>seg.segmentFace()));
  $('smartselect-hair')?.addEventListener('click',()=>run('Seleccionando cabello…',()=>seg.segmentHair()));
  $('smartselect-skin')?.addEventListener('click',()=>run('Seleccionando piel…',()=>seg.segmentSkin()));
  $('smartselect-object')?.addEventListener('click',()=>run('Preparando selección por toque…',()=>seg.beginTapMode(),{tap:true}));
  $('smartselect-upper')?.addEventListener('click',()=>run('Seleccionando prenda superior…',()=>seg.segmentGarmentUpper()));
  $('smartselect-lower')?.addEventListener('click',()=>run('Seleccionando prenda inferior…',()=>seg.segmentGarmentLower()));
  $('smartselect-dress')?.addEventListener('click',()=>run('Seleccionando vestido…',()=>seg.segmentGarmentDress()));
  $('smartselect-shoes')?.addEventListener('click',()=>run('Seleccionando zapatos…',()=>seg.segmentGarmentShoes()));
  $('smartselect-show')?.addEventListener('click',()=>{seg.showMask(true);refresh();});
  $('smartselect-hide')?.addEventListener('click',()=>{seg.showMask(false);refresh();});
  $('smartselect-refine')?.addEventListener('click',()=>run('Refinando selección…',()=>seg.refineCurrentMask()));
  $('smartselect-clear')?.addEventListener('click',()=>{seg.clearMask();api.toast('Selección inteligente borrada');refresh();});
  $('smartselect-cutout')?.addEventListener('click',()=>run('Creando recorte…',()=>seg.createCutout()));
  $('smartselect-expand-btn')?.addEventListener('click',()=>run('Expandiendo selección…',()=>seg.growCurrentMask?.(Math.max(1,Math.abs(Number(edgeInput?.value||1))), 'Selección expandida')));
  $('smartselect-shrink-btn')?.addEventListener('click',()=>run('Encogiendo selección…',()=>seg.shrinkCurrentMask?.(Math.max(1,Math.abs(Number(edgeInput?.value||1))), 'Selección contraída')));
  $('smartselect-soften-btn')?.addEventListener('click',()=>run('Suavizando borde…',()=>seg.softenCurrentMask?.(Math.max(1,Number(softInput?.value||1)), 'Selección suavizada')));
  $('smartselect-apply-edge')?.addEventListener('click',()=>run('Aplicando afinado…',applyEdgeRecipe));
  $('smartselect-invert')?.addEventListener('click',()=>run('Invirtiendo selección…',()=>seg.invertCurrentMask?.()));
  $('smartselect-largest')?.addEventListener('click',()=>run('Conservando objeto principal…',()=>seg.keepLargestCurrentMask?.()));
  $('smartselect-aifill')?.addEventListener('click',()=>{
    try{
      const m=seg.mask;
      if(!m)throw new Error('Primero crea una selección.');
      if(!window.PhotoAIFill?.importMask)throw new Error('AI Fill no está disponible todavía.');
      window.PhotoAIFill.importMask(m.data,m.width,m.height,{label:seg.maskKind||m.label||'Selección IA'});
      openAIFillTab();
      api.setCanvasMode?.('aifill',{openPanel:false,announce:false});
      api.toast('Selección enviada a AI Fill');
      refresh();
    }catch(err){const msg=String(err?.message||err);setStatus(msg,'error');api.toast(msg);}
  });
  edgeInput?.addEventListener('input',syncOutputs);
  softInput?.addEventListener('input',syncOutputs);
  window.addEventListener('photoia:segmentation-mask-changed',refresh);
  window.addEventListener('photoia-garment-touch-ready',refresh);
  document.addEventListener('photoia:image-cleared',refresh);
  document.addEventListener('photoia:photo-replaced',refresh);
  document.addEventListener('photoia:canvas-mode-changed',refresh);
  refresh();
}
window.addEventListener('photoia-ready',boot,{once:true});
})();
