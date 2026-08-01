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

  const modeHelp={
    move:'Modo Mover: toca un objeto para seleccionarlo, moverlo, rotarlo o cambiar su tamaño.',
    draw:'Modo Dibujar: usa el dedo sobre la foto. Pulsa Mover cuando termines.',
    erase:'Modo Borrar: toca un trazo para eliminarlo. Las fotos, textos y stickers están protegidos.',
    sticker:'Elige un sticker abajo. Después regresarás automáticamente a Mover.',
    text:'Configura el texto abajo. Después de agregarlo podrás moverlo libremente.',
    shape:'Elige una forma abajo. Después podrás moverla, rotarla y cambiar su tamaño.'
  };
  let canvasMode='move';
  function setCanvasMode(mode,{openPanel=true,announce=true}={}){
    canvasMode=mode;document.body.dataset.canvasMode=mode;
    canvas.isDrawingMode=mode==='draw';
    document.body.classList.toggle('drawing-active',mode==='draw');
    canvas.selection=mode==='move';
    canvas.skipTargetFind=!['move','erase'].includes(mode);
    canvas.defaultCursor=mode==='erase'?'not-allowed':mode==='draw'?'crosshair':'default';
    canvas.hoverCursor=mode==='erase'?'not-allowed':'move';
    canvas.getObjects().forEach(obj=>{
      const movable=mode==='move'&&obj.photoRole!=='main'&&!obj.userLocked;
      obj.selectable=mode==='erase'?obj.layerType==='drawing':movable;
      obj.evented=mode==='erase'?obj.layerType==='drawing':(mode==='move'&&obj.photoRole!=='main'&&!obj.userLocked);
    });
    canvas.discardActiveObject();canvas.requestRenderAll();
    document.querySelectorAll('[data-canvas-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.canvasMode===mode));
    if($('mode-help'))$('mode-help').textContent=modeHelp[mode]||'';
    if(openPanel){
      const tabMap={draw:'draw',sticker:'stickers',text:'text',shape:'shapes'};
      const tab=tabMap[mode]&&document.querySelector(`[data-tool-tab="${tabMap[mode]}"]`);
      if(tab)tab.click();
    }
    if(announce)api.toast(modeHelp[mode].split(':')[0]);
  }
  document.querySelectorAll('[data-canvas-mode]').forEach(btn=>btn.addEventListener('click',()=>setCanvasMode(btn.dataset.canvasMode)));
  canvas.on('mouse:down',event=>{
    if(canvasMode!=='erase')return;
    const target=event.target;
    if(target?.layerType==='drawing'){canvas.remove(target);canvas.requestRenderAll();safeSnapshot();api.toast('Trazo borrado');}
    else api.toast('El borrador solo elimina trazos de dibujo.');
  });
  setCanvasMode('move',{openPanel:false,announce:false});

  document.querySelectorAll('.creative-tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.creative-tab').forEach(x=>x.classList.toggle('active',x===btn));
    document.querySelectorAll('.creative-pane').forEach(p=>p.classList.toggle('active',p.dataset.toolPane===btn.dataset.toolTab));
    if(btn.dataset.toolTab!=='draw'&&canvasMode==='draw')setCanvasMode('move',{openPanel:false,announce:false});
  }));

  const outputPair=(id,suffix='')=>{
    const input=$(id),out=$(id+'-out');
    if(input&&out) input.addEventListener('input',()=>out.textContent=input.value+suffix);
  };
  ['text-size','text-stroke-width','text-spacing','text-line-height','brush-size','shape-stroke-width','shape-corner-radius'].forEach(id=>outputPair(id));
  ['object-opacity','brush-opacity','shape-fill-opacity','shape-stroke-opacity'].forEach(id=>outputPair(id,'%'));

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
      if(obj.layerType==='shape'){
        syncShapeControls(obj.shapeSettings||loadShapeSettings());
        document.querySelector('.shape-corner-control')?.classList.toggle('control-disabled',obj.type!=='rect');
      }else document.querySelector('.shape-corner-control')?.classList.remove('control-disabled');
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
    canvas.add(text);canvas.setActiveObject(text);canvas.requestRenderAll();safeSnapshot();setCanvasMode('move',{openPanel:false,announce:false});api.toast('Texto agregado: ya puedes moverlo');
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
    setCanvasMode('draw',{openPanel:false,announce:false});
    const alpha=Number($('brush-opacity').value)/100;
    const color=hexToRgba($('brush-color').value,mode==='marker'?Math.min(alpha,.35):alpha);
    canvas.freeDrawingBrush.color=color;canvas.freeDrawingBrush.width=Number($('brush-size').value)*(mode==='marker'?2:1);
    api.toast(mode==='marker'?'Marcador activado':'Lápiz activado');
  }
  function hexToRgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`}
  $('draw-pencil').onclick=()=>drawing('pencil');$('draw-marker').onclick=()=>drawing('marker');
  $('draw-off').onclick=()=>{setCanvasMode('move',{openPanel:false});api.toast('Dibujo terminado: modo Mover activado')};
  canvas.on('path:created',e=>{decorate(e.path,'Trazo','drawing');safeSnapshot()});
  $('clear-drawing').onclick=()=>{const paths=canvas.getObjects().filter(o=>o.layerType==='drawing');paths.forEach(o=>canvas.remove(o));canvas.requestRenderAll();safeSnapshot();api.toast('Trazos eliminados')};

  const SHAPE_SETTINGS_KEY='photoiaShapeSettingsV1';
  const defaultShapeSettings={fill:'#ff9f0a',fillTransparent:false,fillOpacity:100,stroke:'#111111',strokeOpacity:100,strokeWidth:3,lineStyle:'solid',cornerRadius:12};
  function loadShapeSettings(){
    try{return {...defaultShapeSettings,...JSON.parse(localStorage.getItem(SHAPE_SETTINGS_KEY)||'{}')}}catch(_){return {...defaultShapeSettings}}
  }
  function dashArray(style,width=3){
    const w=Math.max(1,Number(width)||1);
    if(style==='dashed')return [w*4,w*2.5];
    if(style==='dotted')return [w,w*2.2];
    return null;
  }
  function colorWithOpacity(hex,opacity){return hexToRgba(hex,Math.max(0,Math.min(1,Number(opacity)/100)))}
  function currentShapeSettings(){
    return {fill:$('shape-fill').value,fillTransparent:$('shape-fill-transparent').checked,fillOpacity:Number($('shape-fill-opacity').value),stroke:$('shape-stroke').value,strokeOpacity:Number($('shape-stroke-opacity').value),strokeWidth:Number($('shape-stroke-width').value),lineStyle:$('shape-line-style').value,cornerRadius:Number($('shape-corner-radius').value)};
  }
  function saveShapeSettings(){localStorage.setItem(SHAPE_SETTINGS_KEY,JSON.stringify(currentShapeSettings()))}
  function syncShapeControls(settings=loadShapeSettings()){
    $('shape-fill').value=settings.fill;$('shape-fill-transparent').checked=!!settings.fillTransparent;
    $('shape-fill-opacity').value=settings.fillOpacity;$('shape-fill-opacity-out').textContent=settings.fillOpacity+'%';
    $('shape-stroke').value=settings.stroke;$('shape-stroke-opacity').value=settings.strokeOpacity;$('shape-stroke-opacity-out').textContent=settings.strokeOpacity+'%';
    $('shape-stroke-width').value=settings.strokeWidth;$('shape-stroke-width-out').textContent=settings.strokeWidth;
    $('shape-line-style').value=settings.lineStyle;$('shape-corner-radius').value=settings.cornerRadius;$('shape-corner-radius-out').textContent=settings.cornerRadius;
    $('shape-fill').disabled=!!settings.fillTransparent;$('shape-fill-opacity').disabled=!!settings.fillTransparent;
    $('shape-fill-color-label').classList.toggle('control-disabled',!!settings.fillTransparent);
  }
  function setShapeVisual(obj,settings){
    const fill=settings.fillTransparent?'transparent':colorWithOpacity(settings.fill,settings.fillOpacity);
    const stroke=colorWithOpacity(settings.stroke,settings.strokeOpacity);
    const strokeDashArray=dashArray(settings.lineStyle,settings.strokeWidth);
    if(obj.type==='group'){
      const children=obj.getObjects();
      children.forEach((child,index)=>{
        if(child.type==='line')child.set({stroke,strokeWidth:Math.max(3,settings.strokeWidth),strokeDashArray});
        else child.set({fill:stroke,stroke});
      });
      obj.set({stroke:null,fill:null});
    }else if(obj.type==='line')obj.set({fill:null,stroke,strokeWidth:settings.strokeWidth,strokeDashArray});
    else{
      obj.set({fill,stroke,strokeWidth:settings.strokeWidth,strokeDashArray});
      if(obj.type==='rect')obj.set({rx:settings.cornerRadius,ry:settings.cornerRadius});
    }
    obj.shapeSettings={...settings};obj.setCoords();
  }
  syncShapeControls();
  function addShape(kind){
    const settings=currentShapeSettings();saveShapeSettings();
    const common={...center(),opacity:Number($('object-opacity').value)/100};
    let obj,name='Forma';
    if(kind==='rect'){obj=new fabric.Rect({...common,width:180,height:120});name='Rectángulo'}
    if(kind==='circle'){obj=new fabric.Circle({...common,radius:72});name='Círculo'}
    if(kind==='triangle'){obj=new fabric.Triangle({...common,width:170,height:145});name='Triángulo'}
    if(kind==='line'){obj=new fabric.Line([-90,0,90,0],common);name='Línea'}
    if(kind==='arrow'){
      const line=new fabric.Line([-90,0,65,0],{originX:'center',originY:'center'});
      const head=new fabric.Triangle({left:80,top:0,width:28,height:34,angle:90,originX:'center',originY:'center'});
      obj=new fabric.Group([line,head],common);name='Flecha';
    }
    setShapeVisual(obj,settings);decorate(obj,name,'shape');canvas.add(obj);canvas.setActiveObject(obj);canvas.requestRenderAll();safeSnapshot();setCanvasMode('move',{openPanel:false,announce:false});api.toast(name+' agregado: ya puedes moverlo');
  }
  document.querySelectorAll('[data-add-shape]').forEach(b=>b.onclick=()=>addShape(b.dataset.addShape));
  const shapeControls=['shape-fill','shape-fill-transparent','shape-fill-opacity','shape-stroke','shape-stroke-opacity','shape-stroke-width','shape-line-style','shape-corner-radius'];
  function updateSelectedShape(){
    const settings=currentShapeSettings();saveShapeSettings();syncShapeControls(settings);
    const obj=selected();if(!obj||obj.layerType!=='shape')return;
    setShapeVisual(obj,settings);canvas.requestRenderAll();
  }
  shapeControls.forEach(id=>{
    $(id).addEventListener('input',updateSelectedShape);
    $(id).addEventListener('change',()=>{updateSelectedShape();commitSelected()});
  });

  document.querySelectorAll('[data-sticker]').forEach(b=>b.onclick=()=>{
    const emoji=b.dataset.sticker;const obj=decorate(new fabric.Text(emoji,{...center(),fontSize:82}),'Sticker '+emoji,'sticker');
    canvas.add(obj);canvas.setActiveObject(obj);canvas.requestRenderAll();safeSnapshot();setCanvasMode('move',{openPanel:false,announce:false});api.toast('Sticker agregado: arrástralo para moverlo');
  });

  $('bring-front').onclick=()=>{const obj=selected();if(!obj||obj.photoRole==='main')return;canvas.bringToFront(obj);canvas.requestRenderAll();safeSnapshot()};
  $('send-back').onclick=()=>{const obj=selected();if(!obj||obj.photoRole==='main')return;canvas.sendToBack(obj);if(api.state.photo)canvas.sendToBack(api.state.photo);canvas.requestRenderAll();safeSnapshot()};

  api.setCanvasMode=setCanvasMode;
  updateSelection();
};
window.addEventListener('photoia-ready',onReady,{once:true});
})();
