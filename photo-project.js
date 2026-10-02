/* Adapter between the document and the existing Fabric tools. */
(() => {
'use strict';
let session=null,assets=new Map(),dataAssets=new Map(),restoring=false,previewing=false,loadSequence=0,saveTimer=0,saveQueue=Promise.resolve(),storePromise=null;
let activeRenders=0,epoch=0;
const layerURLs=new Map(),deletingProjects=new Set();
function layerURL(asset){if(!layerURLs.has(asset.id))layerURLs.set(asset.id,URL.createObjectURL(asset.blob));return layerURLs.get(asset.id)}
const D=()=>PhotoDocument,R=()=>PhotoRenderer,api=()=>PhotoIA,clone=x=>JSON.parse(JSON.stringify(x));
const id=()=>crypto.randomUUID();
function status(text){const e=document.getElementById('project-save-status');if(e)e.textContent=text;document.dispatchEvent(new CustomEvent('photoia:project-status'))}
function resolveAsset(key){const a=assets.get(key);return a?Promise.resolve(a):Promise.reject(R().error('MISSING_ASSET'))}
function addBlob(blob,width,height){const asset={id:id(),blob,mime:blob.type,width,height};assets.set(asset.id,asset);return asset}
function addDataURL(url,width,height){if(dataAssets.has(url))return dataAssets.get(url);const parts=url.split(','),mime=/data:([^;]+)/.exec(parts[0])?.[1]||'image/png',bytes=Uint8Array.from(atob(parts[1]),c=>c.charCodeAt(0)),a=addBlob(new Blob([bytes],{type:mime}),width,height);dataAssets.set(url,a.id);return a.id}
function getDocument(){return session?clone(session.current):null}
function token(){return session?{...D().token(session),epoch}:null}
function valid(t){return !!session&&t?.documentId===session.current.id&&t.revision===session.current.revision&&t.epoch===epoch}
function syncHistory(){const s=api().state;s.history=session?[...session.past,session.current]:[];s.future=session?session.future:[];api().renderLayers();updateExportInfo();document.getElementById('undo-btn').disabled=!session?.past.length;document.getElementById('redo-btn').disabled=!session?.future.length}
function updateExportInfo(){
 const e=document.getElementById('export-resolution'),notice=document.getElementById('raster-resolution');if(!session){if(e)e.textContent='Abre una fotografía';return}
 const d=session.current,info=R().info(d);if(e)e.textContent=`Resolución disponible: ${info.width} × ${info.height} px${info.limitedBy.length?' · limitada por un retoque de píxeles':''}. Original conservado: ${d.source.width} × ${d.source.height} px.`;
 document.querySelectorAll('[data-raster-resolution]').forEach(e=>e.textContent=`Este retoque usa hasta ${Math.min(2000,Math.max(d.size.width,d.size.height))} px; el original permanece disponible.`);
 if(notice)notice.textContent=`Los retoques locales de ropa, cabello, piel y AI Fill trabajan con hasta ${Math.min(2000,Math.max(d.size.width,d.size.height))} px. Los resultados de IA usan la resolución recibida. El original se conserva por separado.`;
}
function visitObjects(objects,fn){for(const object of objects){fn(object);if(object.clipPath)visitObjects([object.clipPath],fn);if(object.objects)visitObjects(object.objects,fn)}}
function convertGeometry(object,viewport,toDocument){
 const convert=toDocument?D().toDocumentTransform:D().toViewportTransform;
 Object.assign(object,convert(object,viewport));
 if(toDocument)for(const key of ['left','top','scaleX','scaleY'])if(Number.isFinite(object[key]))object[key]=Math.round(object[key]*1e6)/1e6;
 if(object.clipPath?.absolutePositioned)convertGeometry(object.clipPath,viewport,toDocument);
 return object;
}
function capture(){
 const s=api().state,p=s.photo;if(!session||!p)return null;
 const d=session.current,k=p.getScaledWidth()/d.size.width,v={scale:k,offsetX:s.canvas.width/2-d.size.width*k/2,offsetY:s.canvas.height/2-d.size.height*k/2};
 const raw=s.canvas.toJSON(['photoRole','layerId','layerName','layerType','userLocked','shapeSettings','photoAdjustments','excludeFromExport','assetId']);
 const objects=raw.objects.filter(o=>o.photoRole!=='preview-overlay'&&!o.excludeFromExport&&!/^vision-/.test(o.layerType||'')).map(o=>convertGeometry(o,v,true));
 visitObjects(objects,o=>{if(o.photoRole==='main')delete o.src;else if(o.assetId)delete o.src;else if(o.src?.startsWith('blob:')){const id=[...layerURLs].find(([,url])=>url===o.src)?.[0];if(id){o.assetId=id;delete o.src}}else if(o.type==='image'&&o.src?.startsWith('data:')){o.assetId=addDataURL(o.src,o.width,o.height);delete o.src}});
 return {objects};
}
function snapshot(){if(!session||restoring||previewing)return;const view=capture();if(!view||JSON.stringify(view)===JSON.stringify(session.current.view)){syncHistory();return}session=D().commit(session,token(),{view});syncHistory();scheduleSave()}
async function hydrate(candidate=session,guard=()=>session===candidate){
 if(!candidate)return false;const sessionBeforeHydrate=session;
 const d=clone(candidate.current),urls=[];let stage,base;activeRenders++;
 try{
  base=await R().renderBase(d,resolveAsset,{maxDimension:2000});
  if(!guard())return false;
  const src=URL.createObjectURL(await R().blob(base));urls.push(src);
  const view=clone(d.view||{objects:[{type:'image',photoRole:'main',layerId:'layer-photo',layerName:'Fotografía',layerType:'photo',left:d.size.width/2,top:d.size.height/2,originX:'center',originY:'center',filters:[]}]});
  const state=api().state,angle=view.objects.find(o=>o.photoRole==='main')?.angle||0,swap=Math.abs(angle%180)===90,k=Math.min((state.canvas.width-16)/(swap?d.size.height:d.size.width),(state.canvas.height-16)/(swap?d.size.width:d.size.height));
  const v={scale:k,offsetX:state.canvas.width/2-d.size.width*k/2,offsetY:state.canvas.height/2-d.size.height*k/2};
  for(let i=0;i<view.objects.length;i++){
   const o=view.objects[i];if(o.photoRole==='main'){Object.assign(o,{src,width:base.width,height:base.height,scaleX:d.size.width/base.width,scaleY:d.size.height/base.height,selectable:false,evented:false,objectCaching:false})}
   view.objects[i]=convertGeometry(o,v,false);
  }
  const imageObjects=[];visitObjects(view.objects,o=>{if(o.assetId)imageObjects.push(o)});for(const o of imageObjects)o.src=layerURL(await resolveAsset(o.assetId));
  stage=new fabric.StaticCanvas(document.createElement('canvas'),{renderOnAddRemove:false});await R().loadScene(stage,view);
  const original=await originalPreview(d);
  const selection=d.selection?{...d.selection,data:new Uint8Array(await (await resolveAsset(d.selection.assetId)).blob.arrayBuffer())}:null;
  if(!guard())return false;
  restoring=true;session=candidate;previewing=false;
  const objects=stage.getObjects().slice();objects.forEach(o=>stage.remove(o));state.canvas.clear();objects.forEach(o=>state.canvas.add(o));
  state.photo=objects.find(o=>o.photoRole==='main');state.originalDataUrl=original;state.originalMime=d.source.mime;state.originalName=d.name;
  api().rehydratePhotoAdjustments?.();
  api().fitCanvas();
  document.getElementById('empty-state').hidden=true;document.getElementById('project-title').textContent=d.name;document.getElementById('image-info').textContent=`${d.size.width} × ${d.size.height}px`;
  api().setEnabled(true);syncHistory();if(candidate!==sessionBeforeHydrate)document.dispatchEvent(new CustomEvent('photoia:document-changed'));document.dispatchEvent(new CustomEvent('photoia:photo-replaced',{detail:{preserveFilters:true,documentRevision:d.revision}}));if(selection&&window.PhotoSegmentation)await PhotoSegmentation.replaceMask(selection.data,selection.width,selection.height,selection.kind);return true;
 }finally{activeRenders--;restoring=false;stage?.dispose();urls.forEach(u=>URL.revokeObjectURL(u));if(base)base.width=base.height=1}
}
async function originalPreview(d=getDocument()){const c=await R().renderBase({...d,operations:[]},resolveAsset,{maxDimension:2000});try{return c.toDataURL('image/png')}finally{c.width=c.height=1}}
async function prepareSwitch(){window.PhotoLocalRetouch?.cancel();if(previewing)await cancelPreview();snapshot();await saveNow({strict:true});}
async function importFile(file){
 const seq=++loadSequence;++epoch;await prepareSwitch();if(seq!==loadSequence)return false;const decoded=await R().decodeSource(file);
 try{if(seq!==loadSequence)return false;const a=addBlob(file,decoded.width,decoded.height),next=D().create({assetId:a.id,mime:file.type,width:decoded.width,height:decoded.height,fileName:file.name||'Fotografia.png'},file.name||'Fotografía');
  if(!await hydrate(next,()=>seq===loadSequence))return false;
  session.current.view=capture();syncHistory();const importedId=session.current.id;if(await saveNow()){if(seq===loadSequence)await(await store()).activate(importedId)}if(seq!==loadSequence)return false;document.getElementById('project-recovery').hidden=true;document.dispatchEvent(new CustomEvent('photoia:image-loaded',{detail:{name:file.name,width:decoded.width,height:decoded.height}}));return true;
 }finally{decoded.dispose()}
}
async function restore(index,kind){
 if(!session)return;const before=session,seq=++loadSequence;let next=session;
 if(kind==='undo')next=D().undo(next);else if(kind==='redo')next=D().redo(next);else {const n=next.past.length-Math.max(0,Number(index)||0);for(let i=0;i<n;i++)next=D().undo(next)}
 if(await hydrate(next,()=>session===before&&seq===loadSequence))scheduleSave();
}
async function cancelPreview(){if(!previewing)return;const before=session;await hydrate(before,()=>session===before)}
function captureSelection(){
 if(!session||restoring||previewing)return;const mask=window.PhotoSegmentation?.mask;let selection=null;
 if(mask){const a=addBlob(new Blob([mask.data],{type:'application/octet-stream'}),mask.width,mask.height);selection={assetId:a.id,width:mask.width,height:mask.height,kind:PhotoSegmentation.maskKind,documentRevision:session.current.revision+1}}
 if(!selection&&!session.current.selection)return;
 session=D().commit(session,token(),{selection,view:capture()});syncHistory();scheduleSave();
}
window.addEventListener('photoia:segmentation-mask-changed',captureSelection);
function markPreview(value){previewing=value}
function recordRaster(dataURL,{width,height,preserveFilters,label='Retoque',inputToken}={}){if(!session)return;if(inputToken&&!valid(inputToken))throw R().error('STALE_RESULT');previewing=false;const assetId=addDataURL(dataURL,width,height),old=session.current.size,view=capture(),scale=width/old.width;
 // Canonical document units change when a raster result has fewer pixels.
 for(const o of view.objects){const clip=o.clipPath;if(clip?.absolutePositioned){clip.left*=scale;clip.top*=height/old.height;clip.scaleX*=scale;clip.scaleY*=height/old.height}o.left*=scale;o.top*=height/old.height;o.scaleX*=scale;o.scaleY*=height/old.height;if(o.photoRole==='main'&&!preserveFilters){o.filters=[];o.photoAdjustments={}}}
 session=D().commit(session,token(),{operation:{id:id(),kind:'raster-result',params:{label},assetId,effectiveSize:{width,height}},size:{width,height},view,selection:null});restoring=true;try{document.dispatchEvent(new CustomEvent('photoia:document-changed'))}finally{restoring=false}syncHistory();scheduleSave();}
async function commitOperation(operation,t=token()){
 if(!valid(t))throw R().error('STALE_RESULT');if(previewing)throw new Error('Aplica o cancela la vista previa primero.');
 snapshot();const before=session,seq=loadSequence;let view=capture(),size=clone(before.current.size),operations=clone(before.current.operations);
 const main=view.objects.find(o=>o.photoRole==='main');
 // Freeze current filters before the next pixel operation; do not apply them twice.
 if(main.filters?.length){operations.push({id:id(),kind:'filters',enabled:true,params:{filters:clone(main.filters)}});main.filters=[];main.photoAdjustments={}}
 if(operation.kind==='crop'){
  const p=operation.params;if(![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.x<0||p.y<0||p.width<=0||p.height<=0||p.x+p.width>1.001||p.y+p.height>1.001)throw new Error('Recorte inválido');
  const bounds=R().info({...before.current,view});
  if(main.angle||main.flipX||main.flipY)operations.push({id:id(),kind:'orient',enabled:true,params:{angle:main.angle||0,flipX:!!main.flipX,flipY:!!main.flipY}});
  const dx=(size.width-bounds.width)/2+p.x*bounds.width,dy=(size.height-bounds.height)/2+p.y*bounds.height;
  size={width:Math.max(1,Math.round(bounds.width*p.width)),height:Math.max(1,Math.round(bounds.height*p.height))};
  for(const o of view.objects){o.left-=dx;o.top-=dy;if(o.clipPath?.absolutePositioned){o.clipPath.left-=dx;o.clipPath.top-=dy}}
  Object.assign(main,{left:size.width/2,top:size.height/2,angle:0,flipX:false,flipY:false});
 }
 const prepared={...before.current,operations},updated=D().upsertLastOperation(prepared,{id:id(),...operation});
 const next=D().commit(before,token(),{operations:updated.operations,size,view,selection:null});
 if(!await hydrate(next,()=>session===before&&seq===loadSequence))throw R().error('STALE_RESULT');scheduleSave();return true;
}
async function exportDocument(options={}){if(!session)throw new Error('Abre una foto primero.');if(previewing)throw new Error('Aplica o cancela la vista previa antes de exportar.');snapshot();const d=getDocument(),t=token(),result=await R().renderExport(d,resolveAsset,options);if(!valid(t))throw R().error('STALE_RESULT');return result}
async function committedPreview({smartInput=false}={}){if(!session)return null;snapshot();const d=getDocument();if(smartInput&&d.operations.at(-1)?.kind==='smart'&&!d.view?.objects?.find(o=>o.photoRole==='main')?.filters?.length)d.operations.pop();return R().renderPreview(d,resolveAsset,{maxDimension:900})}
function store(){if(!storePromise)storePromise=PhotoProjectStore.open().catch(e=>{storePromise=null;throw e});return storePromise}
function pruneAssets(){if(!session||activeRenders)return;const retained=new Set(D().assetIds(session));for(const key of assets.keys())if(!retained.has(key)){assets.delete(key);if(layerURLs.has(key)){URL.revokeObjectURL(layerURLs.get(key));layerURLs.delete(key)}}for(const [url,key]of dataAssets)if(!retained.has(key))dataAssets.delete(url)}
function scheduleSave(){clearTimeout(saveTimer);status('Guardando…');saveTimer=setTimeout(()=>saveNow(),500)}
function saveNow({strict=false}={}){
 clearTimeout(saveTimer);if(!session)return Promise.resolve(true);
 if(deletingProjects.has(session.current.id))return strict?Promise.reject(R().error('MISSING_PROJECT')):Promise.resolve(false);
 const captured=clone(session),list=D().assetIds(captured).map(k=>assets.get(k)),t=token(),assetMap=new Map(list.filter(Boolean).map(a=>[a.id,a]));
 const job=saveQueue.catch(()=>{}).then(async()=>{
  let thumbnail;try{const info=R().info(captured.current),scale=Math.min(1,320/Math.max(info.width,info.height));thumbnail=(await R().renderExport(captured.current,id=>Promise.resolve(assetMap.get(id)),{size:{width:info.width*scale,height:info.height*scale}})).blob}catch(e){console.warn('[Project thumbnail]',e)}
  await(await store()).save(captured,list,{thumbnail});if(valid(t)){status('Guardado en este dispositivo');pruneAssets()}document.dispatchEvent(new CustomEvent('photoia:gallery-changed'));return true;
 });
 saveQueue=job.catch(()=>{});
 return job.catch(e=>{if(valid(t))status('No se pudo guardar. Reintenta o exporta una copia.');console.warn('[Project save]',e);if(strict)throw e;return false});
}
async function listProjects(){return(await store()).list()}
async function openProject(id){
 const seq=++loadSequence;++epoch;await prepareSwitch();if(seq!==loadSequence)return false;
 const saved=await(await store()).load(id);if(!saved)throw R().error('MISSING_PROJECT');if(seq!==loadSequence)return false;
 saved.assets.forEach(a=>assets.set(a.id,a));if(!await hydrate(saved.session,()=>seq===loadSequence))return false;
 await(await store()).activate(id);if(seq!==loadSequence)return false;document.getElementById('project-recovery').hidden=true;status('Proyecto abierto');document.dispatchEvent(new CustomEvent('photoia:image-loaded'));return true;
}
async function renameProject(id,name){
 await saveNow({strict:true});await(await store()).rename(id,name);
 if(session?.current.id===id){++epoch;for(const d of [session.current,...session.past,...session.future]){d.source.fileName??=d.name;d.name=String(name).trim()}document.getElementById('project-title').textContent=session.current.name;syncHistory()}
 document.dispatchEvent(new CustomEvent('photoia:gallery-changed'));
}
async function deleteProject(id){
 deletingProjects.add(id);clearTimeout(saveTimer);
 const removal=saveQueue.catch(()=>{}).then(async()=>{await(await store()).remove(id)});
 saveQueue=removal.catch(()=>{});
 try{
  await removal;
  const recovery=document.getElementById('project-recovery');if(recovery?.dataset.projectId===id)recovery.hidden=true;
  if(session?.current.id===id)await api().clearCurrentPhoto({confirmed:true});else if(session)scheduleSave();
  document.dispatchEvent(new CustomEvent('photoia:gallery-changed'));
 }catch(e){deletingProjects.delete(id);if(session)scheduleSave();throw e}
}
async function offerRecovery(){try{
 const loaded=await(await store()).loadLatest();if(!loaded||session)return;const box=document.getElementById('project-recovery');if(!box)return;
 const projectId=loaded.session.current.id;box.dataset.projectId=projectId;box.hidden=false;document.dispatchEvent(new CustomEvent('photoia:project-status'));
 box.querySelector('[data-resume]').onclick=async()=>{
  if(session){box.hidden=true;return}
  try{if(await openProject(projectId)){box.hidden=true;status('Proyecto recuperado')}}catch(e){box.hidden=true;status(e.code==='MISSING_PROJECT'?'El proyecto ya no está disponible.':'No se pudo recuperar. Abre Mis proyectos para reintentar.')}
 };
 box.querySelector('[data-dismiss]').onclick=()=>{box.hidden=true;document.dispatchEvent(new CustomEvent('photoia:project-status'))};
 }catch(e){status('Recuperación no disponible');console.warn(e)}}

function clear(){loadSequence++;epoch++;window.PhotoLocalRetouch?.cancel();session=null;previewing=false;clearTimeout(saveTimer);status('Sin proyecto')}
async function reset(){if(!session)return;const before=session,view=capture(),old=before.current.size,size={width:before.current.source.width,height:before.current.source.height};for(const o of view.objects){if(o.clipPath?.absolutePositioned){o.clipPath.left*=size.width/old.width;o.clipPath.top*=size.height/old.height;o.clipPath.scaleX*=size.width/old.width;o.clipPath.scaleY*=size.height/old.height}o.left*=size.width/old.width;o.top*=size.height/old.height;o.scaleX*=size.width/old.width;o.scaleY*=size.height/old.height;if(o.photoRole==='main')Object.assign(o,{filters:[],photoAdjustments:{},angle:0,flipX:false,flipY:false,visible:true,opacity:1,clipPath:null})}const next=D().commit(before,token(),{operations:[],view,selection:null,size});if(await hydrate(next,()=>session===before)){session.current.view=capture();scheduleSave()}}
window.PhotoProject={getDocument,token,valid,resolveAsset,importFile,snapshot,restore,markPreview,cancelPreview,recordRaster,commitOperation,exportDocument,committedPreview,saveNow,offerRecovery,clear,reset,listProjects,openProject,renameProject,deleteProject,prepareSwitch,get restoring(){return restoring},get active(){return !!session},get previewing(){return previewing}};
})();
