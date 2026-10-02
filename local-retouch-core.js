/* Deterministic, DOM-free local retouching. All recipes use photo coordinates. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function number(v,f=0){return Number.isFinite(Number(v))?Number(v):f}
function dabs(stroke,width,height){
 const radius=Math.max(.5,clamp(number(stroke.radius,.05),.001,1)*Math.min(width,height)),step=Math.max(.5,radius/4),points=stroke.points||[],out=[];
 for(let i=0;i<points.length;i++){
  const p={x:number(points[i].x)*width,y:number(points[i].y)*height};
  if(i===0)out.push(p);else{const a=points[i-1],x=number(a.x)*width,y=number(a.y)*height,n=Math.max(1,Math.ceil(Math.hypot(p.x-x,p.y-y)/step));for(let j=1;j<=n;j++)out.push({x:x+(p.x-x)*j/n,y:y+(p.y-y)*j/n})}
 }
 return {points:out,radius};
}
function strokeCoverage(width,height,stroke,callback){
 const {points,radius}=dabs(stroke,width,height);if(!points.length)return;
 let left=width,top=height,right=0,bottom=0;
 for(const p of points){left=Math.min(left,Math.floor(p.x-radius));top=Math.min(top,Math.floor(p.y-radius));right=Math.max(right,Math.ceil(p.x+radius));bottom=Math.max(bottom,Math.ceil(p.y+radius))}
 left=clamp(left,0,width);right=clamp(right,0,width);top=clamp(top,0,height);bottom=clamp(bottom,0,height);
 const span=right-left;if(span<=0||bottom<=top)return;const coverage=new Float32Array(span*(bottom-top)),soft=clamp(number(stroke.softness,.5),0,1),inner=1-soft,opacity=clamp(number(stroke.opacity,1),0,1);
 for(const p of points){const x0=Math.max(left,Math.floor(p.x-radius)),x1=Math.min(right,Math.ceil(p.x+radius)),y0=Math.max(top,Math.floor(p.y-radius)),y1=Math.min(bottom,Math.ceil(p.y+radius));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const dist=Math.hypot(x+.5-p.x,y+.5-p.y)/radius;if(dist>=1)continue;const f=dist<=inner?1:(1-dist)/Math.max(.0001,soft),a=f*f*(3-2*f)*opacity,i=(y-top)*span+x-left;coverage[i]=Math.max(coverage[i],a)}
 }
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const a=coverage[(y-top)*span+x-left];if(a>0)callback(x,y,a,radius)}
}
function mask(width,height,strokes){const m=new Float32Array(width*height);for(const stroke of strokes)strokeCoverage(width,height,stroke,(x,y,a)=>{const i=y*width+x;m[i]=stroke.erase?m[i]*(1-a):m[i]+(1-m[i])*a});return m}
function sample(data,width,height,x,y){
 if(x<0||y<0||x>width-1||y>height-1)return null;
 const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=x-x0,fy=y-y0,out=[0,0,0,0];
 // Premultiply samples to avoid pulling hidden black pixels across transparent edges.
 let alpha=0;for(const [sx,sy,w]of [[x0,y0,(1-fx)*(1-fy)],[x1,y0,fx*(1-fy)],[x0,y1,(1-fx)*fy],[x1,y1,fx*fy]]){const i=(sy*width+sx)*4,a=data[i+3]/255*w;alpha+=a;for(let c=0;c<3;c++)out[c]+=data[i+c]*a}
 if(alpha<1e-6)return null;for(let c=0;c<3;c++)out[c]/=alpha;out[3]=alpha;return out;
}
function mean(data,width,height,x,y,radius){const out=[0,0,0];let total=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const p=sample(data,width,height,x+dx*radius/2,y+dy*radius/2);if(!p)continue;for(let c=0;c<3;c++)out[c]+=p[c]*p[3];total+=p[3]}return total?out.map(v=>v/total):out}
function render(image,recipe,selection){
 const {width,height,data}=image;if(!(width>0&&height>0)||data.length!==width*height*4)throw new Error('INVALID_IMAGE');const output=new Uint8ClampedArray(data),strokes=recipe.strokes||[],p=recipe.params||{},intensity=clamp(number(p.intensity,1),0,1);
 if(recipe.kind==='local-adjust'){
  const coverage=mask(width,height,strokes),gain=2**clamp(number(p.exposure),-2,2),warm=clamp(number(p.temperature),-100,100)/100,sat=1+clamp(number(p.saturation),-100,100)/100;
  for(let i=0;i<coverage.length;i++){let a=coverage[i]*intensity;if(selection){const x=i%width,y=Math.floor(i/width),sx=Math.min(selection.width-1,Math.floor((x+.5)*selection.width/width)),sy=Math.min(selection.height-1,Math.floor((y+.5)*selection.height/height));a*=selection.data[sy*selection.width+sx]/255}if(!a||!data[i*4+3])continue;const j=i*4,r=data[j]*gain+warm*22,g=data[j+1]*gain+warm*4,b=data[j+2]*gain-warm*22,l=.2126*r+.7152*g+.0722*b;for(const [c,v]of [[0,r],[1,g],[2,b]])output[j+c]=data[j+c]+(clamp(l+(v-l)*sat,0,255)-data[j+c])*a}
 }else if(recipe.kind==='local-repair'){
  for(const stroke of strokes){
   const offset=stroke.offset||{},dx=number(offset.x)*width,dy=number(offset.y)*height;
   let correction=[0,0,0];if(p.mode==='heal'&&!stroke.erase&&stroke.points?.length){const pt=stroke.points[0],x=pt.x*width,y=pt.y*height,r=Math.max(1,number(stroke.radius,.05)*Math.min(width,height)),src=mean(data,width,height,x+dx,y+dy,r),dst=mean(data,width,height,x,y,r);correction=dst.map((v,i)=>clamp(v-src[i],-80,80))}
   strokeCoverage(width,height,stroke,(x,y,a)=>{const j=(y*width+x)*4;if(!data[j+3])return;const source=stroke.erase?[data[j],data[j+1],data[j+2],1]:sample(data,width,height,x+dx,y+dy);if(!source)return;a*=stroke.erase?1:intensity*Math.min(1,source[3]/(data[j+3]/255));for(let c=0;c<3;c++){const value=stroke.erase?source[c]:clamp(source[c]+correction[c],0,255);output[j+c]+= (value-output[j+c])*a}});
  }
 }else throw new Error('UNSUPPORTED_OPERATION');
 return {width,height,data:output};
}
const api={render,mask};root.PhotoLocalRetouchCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
