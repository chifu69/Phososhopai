(() => {
  'use strict';
  const VERSION='4.0.0';
  const MAX_SIDE=1800;
  const $=id=>document.getElementById(id);
  const state={
    canvas:null, base:null, originalDataURL:'', loaded:false, cvReady:false,
    history:[], historyIndex:-1, cropper:null, compare:false, processing:false,
    sliderTimer:null
  };
  const sliders=['brightness','contrast','saturation','temperature','sharpness','blur'];

  function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2300)}
  function busy(on){state.processing=on;$('processing').hidden=!on;document.body.classList.toggle('busy',on)}
  function cvAvailable(){return !!(window.cv&&cv.Mat&&state.cvReady)}
  function setEngine(status,text){const b=$('engine-badge');b.className='engine-badge '+status;b.textContent=text}

  function initLibraries(){
    if(window.fabric){
      state.canvas=new fabric.Canvas('editor-canvas',{selection:true,preserveObjectStacking:true,backgroundColor:'#151b22'});
      state.canvas.setWidth(600);state.canvas.setHeight(500);
      state.canvas.on('object:modified',()=>saveHistory());
    }else{setEngine('fallback','Fabric no cargó')}
    const markCV=()=>{
      if(window.cv&&cv.Mat){
        if(typeof cv.onRuntimeInitialized==='function'){
          const old=cv.onRuntimeInitialized;cv.onRuntimeInitialized=()=>{try{old()}catch(_){} state.cvReady=true;setEngine('ready','OpenCV listo')};
        }
        setTimeout(()=>{if(window.cv&&cv.Mat){state.cvReady=true;setEngine('ready','OpenCV listo')}},1200);
      }
    };
    window.addEventListener('opencv-script-loaded',markCV);markCV();
    setTimeout(()=>{if(!state.cvReady)setEngine('fallback','Modo local compatible')},9000);
  }

  function fitDimensions(w,h){const maxWidth=Math.min(window.innerWidth-56,820);const maxHeight=Math.min(window.innerHeight*.58,650);const s=Math.min(maxWidth/w,maxHeight/h,1);return {w:Math.max(280,Math.round(w*s)),h:Math.max(240,Math.round(h*s))}}
  function dataUrlFromFile(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
  function loadImageElement(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
  async function normalizeImage(src){
    const img=await loadImageElement(src);let w=img.naturalWidth,h=img.naturalHeight;const s=Math.min(1,MAX_SIDE/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);return c.toDataURL('image/jpeg',.94)
  }
  async function openFile(file){
    if(!file)return;busy(true);
    try{const raw=await dataUrlFromFile(file);const normalized=await normalizeImage(raw);state.originalDataURL=normalized;await setBaseImage(normalized,true);$('project-title').textContent=file.name||'Nueva edición';toast('Foto abierta')}
    catch(e){console.error(e);toast('No pude abrir esa foto')}
    finally{busy(false)}
  }
  async function setBaseImage(dataURL,resetHistory=false){
    if(!state.canvas)throw new Error('Fabric no disponible');
    const imgEl=await loadImageElement(dataURL);const dims=fitDimensions(imgEl.width,imgEl.height);
    state.canvas.clear();state.canvas.setWidth(dims.w);state.canvas.setHeight(dims.h);state.canvas.setBackgroundColor('#151b22',()=>{});
    const img=new fabric.Image(imgEl,{left:0,top:0,selectable:false,evented:false,objectCaching:false});
    img.scaleX=dims.w/imgEl.width;img.scaleY=dims.h/imgEl.height;img.set({name:'base-image'});state.base=img;state.canvas.add(img);state.canvas.sendToBack(img);state.canvas.renderAll();
    state.loaded=true;$('empty-state').hidden=true;enableControls(true);$('image-info').textContent=`${imgEl.width} × ${imgEl.height}px`;
    resetSliders();if(resetHistory){state.history=[];state.historyIndex=-1;saveHistory(true)}else saveHistory();
  }
  function enableControls(on){document.querySelectorAll('button[disabled],input[disabled]').forEach(el=>{if(el.id!=='undo-btn'&&el.id!=='redo-btn')el.disabled=!on});updateUndoRedo()}
  function resetSliders(){sliders.forEach(id=>{const el=$(id);if(el){el.value=0;$(`${id}-out`).textContent='0'}})}

  function snapshot(){return {json:state.canvas.toJSON(['name']),width:state.canvas.getWidth(),height:state.canvas.getHeight()}}
  function saveHistory(force=false){if(!state.loaded||state.processing)return;const s=snapshot();const sig=JSON.stringify(s);if(!force&&state.history[state.historyIndex]?.sig===sig)return;state.history=state.history.slice(0,state.historyIndex+1);state.history.push({sig,s});if(state.history.length>12)state.history.shift();state.historyIndex=state.history.length-1;updateUndoRedo()}
  function updateUndoRedo(){$('undo-btn').disabled=state.historyIndex<=0;$('redo-btn').disabled=state.historyIndex<0||state.historyIndex>=state.history.length-1}
  async function restoreHistory(index){if(index<0||index>=state.history.length)return;busy(true);try{const rec=state.history[index].s;state.canvas.setWidth(rec.width);state.canvas.setHeight(rec.height);await new Promise(resolve=>state.canvas.loadFromJSON(rec.json,()=>{state.base=state.canvas.getObjects().find(o=>o.name==='base-image')||state.canvas.getObjects()[0];state.canvas.renderAll();resolve()}));state.historyIndex=index;updateUndoRedo()}finally{busy(false)}}

  function renderFullCanvasDataURL(){
    const mult=state.base&&state.base.scaleX?Math.min(3,1/state.base.scaleX):1;
    return state.canvas.toDataURL({format:'png',multiplier:mult,enableRetinaScaling:false});
  }
  async function rasterizeBase(){
    const data=renderFullCanvasDataURL();await setBaseImage(data,false)
  }

  function fallbackProcess(imgData,opts){
    const d=imgData.data,b=(opts.brightness||0)*2.55,c=(opts.contrast||0);const f=(259*(c+255))/(255*(259-c));const sat=1+(opts.saturation||0)/100;const temp=(opts.temperature||0)*.7;
    for(let i=0;i<d.length;i+=4){let r=d[i]+b+temp,g=d[i+1]+b,bv=d[i+2]+b-temp;r=f*(r-128)+128;g=f*(g-128)+128;bv=f*(bv-128)+128;const gray=.299*r+.587*g+.114*bv;r=gray+(r-gray)*sat;g=gray+(g-gray)*sat;bv=gray+(bv-gray)*sat;d[i]=Math.max(0,Math.min(255,r));d[i+1]=Math.max(0,Math.min(255,g));d[i+2]=Math.max(0,Math.min(255,bv))}return imgData
  }
  async function processRaster(options,label='Ajuste aplicado'){
    if(!state.loaded||state.processing)return;busy(true);
    try{
      const source=renderFullCanvasDataURL();const img=await loadImageElement(source);const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      if(cvAvailable()){
        let src=cv.imread(c),dst=new cv.Mat();
        try{
          src.copyTo(dst);
          if(options.bw){cv.cvtColor(dst,dst,cv.COLOR_RGBA2GRAY);cv.cvtColor(dst,dst,cv.COLOR_GRAY2RGBA)}
          if(options.brightness||options.contrast){const alpha=1+(options.contrast||0)/100;const beta=(options.brightness||0)*2.2;dst.convertTo(dst,-1,alpha,beta)}
          if(options.saturation||options.temperature){
            let rgb=new cv.Mat(),hsv=new cv.Mat();cv.cvtColor(dst,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);
            if(options.saturation){const planes=new cv.MatVector();cv.split(hsv,planes);let s=planes.get(1);s.convertTo(s,-1,1+(options.saturation||0)/100,0);planes.set(1,s);cv.merge(planes,hsv);s.delete();planes.delete()}
            cv.cvtColor(hsv,rgb,cv.COLOR_HSV2RGB);cv.cvtColor(rgb,dst,cv.COLOR_RGB2RGBA);
            if(options.temperature){const t=options.temperature*.55;const scalar=new cv.Scalar(t,0,-t,0);cv.add(dst,scalar,dst)}
            rgb.delete();hsv.delete();
          }
          if(options.blur>0){let k=Math.max(3,Math.round(options.blur)*2+1);if(k%2===0)k++;cv.GaussianBlur(dst,dst,new cv.Size(k,k),0,0,cv.BORDER_DEFAULT)}
          if(options.sharpness>0){let blurred=new cv.Mat();cv.GaussianBlur(dst,blurred,new cv.Size(0,0),2);cv.addWeighted(dst,1+options.sharpness/80,blurred,-options.sharpness/80,0,dst);blurred.delete()}
          if(options.auto){
            let lab=new cv.Mat();cv.cvtColor(dst,lab,cv.COLOR_RGBA2RGB);cv.cvtColor(lab,lab,cv.COLOR_RGB2Lab);let channels=new cv.MatVector();cv.split(lab,channels);let clahe=new cv.CLAHE(2.0,new cv.Size(8,8));let l=channels.get(0),l2=new cv.Mat();clahe.apply(l,l2);channels.set(0,l2);cv.merge(channels,lab);cv.cvtColor(lab,lab,cv.COLOR_Lab2RGB);cv.cvtColor(lab,dst,cv.COLOR_RGB2RGBA);l.delete();l2.delete();channels.delete();clahe.delete();lab.delete();
          }
          cv.imshow(c,dst);
        }finally{src.delete();dst.delete()}
      }else{
        let data=ctx.getImageData(0,0,c.width,c.height);if(options.bw){for(let i=0;i<data.data.length;i+=4){const g=.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2];data.data[i]=data.data[i+1]=data.data[i+2]=g}}data=fallbackProcess(data,options);ctx.putImageData(data,0,0);if(options.blur)ctx.filter=`blur(${options.blur}px)`,ctx.drawImage(c,0,0),ctx.filter='none';
      }
      await setBaseImage(c.toDataURL('image/png'),false);toast(label)
    }catch(e){console.error(e);toast('No pude aplicar ese ajuste')}
    finally{busy(false)}
  }

  async function applyPreset(name){
    const presets={bw:{bw:true},vivid:{saturation:35,contrast:10},portrait:{brightness:7,contrast:5,saturation:8,sharpness:12},auto:{auto:true,saturation:8,sharpness:15},professional:{auto:true,contrast:8,saturation:10,sharpness:18}};
    await processRaster(presets[name]||presets.auto,`${name==='bw'?'Blanco y negro':'Preset'} aplicado`)
  }
  function sliderOptions(){return Object.fromEntries(sliders.map(id=>[id,Number($(id).value)]))}
  function onSlider(id){$(`${id}-out`).textContent=$(id).value;clearTimeout(state.sliderTimer);state.sliderTimer=setTimeout(()=>{const o=sliderOptions();processRaster(o,'Ajuste aplicado');resetSliders()},450)}

  async function rotate(deg){if(!state.loaded)return;state.canvas.getObjects().forEach(o=>{o.rotate((o.angle||0)+deg)});state.canvas.renderAll();await rasterizeBase();toast('Imagen rotada')}
  async function flip(){if(!state.loaded)return;state.canvas.getObjects().forEach(o=>o.set('flipX',!o.flipX));state.canvas.renderAll();await rasterizeBase();toast('Espejo aplicado')}
  async function squareCrop(){const src=renderFullCanvasDataURL(),img=await loadImageElement(src),s=Math.min(img.width,img.height),c=document.createElement('canvas');c.width=c.height=s;c.getContext('2d').drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,s,s);await setBaseImage(c.toDataURL('image/png'),false);toast('Recorte cuadrado aplicado')}

  function openSheet(title,desc,html){$('sheet-title').textContent=title;$('sheet-description').textContent=desc;$('sheet-content').innerHTML=html;$('studio-sheet').hidden=false}
  function closeSheet(){$('studio-sheet').hidden=true}
  function openStudio(name){
    if(name==='design')openSheet('Texto y capas','Agrega texto editable encima de la foto.',`<div class="layer-tools"><input id="layer-text" placeholder="Escribe tu texto"><select id="layer-size"><option>36</option><option>52</option><option>72</option><option>96</option></select><input id="layer-color" type="color" value="#ffffff"><button id="add-text">Agregar texto</button><button id="add-sticker">Agregar sticker 🤖</button><button id="delete-layer">Borrar capa seleccionada</button><button id="flatten-layers">Fusionar capas</button></div>`),bindDesign();
    else if(name==='crop')openCrop();
    else if(name==='repair')openSheet('Reparar foto','Herramientas locales de limpieza.',`<div class="layer-tools"><button data-repair="denoise">Reducir ruido</button><button data-repair="sharpen">Recuperar detalle</button><button data-repair="restore">Restauración automática</button></div>`),bindRepair();
    else openSheet('Motor IA pendiente','Esta transformación necesita un modelo generativo. La interfaz ya está preparada, pero no voy a fingir que funciona sin conectarlo.',`<p>Las ediciones locales permanecen privadas. Outfit, cabello, fondos generativos y face swap se conectarán como módulos opcionales.</p>`)
  }
  function bindDesign(){
    $('add-text').onclick=()=>{const text=$('layer-text').value.trim()||'PHOTO IA';const obj=new fabric.IText(text,{left:30,top:30,fill:$('layer-color').value,fontSize:Number($('layer-size').value),fontWeight:'700',shadow:'0 2px 8px rgba(0,0,0,.6)'});state.canvas.add(obj).setActiveObject(obj);state.canvas.renderAll();saveHistory();toast('Texto agregado')};
    $('add-sticker').onclick=()=>{const obj=new fabric.Text('🤖',{left:40,top:40,fontSize:90});state.canvas.add(obj).setActiveObject(obj);state.canvas.renderAll();saveHistory()};
    $('delete-layer').onclick=()=>{const a=state.canvas.getActiveObject();if(a&&a!==state.base){state.canvas.remove(a);saveHistory()}};
    $('flatten-layers').onclick=async()=>{closeSheet();busy(true);try{await rasterizeBase();toast('Capas fusionadas')}finally{busy(false)}};
  }
  function bindRepair(){document.querySelectorAll('[data-repair]').forEach(b=>b.onclick=()=>{closeSheet();const t=b.dataset.repair;if(t==='denoise')processRaster({blur:1,sharpness:12},'Ruido reducido');if(t==='sharpen')processRaster({sharpness:38},'Detalle recuperado');if(t==='restore')processRaster({auto:true,contrast:8,sharpness:22},'Restauración aplicada')})}

  function openCrop(){
    if(!window.Cropper){toast('Cropper.js no cargó');return}
    $('crop-modal').hidden=false;$('crop-image').src=renderFullCanvasDataURL();setTimeout(()=>{state.cropper?.destroy();state.cropper=new Cropper($('crop-image'),{viewMode:1,autoCropArea:.9,responsive:true,background:false})},50)
  }
  function closeCrop(){state.cropper?.destroy();state.cropper=null;$('crop-modal').hidden=true}
  async function applyCrop(){if(!state.cropper)return;const c=state.cropper.getCroppedCanvas({maxWidth:2400,maxHeight:2400,imageSmoothingQuality:'high'});closeCrop();await setBaseImage(c.toDataURL('image/png'),false);toast('Recorte aplicado')}

  function parseCommand(raw){const q=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/blanco y negro|escala de grises|black and white|\bbw\b/.test(q))return ['preset','bw'];if(/profesional|professional|mejorar|enhance/.test(q))return ['preset','professional'];if(/retrato|portrait/.test(q))return ['preset','portrait'];if(/vibrante|mas color|saturacion/.test(q))return ['preset','vivid'];if(/mas brill|aclara|brillo/.test(q))return ['process',{brightness:20}];if(/oscurece|menos brillo/.test(q))return ['process',{brightness:-20}];if(/desenfo|blur/.test(q))return ['process',{blur:6}];if(/nitidez|enfoca|sharpen/.test(q))return ['process',{sharpness:35}];if(/recorta|crop/.test(q))return ['crop'];if(/gira.*derecha/.test(q))return ['rotate',90];if(/gira.*izquierda/.test(q))return ['rotate',-90];if(/ropa|outfit|cabello|pelo|face swap|cara|fondo/.test(q))return ['ai'];return null}
  async function runCommand(raw){const cmd=parseCommand(raw);if(!cmd){toast('Todavía no reconozco esa instrucción');return}if(cmd[0]==='preset')await applyPreset(cmd[1]);if(cmd[0]==='process')await processRaster(cmd[1]);if(cmd[0]==='crop')openCrop();if(cmd[0]==='rotate')await rotate(cmd[1]);if(cmd[0]==='ai')toast('Esa función requiere conectar el motor generativo')}

  function bind(){
    $('file-input').onchange=e=>openFile(e.target.files[0]);$('camera-input').onchange=e=>openFile(e.target.files[0]);
    document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>runCommand(b.dataset.command));
    $('command-btn').onclick=()=>runCommand($('command-input').value);$('command-input').onkeydown=e=>{if(e.key==='Enter')runCommand(e.target.value)};
    sliders.forEach(id=>$(id).addEventListener('input',()=>onSlider(id)));
    $('undo-btn').onclick=()=>restoreHistory(state.historyIndex-1);$('redo-btn').onclick=()=>restoreHistory(state.historyIndex+1);
    $('rotate-left').onclick=()=>rotate(-90);$('rotate-right').onclick=()=>rotate(90);$('flip-x').onclick=flip;$('crop-square').onclick=squareCrop;
    $('compare-btn').onpointerdown=()=>{if(state.originalDataURL){state.compare=true;const old=state.canvas.toDataURL();setBaseImage(state.originalDataURL,false).then(()=>state.compareSnapshot=old)}};
    const endCompare=()=>{if(state.compare&&state.compareSnapshot){state.compare=false;setBaseImage(state.compareSnapshot,false);state.compareSnapshot=''}};$('compare-btn').onpointerup=endCompare;$('compare-btn').onpointerleave=endCompare;
    $('reset-btn').onclick=()=>setBaseImage(state.originalDataURL,false);$('download-btn').onclick=()=>{const mime=$('format').value,quality=Number($('quality').value)/100;const url=state.canvas.toDataURL({format:mime.split('/')[1],quality,multiplier:Math.min(3,state.base?1/state.base.scaleX:1)});const a=document.createElement('a');a.href=url;a.download=`photo-ia-${Date.now()}.${mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg'}`;a.click()};
    document.querySelectorAll('[data-studio]').forEach(b=>b.onclick=()=>openStudio(b.dataset.studio));$('sheet-close').onclick=closeSheet;$('sheet-backdrop').onclick=closeSheet;
    $('crop-close').onclick=closeCrop;$('crop-apply').onclick=applyCrop;document.querySelectorAll('[data-ratio]').forEach(b=>b.onclick=()=>state.cropper?.setAspectRatio(Number(b.dataset.ratio)));
    $('theme-btn').onclick=()=>document.documentElement.classList.toggle('light');
    window.addEventListener('resize',()=>{if(state.loaded&&state.base){const src=renderFullCanvasDataURL();setBaseImage(src,false)}});
  }

  document.addEventListener('DOMContentLoaded',()=>{initLibraries();bind();$('app-version').textContent=VERSION;if('serviceWorker'in navigator)navigator.serviceWorker.register(`sw.js?v=${VERSION}`).catch(()=>{})});
})();
