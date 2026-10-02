const assert=require('node:assert/strict');let C;try{C=require('../local-retouch-core.js')}catch{}assert(C,'local retouch pixel engine required');
const w=32,h=24,data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;data[i]=x<16?80:140;data[i+1]=100;data[i+2]=120;data[i+3]=(x===0?0:200)}
const source={width:w,height:h,data},stroke={points:[{x:.25,y:.5},{x:.4,y:.5}],radius:.15,softness:.5,opacity:1},recipe={kind:'local-adjust',strokes:[stroke],params:{exposure:1,temperature:0,saturation:0,intensity:1}};
const before=data.slice(),out=C.render(source,recipe);assert.deepEqual(data,before,'source mutated');assert.equal(out.data[(12*w+8)*4],160,'exposure at center');assert.equal(out.data[(2*w+28)*4],140,'outside changed');for(let i=3;i<data.length;i+=4)assert.equal(out.data[i],data[i],'alpha changed');
assert.deepEqual(C.render(source,{...recipe,params:{exposure:0,intensity:1}}).data,data,'zero effect');
const erase={...stroke,erase:true,radius:.3,softness:0};assert.equal(C.render(source,{...recipe,strokes:[stroke,erase]}).data[(12*w+8)*4],80,'erase failed');
const clone={kind:'local-repair',strokes:[{...stroke,points:[{x:.75,y:.5}],offset:{x:-.5,y:0},radius:.18}],params:{mode:'clone',intensity:1}};assert.equal(C.render(source,clone).data[(12*w+24)*4],80,'clone source mismatch');
const heal=C.render(source,{...clone,params:{mode:'heal',intensity:1}});assert(Math.abs(heal.data[(12*w+24)*4]-140)<4,'heal did not match destination tone');
const edge=C.render(source,{...clone,strokes:[{...clone.strokes[0],offset:{x:-2,y:0}}]});assert.deepEqual(edge.data,data,'out-of-bounds source added pixels');
const selection=new Uint8Array(w*h);assert.deepEqual(C.render(source,recipe,{data:selection,width:w,height:h}).data,data,'empty selection ignored');console.log('PASS local exposure, immutable alpha/source, erase, clone, heal, source edges and selection');
