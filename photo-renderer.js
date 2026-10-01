(() => {
'use strict';
const handlers=new Map();
const error=code=>Object.assign(new Error(code),{code});
const check=signal=>{if(signal?.aborted)throw error('STALE_RESULT')};
function canvas(w,h){if(!(w>0&&h>0)||w*h>24000000||w>16384||h>16384)throw error('EXPORT_TOO_LARGE');const c=document.createElement('canvas');c.width=Math.round(w);c.height=Math.round(h);return c;}
async function decodeSource(blob){const url=URL.createObjectURL(blob),image=new Image();try{image.src=url;await image.decode();return {image,width:image.naturalWidth,height:image.naturalHeight,dispose:()=>URL.revokeObjectURL(url)}}catch(e){URL.revokeObjectURL(url);throw e}}
async function fromAsset(id,resolveAsset,max=Infinity){const asset=await resolveAsset(id);if(!asset?.blob)throw error('MISSING_ASSET');const d=await decodeSource(asset.blob);try{const scale=Math.min(1,max/Math.max(d.width,d.height)),c=canvas(d.width*scale,d.height*scale);c.getContext('2d').drawImage(d.image,0,0,c.width,c.height);return c}finally{d.dispose()}}
function blob(c,format='image/png',quality=.96){return new Promise((resolve,reject)=>{try{c.toBlob(b=>b?resolve(b):reject(error('EXPORT_TOO_LARGE')),format,quality)}catch(e){reject(e)}})}
function register(kind,handler){handlers.set(kind,handler)}
async function renderBase(doc,resolveAsset,{maxDimension=Infinity,signal}={}){
 check(signal);const operations=doc.operations.filter(o=>o.enabled),lastRaster=operations.findLastIndex(o=>o.kind==='raster-result'),pending=operations.slice(lastRaster<0?0:lastRaster+1);
 let inputMax=maxDimension;for(const op of pending)if(op.kind==='crop')inputMax/=Math.min(op.params.width,op.params.height);
 let c=await fromAsset(lastRaster<0?doc.source.assetId:operations[lastRaster].assetId,resolveAsset,inputMax);
 try{for(const op of pending){check(signal);const h=handlers.get(op.kind);if(!h)throw error('UNSUPPORTED_OPERATION');const next=await h.render(c,op,{resolveAsset,signal,maxDimension:inputMax,doc});if(next!==c){c.width=c.height=1;c=next}}return c}catch(e){c.width=c.height=1;throw e}
}
function bounds(doc){const size=doc.size,main=doc.view?.objects?.find(o=>o.photoRole==='main'),angle=((main?.angle||0)%360+360)%360,rad=angle*Math.PI/180;return {width:Math.round(Math.abs(Math.cos(rad))*size.width+Math.abs(Math.sin(rad))*size.height),height:Math.round(Math.abs(Math.sin(rad))*size.width+Math.abs(Math.cos(rad))*size.height)}}
function info(doc){const out=bounds(doc),limitedBy=doc.operations.filter(o=>o.enabled&&o.kind==='raster-result').map(o=>o.params?.label||'Retoque de píxeles');return {...out,limitedBy,source:doc.source};}
function loadScene(c,json){return new Promise((r,j)=>{try{c.loadFromJSON(json,()=>r())}catch(e){j(e)}})}
async function renderExport(doc,resolveAsset,{format='image/png',quality=.96,size='original',background='#ffffff',signal,photoOnly=false}={}){
 const meta=info(doc),out=size==='original'?meta:size;const ratio=Math.min(1,out.width/meta.width,out.height/meta.height);let base,stage,url;
 // Account for several RGBA buffers before allocating large photos on mobile.
 if(meta.width*meta.height>24000000&&size==='original')throw error('EXPORT_TOO_LARGE');
 try{check(signal);base=await renderBase(doc,resolveAsset,{maxDimension:size==='original'?Infinity:Math.max(out.width,out.height),signal});
 const w=Math.max(1,Math.round(meta.width*ratio)),h=Math.max(1,Math.round(meta.height*ratio));const surface=canvas(w,h);stage=new fabric.StaticCanvas(surface,{enableRetinaScaling:false,renderOnAddRemove:false});
 const objects=JSON.parse(JSON.stringify(doc.view?.objects||[]));let main=objects.find(o=>o.photoRole==='main');
 if(!main){main={type:'image',photoRole:'main',left:doc.size.width/2,top:doc.size.height/2,originX:'center',originY:'center',angle:0};objects.unshift(main)}
 if(main.filters?.length){const filtered=await handlers.get('filters').render(base,{params:{filters:main.filters}});base.width=base.height=1;base=filtered;main.filters=[]}
 url=URL.createObjectURL(await blob(base));main.src=url;main.width=base.width;main.height=base.height;main.scaleX=doc.size.width/base.width;main.scaleY=doc.size.height/base.height;
 const layerURLs=[];
 async function resolveImages(list){for(const o of list){if(o.assetId){const a=await resolveAsset(o.assetId);o.src=URL.createObjectURL(a.blob);layerURLs.push(o.src)}if(o.clipPath)await resolveImages([o.clipPath]);if(o.objects)await resolveImages(o.objects)}}
 try{await resolveImages(objects);
 await loadScene(stage,{objects:objects.filter(o=>o.photoRole==='main'||(!photoOnly&&!o.excludeFromExport&&o.photoRole!=='preview-overlay'&&!/^vision-/.test(o.layerType||'')))});
 const p=stage.getObjects().find(o=>o.photoRole==='main');p.setCoords();const rect=p.getBoundingRect(true,true);
 stage.setViewportTransform([ratio,0,0,ratio,-rect.left*ratio,-rect.top*ratio]);if(format==='image/jpeg')stage.backgroundColor=background;stage.renderAll();check(signal);
 const result=await blob(stage.lowerCanvasEl,format,quality);if(result.type!==format)throw error('UNSUPPORTED_FORMAT');
 return {blob:result,width:w,height:h,effectiveSize:{width:w,height:h},limitedBy:meta.limitedBy};
 }finally{layerURLs.forEach(u=>URL.revokeObjectURL(u))}
 }catch(e){if(e.name==='RangeError')throw error('EXPORT_TOO_LARGE');throw e}finally{if(url)URL.revokeObjectURL(url);if(stage){stage.setDimensions({width:1,height:1});stage.dispose()}if(base)base.width=base.height=1}
}
async function renderPreview(doc,resolveAsset,{maxDimension=2000,signal}={}){const b=bounds(doc),s=Math.min(1,maxDimension/Math.max(b.width,b.height));return renderExport(doc,resolveAsset,{size:{width:b.width*s,height:b.height*s},signal,photoOnly:true})}
register('raster-result',{render:async(c,o,ctx)=>fromAsset(o.assetId,ctx.resolveAsset,ctx.maxDimension)});
register('crop',{render:async(c,o)=>{const {x,y,width,height}=o.params,out=canvas(c.width*width,c.height*height);out.getContext('2d').drawImage(c,x*c.width,y*c.height,width*c.width,height*c.height,0,0,out.width,out.height);return out}});
window.PhotoRenderer={register,renderBase,renderExport,renderPreview,decodeSource,canvas,blob,info,error,loadScene};
})();
