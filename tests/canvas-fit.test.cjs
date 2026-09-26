const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('app.js','utf8');
let wrap={clientWidth:366,clientHeight:180};
const photo={width:600,height:1200,angle:0,scaleX:1,scaleY:1,scale(v){this.scaleX=this.scaleY=v},set(p){Object.assign(this,p)},setCoords(){}};
const layer={left:100,top:100,scaleX:1,scaleY:1,set(p){Object.assign(this,p)},setCoords(){}};
const canvas={width:366,height:608,setDimensions(p){Object.assign(this,p)},getObjects(){return [photo,layer]},calcOffset(){},requestRenderAll(){}};
const ctx=vm.createContext({state:{photo,canvas},$:()=>wrap,window:{innerHeight:844},document:{body:{classList:{contains:()=>true}}}});
vm.runInContext(src.slice(src.indexOf('function getPhotoDisplayRatio('),src.indexOf('function snapshot('))+';globalThis.fit=fitCanvas;',ctx);
for(const [w,h] of [[366,180],[366,560],[720,220],[280,110]]){
 wrap={clientWidth:w,clientHeight:h};ctx.fit();assert.equal(canvas.width,w);assert.equal(canvas.height,h,'Fabric canvas must follow the visible wrapper height');
 assert(photo.width*photo.scaleX<=w&&photo.height*photo.scaleY<=h,'Entire portrait must fit');
 const prior=JSON.stringify(layer);ctx.fit();assert.equal(JSON.stringify(layer),prior,'Repeated fit must not drift layers');
}
photo.angle=90;ctx.fit();assert(photo.height*photo.scaleX<=wrap.clientWidth&&photo.width*photo.scaleY<=wrap.clientHeight,'Rotated photo must fit');
console.log('PASS visible canvas dimensions, portrait/rotation coverage and stable layers');
