// Run with node tests/garment-recolor.test.cjs; no dependencies required.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('segmentation.js','utf8');
const start=source.indexOf('let garmentColorBaseDataUrl='),end=source.indexOf('async function previewGarmentColor',start);
const context=vm.createContext({state:{mask:null},console});
vm.runInContext(source.slice(start,end)+`;globalThis.test={analyzeGarmentPixels,garmentShadePixel,garmentProtectionAt,garmentMaskAlpha,garmentColorDataUrl,garmentLinear,hexRgb};`,context);
const t=context.test,W=120,H=120,mask=new Float32Array(W*H).fill(1),pixels=new Uint8ClampedArray(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const j=(y*W+x)*4,v=120+Math.round(28*Math.sin(x/20)+3*Math.sin(y*1.8));pixels.set([v,Math.round(v*.8),Math.round(v*.6),255],j);
}
const original=pixels.slice();
function rect(x,y,w,h,color){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixels.set([...color,255],(yy*W+xx)*4)}
rect(30,35,16,24,[20,22,24]); // radio, including flat interior
rect(65,35,3,28,[210,215,220]); // pen/metal clip
rect(80,40,12,12,[225,195,70]); // badge
const analysis=t.analyzeGarmentPixels(pixels,W,H,mask);
for(const [x,y] of [[38,47],[66,49],[86,46]])assert(analysis.protection[y*W+x]>.95,'Object interior must be protected');
assert(analysis.protection[100*W+60]<.1,'Smooth fabric must remain editable');
assert(analysis.protection[(H-1)*W+60]<.1,'Shirt reaching crop edge must remain editable');
assert.deepEqual(mask,new Float32Array(W*H).fill(1),'Analysis must not change selection');
const fabric=t.analyzeGarmentPixels(original,W,H,mask);
assert(fabric.protection.every(v=>v===0),'Folds and fine texture must not be classified as objects');
for(const hex of ['#000000','#ffffff','#808080','#2050d0']){
 const target=Object.values(t.hexRgb(hex)).map(v=>.008+.92*t.garmentLinear[v]);
 const values=[45,70,100,130,160,200,235].map(v=>Array.from(t.garmentShadePixel(v,v,v,target,.2)));
 for(let i=1;i<values.length;i++)for(let k=0;k<3;k++)assert(values[i][k]>values[i-1][k],'Shading must stay strictly ordered without clipping');
 if(hex!=='#2050d0')for(const rgb of values)assert(Math.abs(rgb[0]-rgb[2])<1e-9,'Neutral dyes must stay neutral');
 const dark=t.garmentShadePixel(100,100,100,target,.2),light=t.garmentShadePixel(104,104,104,target,.2);
 assert(light[1]-dark[1]>.2,'Fine luminance texture must survive');
}
// Exercise the actual renderer using an in-memory canvas at native resolution.
context.document={createElement(){let data;return {width:W,height:H,getContext(){return {drawImage(){data=pixels.slice()},getImageData(){return {data}},putImageData(im){data=im.data}}},toDataURL(){return Array.from(data)}}}};
context.state.mask={width:W,height:H,data:new Uint8Array(W*H).fill(255)};
context.analysis=analysis;
vm.runInContext('garmentColorBaseImage={width:120,height:120};garmentColorAnalysis={...analysis,mask:state.mask};',context);
assert.deepEqual(Array.from(t.garmentColorDataUrl('#2050d0',0)),Array.from(pixels),'Zero intensity must be byte-identical');
const recolored=Array.from(t.garmentColorDataUrl('#2050d0',100));
for(const [x,y] of [[38,47],[66,49],[86,46]]){const j=(y*W+x)*4;assert.deepEqual(recolored.slice(j,j+4),Array.from(pixels.slice(j,j+4)))}
assert.notEqual(recolored[(119*W+60)*4],pixels[(119*W+60)*4],'Bottom of cropped shirt must recolor');
context.state.mask.data[100*W+60]=0;
const outside=Array.from(t.garmentColorDataUrl('#2050d0',100)),j=(100*W+60)*4;
assert.deepEqual(outside.slice(j,j+4),Array.from(pixels.slice(j,j+4)),'Outside mask must remain unchanged');
console.log('PASS: texture, neutral dyes, pocket objects, mask immutability, crop-edge coverage, zero intensity, renderer');
