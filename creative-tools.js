(() => {
'use strict';
const $=id=>document.getElementById(id);
const onReady=()=>{
  const api=window.PhotoIA;
  if(!api?.state?.canvas) return;
  const canvas=api.state.canvas;
  const safeSnapshot=()=>{api.snapshot();api.renderLayers();};
  const center=()=>({left:canvas.width/2,top:canvas.height/2,originX:'center',originY:'center'});
  const decorate=(obj,name,type)=>{obj.layerId=api.nextLayerId();obj.layerName=name;obj.layerType=type;return obj};

  document.querySelectorAll('.creative-tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.creative-tab').forEach(x=>x.classList.toggle('active',x===btn));
    document.querySelectorAll('.creative-pane').forEach(p=>p.classList.toggle('active',p.dataset.toolPane===btn.dataset.toolTab));
  }));

  const outputPair=(id,suffix='')=>{
    const input=$(id),out=$(id+'-out');
    if(input&&out) input.addEventListener('input',()=>out.textContent=input.value+suffix);
  };
  ['text-size','text-stroke-width','brush-size','shape-stroke-width'].forEach(id=>outputPair(id));
  ['object-opacity','brush-opacity'].forEach(id=>outputPair(id,'%'));

  function selected(){return canvas.getActiveObject()}
  function updateSelection(){
    const obj=selected();
    $('selected-object-name').textContent=obj ? (obj.layerName||obj.type||'Objeto') : 'Ninguno';
    const editable=!!obj&&obj.photoRole!=='main';
    $('bring-front').disabled=!editable;$('send-back').disabled=!editable;
    if(obj&&obj.photoRole!=='main'){
      $('object-opacity').value=Math.round((obj.opacity??1)*100);$('object-opacity-out').textContent=$('object-opacity').value+'%';
      if(obj.type==='i-text'||obj.type==='text'){
        $('text-value').value=obj.text||'';$('text-font').value=[...$('text-font').options].some(o=>o.value===obj.fontFamily)?obj.fontFamily:'Arial';
        $('text-size').value=Math.round(obj.fontSize||48);$('text-size-out').textContent=$('text-size').value;
        $('text-color').value=normalizeColor(obj.fill,'#ffffff');$('text-stroke').value=normalizeColor(obj.stroke,'#111111');
        $('text-stroke-width').value=Math.round(obj.strokeWidth||0);$('text-stroke-width-out').textContent=$('text-stroke-width').value;
        $('text-shadow').checked=!!obj.shadow;
      }
    }
  }
  function normalizeColor(value,fallback){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback}
  function applyToSelected(prop,value){const obj=selected();if(!obj||obj.photoRole==='main')return;obj.set(prop,value);obj.setCoords();canvas.requestRenderAll()}
  function commitSelected(){const obj=selected();if(!obj||obj.photoRole==='main')return;safeSnapshot()}

  canvas.on('selection:created',updateSelection);canvas.on('selection:updated',updateSelection);canvas.on('selection:cleared',updateSelection);
  canvas.on('object:modified',()=>{safeSnapshot();updateSelection()});

  $('create-text').onclick=()=>{
    const text=decorate(new fabric.IText($('text-value').value||'Tu texto',{
      ...center(),fontFamily:$('text-font').value,fontSize:Number($('text-size').value),fontWeight:'bold',
      fill:$('text-color').value,stroke:$('text-stroke').value,strokeWidth:Number($('text-stroke-width').value),
      opacity:Number($('object-opacity').value)/100,
      shadow:$('text-shadow').checked?new fabric.Shadow({color:'rgba(0,0,0,.45)',blur:12,offsetX:4,offsetY:5}):null
    }),'Texto','text');
    canvas.add(text);canvas.setActiveObject(text);canvas.requestRenderAll();safeSnapshot();api.toast('Texto agregado');
  };
  // Existing quick text button opens text tab instead of adding generic text.
  if($('add-text')) $('add-text').onclick=()=>document.querySelector('[data-tool-tab="text"]').click();
  if($('add-sticker')) $('add-sticker').onclick=()=>document.querySelector('[data-tool-tab="stickers"]').click();

  const textBindings={
    'text-value':['text','input'],'text-font':['fontFamily','change'],'text-size':['fontSize','input'],
    'text-color':['fill','input'],'text-stroke':['stroke','input'],'text-stroke-width':['strokeWidth','input']
  };
  Object.entries(textBindings).forEach(([id,[prop,event]])=>$(id).addEventListener(event,()=>{
    const obj=selected();if(!obj||!['i-text','text'].includes(obj.type))return;
    let value=$(id).value;if(['fontSize','strokeWidth'].includes(prop))value=Number(value);applyToSelected(prop,value);
  }));
  ['text-value','text-font','text-size','text-color','text-stroke','text-stroke-width'].forEach(id=>$(id).addEventListener('change',commitSelected));
  $('text-shadow').addEventListener('change',()=>{const obj=selected();if(!obj||!['i-text','text'].includes(obj.type))return;obj.set('shadow',$('text-shadow').checked?new fabric.Shadow({color:'rgba(0,0,0,.45)',blur:12,offsetX:4,offsetY:5}):null);canvas.requestRenderAll();commitSelected()});
  $('object-opacity').addEventListener('input',()=>applyToSelected('opacity',Number($('object-opacity').value)/100));
  $('object-opacity').addEventListener('change',commitSelected);

  function drawing(mode){
    canvas.isDrawingMode=true;document.body.classList.add('drawing-active');
    const alpha=Number($('brush-opacity').value)/100;
    const color=hexToRgba($('brush-color').value,mode==='marker'?Math.min(alpha,.35):alpha);
    canvas.freeDrawingBrush.color=color;canvas.freeDrawingBrush.width=Number($('brush-size').value)*(mode==='marker'?2:1);
    api.toast(mode==='marker'?'Marcador activado':'Lápiz activado');
  }
  function hexToRgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`}
  $('draw-pencil').onclick=()=>drawing('pencil');$('draw-marker').onclick=()=>drawing('marker');
  $('draw-off').onclick=()=>{canvas.isDrawingMode=false;document.body.classList.remove('drawing-active');api.toast('Dibujo terminado')};
  canvas.on('path:created',e=>{decorate(e.path,'Trazo','drawing');safeSnapshot()});
  $('clear-drawing').onclick=()=>{const paths=canvas.getObjects().filter(o=>o.layerType==='drawing');paths.forEach(o=>canvas.remove(o));canvas.requestRenderAll();safeSnapshot();api.toast('Trazos eliminados')};

  function addShape(kind){
    const common={...center(),fill:$('shape-fill').value,stroke:$('shape-stroke').value,strokeWidth:Number($('shape-stroke-width').value),opacity:Number($('object-opacity').value)/100};
    let obj,name='Forma';
    if(kind==='rect'){obj=new fabric.Rect({...common,width:180,height:120,rx:12,ry:12});name='Rectángulo'}
    if(kind==='circle'){obj=new fabric.Circle({...common,radius:72});name='Círculo'}
    if(kind==='triangle'){obj=new fabric.Triangle({...common,width:170,height:145});name='Triángulo'}
    if(kind==='line'){obj=new fabric.Line([-90,0,90,0],{...common,fill:null});name='Línea'}
    if(kind==='arrow'){
      const line=new fabric.Line([-90,0,65,0],{stroke:common.stroke,strokeWidth:Math.max(3,common.strokeWidth),originX:'center',originY:'center'});
      const head=new fabric.Triangle({left:80,top:0,width:28,height:34,fill:common.stroke,angle:90,originX:'center',originY:'center'});
      obj=new fabric.Group([line,head],common);name='Flecha';
    }
    decorate(obj,name,'shape');canvas.add(obj);canvas.setActiveObject(obj);canvas.requestRenderAll();safeSnapshot();api.toast(name+' agregado');
  }
  document.querySelectorAll('[data-add-shape]').forEach(b=>b.onclick=()=>addShape(b.dataset.addShape));
  ['shape-fill','shape-stroke','shape-stroke-width'].forEach(id=>$(id).addEventListener('input',()=>{
    const obj=selected();if(!obj||obj.layerType!=='shape')return;
    if(id==='shape-fill')obj.set('fill',$(id).value);
    if(id==='shape-stroke')obj.set('stroke',$(id).value);
    if(id==='shape-stroke-width')obj.set('strokeWidth',Number($(id).value));
    canvas.requestRenderAll();
  }));
  ['shape-fill','shape-stroke','shape-stroke-width'].forEach(id=>$(id).addEventListener('change',commitSelected));

  document.querySelectorAll('[data-sticker]').forEach(b=>b.onclick=()=>{
    const emoji=b.dataset.sticker;const obj=decorate(new fabric.Text(emoji,{...center(),fontSize:82}),'Sticker '+emoji,'sticker');
    canvas.add(obj);canvas.setActiveObject(obj);canvas.requestRenderAll();safeSnapshot();api.toast('Sticker agregado');
  });

  $('bring-front').onclick=()=>{const obj=selected();if(!obj||obj.photoRole==='main')return;canvas.bringToFront(obj);canvas.requestRenderAll();safeSnapshot()};
  $('send-back').onclick=()=>{const obj=selected();if(!obj||obj.photoRole==='main')return;canvas.sendToBack(obj);if(api.state.photo)canvas.sendToBack(api.state.photo);canvas.requestRenderAll();safeSnapshot()};

  updateSelection();
};
window.addEventListener('photoia-ready',onReady,{once:true});
})();
