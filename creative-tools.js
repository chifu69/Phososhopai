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
  ['text-size','text-stroke-width','text-spacing','text-line-height','brush-size','shape-stroke-width'].forEach(id=>outputPair(id));
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
        $('text-align').value=obj.textAlign||'left';
        $('text-spacing').value=Math.round(obj.charSpacing||0);$('text-spacing-out').textContent=$('text-spacing').value;
        $('text-line-height').value=Number(obj.lineHeight||1.16).toFixed(2);$('text-line-height-out').textContent=$('text-line-height').value;
        $('text-background-enabled').checked=!!obj.textBackgroundColor;
        $('text-background-color').value=normalizeColor(obj.textBackgroundColor,'#ff9f0a');
        $('text-shadow-style').value=obj.shadow?(obj.shadow.blur>=20?'glow':obj.shadow.blur<=6?'strong':'soft'):'none';
        $('text-shadow-color').value=normalizeColor(obj.shadow?.color,'#000000');
        setToggle('text-bold',String(obj.fontWeight)==='bold'||Number(obj.fontWeight)>=600);
        setToggle('text-italic',obj.fontStyle==='italic');
        setToggle('text-underline',!!obj.underline);
      }
    }
  }
  function normalizeColor(value,fallback){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback}
  function shadowFromControls(){
    const style=$('text-shadow-style').value,color=$('text-shadow-color').value;
    if(style==='none')return null;
    if(style==='soft')return new fabric.Shadow({color:hexToRgba(color,.42),blur:12,offsetX:4,offsetY:5});
    if(style==='strong')return new fabric.Shadow({color:hexToRgba(color,.75),blur:5,offsetX:6,offsetY:7});
    return new fabric.Shadow({color:hexToRgba(color,.9),blur:24,offsetX:0,offsetY:0});
  }
  function setToggle(id,on){const b=$(id);b.classList.toggle('active',!!on);b.setAttribute('aria-pressed',String(!!on))}
  function isText(obj){return !!obj&&['i-text','text','textbox'].includes(obj.type)}
  function applyToSelected(prop,value){const obj=selected();if(!obj||obj.photoRole==='main')return;obj.set(prop,value);obj.setCoords();canvas.requestRenderAll()}
  function commitSelected(){const obj=selected();if(!obj||obj.photoRole==='main')return;safeSnapshot()}

  canvas.on('selection:created',updateSelection);canvas.on('selection:updated',updateSelection);canvas.on('selection:cleared',updateSelection);
  canvas.on('object:modified',()=>{safeSnapshot();updateSelection()});

  $('create-text').onclick=()=>{
    const text=decorate(new fabric.IText($('text-value').value||'Tu texto',{
      ...center(),fontFamily:$('text-font').value,fontSize:Number($('text-size').value),
      fontWeight:$('text-bold').classList.contains('active')?'bold':'normal',fontStyle:$('text-italic').classList.contains('active')?'italic':'normal',underline:$('text-underline').classList.contains('active'),
      textAlign:$('text-align').value,charSpacing:Number($('text-spacing').value),lineHeight:Number($('text-line-height').value),
      fill:$('text-color').value,stroke:$('text-stroke').value,strokeWidth:Number($('text-stroke-width').value),
      textBackgroundColor:$('text-background-enabled').checked?$('text-background-color').value:'',
      opacity:Number($('object-opacity').value)/100,shadow:shadowFromControls()
    }),'Texto','text');
    canvas.add(text);canvas.setActiveObject(text);canvas.requestRenderAll();safeSnapshot();api.toast('Texto agregado');
  };
  // Existing quick text button opens text tab instead of adding generic text.
  if($('add-text')) $('add-text').onclick=()=>document.querySelector('[data-tool-tab="text"]').click();
  if($('add-sticker')) $('add-sticker').onclick=()=>document.querySelector('[data-tool-tab="stickers"]').click();

  const textBindings={
    'text-value':['text','input'],'text-font':['fontFamily','change'],'text-size':['fontSize','input'],
    'text-color':['fill','input'],'text-stroke':['stroke','input'],'text-stroke-width':['strokeWidth','input'],
    'text-align':['textAlign','change'],'text-spacing':['charSpacing','input'],'text-line-height':['lineHeight','input']
  };
  Object.entries(textBindings).forEach(([id,[prop,event]])=>$(id).addEventListener(event,()=>{
    const obj=selected();if(!obj||!isText(obj))return;
    let value=$(id).value;if(['fontSize','strokeWidth','charSpacing','lineHeight'].includes(prop))value=Number(value);applyToSelected(prop,value);
  }));
  ['text-value','text-font','text-size','text-color','text-stroke','text-stroke-width','text-align','text-spacing','text-line-height'].forEach(id=>$(id).addEventListener('change',commitSelected));
  ['text-shadow-style','text-shadow-color'].forEach(id=>$(id).addEventListener('change',()=>{const obj=selected();if(!isText(obj))return;obj.set('shadow',shadowFromControls());canvas.requestRenderAll();commitSelected()}));
  ['text-background-enabled','text-background-color'].forEach(id=>$(id).addEventListener('change',()=>{const obj=selected();if(!isText(obj))return;obj.set('textBackgroundColor',$('text-background-enabled').checked?$('text-background-color').value:'');canvas.requestRenderAll();commitSelected()}));
  [['text-bold','fontWeight','bold','normal'],['text-italic','fontStyle','italic','normal'],['text-underline','underline',true,false]].forEach(([id,prop,on,off])=>$(id).onclick=()=>{const active=!$(id).classList.contains('active');setToggle(id,active);const obj=selected();if(isText(obj)){obj.set(prop,active?on:off);canvas.requestRenderAll();commitSelected()}});
  const textPresets={
    title:{fontSize:72,fontWeight:'bold',fontStyle:'normal',fill:'#ffffff',stroke:'#111111',strokeWidth:3,charSpacing:20,textAlign:'center',shadow:new fabric.Shadow({color:'rgba(0,0,0,.55)',blur:10,offsetX:4,offsetY:6})},
    caption:{fontSize:38,fontWeight:'bold',fontStyle:'normal',fill:'#ffffff',stroke:'#111111',strokeWidth:1,charSpacing:0,textAlign:'center',textBackgroundColor:'rgba(0,0,0,.55)'},
    meme:{fontFamily:'Impact',fontSize:64,fontWeight:'normal',fill:'#ffffff',stroke:'#000000',strokeWidth:5,charSpacing:0,textAlign:'center'}
  };
  document.querySelectorAll('[data-text-preset]').forEach(btn=>btn.onclick=()=>{const obj=selected();if(!isText(obj))return api.toast('Selecciona una capa de texto primero.');obj.set(textPresets[btn.dataset.textPreset]);obj.setCoords();canvas.requestRenderAll();safeSnapshot();updateSelection();api.toast('Estilo de texto aplicado')});
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
