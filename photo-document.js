(function(root){
'use strict';
/** @typedef {{assetId:string,mime:string,width:number,height:number}} Source */
/** @typedef {{id:string,kind:string,enabled:boolean,params:Object,assetId:?string,effectiveSize:?Object}} Operation */
/** @typedef {{schemaVersion:1,id:string,revision:number,source:Source,size:Object,operations:Operation[],view:?Object,selection:?Object}} PhotoDocumentState */
/** @typedef {{current:PhotoDocumentState,past:PhotoDocumentState[],future:PhotoDocumentState[]}} Session */

const copy=v=>JSON.parse(JSON.stringify(v));
const fail=code=>{throw Object.assign(new Error(code),{code})};
function create(source,name){if(!source?.assetId||![source.width,source.height].every(n=>Number.isInteger(n)&&n>0))fail('INVALID_SOURCE');return {current:{schemaVersion:1,id:globalThis.crypto?.randomUUID?.()||`doc-${Date.now()}-${Math.random()}`,revision:0,name,source:copy(source),size:{width:source.width,height:source.height},operations:[],layers:[],selection:null,view:null},past:[],future:[]};}
function token(s){return {documentId:s.current.id,revision:s.current.revision};}
function upsertLastOperation(d,op){const next=copy(d),last=next.operations.at(-1);op={enabled:true,inputRevision:d.revision,assetId:null,effectiveSize:null,...copy(op)};if(last?.kind===op.kind&&op.kind==='smart')next.operations[next.operations.length-1]=op;else next.operations.push(op);return next;}
function commit(s,t,change){if(!t||t.documentId!==s.current.id||t.revision!==s.current.revision)fail('STALE_RESULT');let d=change.operation?upsertLastOperation(s.current,change.operation):copy(s.current);for(const k of ['view','layers','selection','size','operations'])if(k in change)d[k]=copy(change[k]);d.revision=s.current.revision+1;return {current:d,past:[...s.past,copy(s.current)].slice(-39),future:[]};}
function undo(s){if(!s.past.length)return s;const d=copy(s.past.at(-1));d.revision=s.current.revision+1;return {current:d,past:s.past.slice(0,-1),future:[copy(s.current),...s.future]};}
function redo(s){if(!s.future.length)return s;const d=copy(s.future[0]);d.revision=s.current.revision+1;return {current:d,past:[...s.past,copy(s.current)].slice(-39),future:s.future.slice(1)};}
function toDocumentTransform(t,v){return {...t,left:(t.left-v.offsetX)/v.scale,top:(t.top-v.offsetY)/v.scale,scaleX:t.scaleX/v.scale,scaleY:t.scaleY/v.scale};}
function toViewportTransform(t,v){return {...t,left:t.left*v.scale+v.offsetX,top:t.top*v.scale+v.offsetY,scaleX:t.scaleX*v.scale,scaleY:t.scaleY*v.scale};}
function assetIds(s){const ids=new Set();const walk=v=>{if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(k==='assetId'&&typeof x==='string')ids.add(x);else walk(x)}};walk(s);return [...ids];}
const api={create,token,commit,undo,redo,upsertLastOperation,toDocumentTransform,toViewportTransform,assetIds};if(typeof module!=='undefined')module.exports=api;root.PhotoDocument=api;
})(globalThis);
