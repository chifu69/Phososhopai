(() => {
'use strict';
const R=PhotoRenderer;
for(const kind of ['local-adjust','local-repair'])R.register(kind,{render:async(c,o,ctx)=>{
 const recipe=o.params.recipe;let selection;
 if(recipe.selection){const a=await ctx.resolveAsset(recipe.selection.assetId);selection={...recipe.selection,data:new Uint8Array(await a.blob.arrayBuffer())}}
 const x=c.getContext('2d',{willReadFrequently:true}),input=x.getImageData(0,0,c.width,c.height),output=PhotoLocalRetouchCore.render(input,recipe,selection);x.putImageData(new ImageData(output.data,output.width,output.height),0,0);return c;
}});
R.register('filters',{render:async(c,o)=>{const filters=await new Promise(r=>fabric.util.enlivenObjects(o.params.filters,r,'fabric.Image.filters')),out=R.canvas(c.width,c.height);new fabric.Canvas2dFilterBackend().applyFilters(filters,c,c.width,c.height,out);return out}});
R.register('preset',{render:async(c,o)=>{const F=fabric.Image.filters,filters=[],name=o.params.name;
 if(name==='bw')filters.push(new F.Grayscale());
 else if(name==='vivid')filters.push(new F.Brightness({brightness:.035}),new F.Contrast({contrast:.1}),new F.Saturation({saturation:.24}));
 else if(name==='portrait')filters.push(new F.Brightness({brightness:.035}),new F.Contrast({contrast:.025}),new F.Saturation({saturation:.035}),new F.Blur({blur:.012}));
 else filters.push(new F.Brightness({brightness:.028}),new F.Contrast({contrast:.075}),new F.Saturation({saturation:.09}),new F.Convolute({matrix:[0,-.07,0,-.07,1.28,-.07,0,-.07,0]}));
 const out=R.canvas(c.width,c.height);new fabric.Canvas2dFilterBackend().applyFilters(filters,c,c.width,c.height,out);return out;
}});
R.register('orient',{render:async(c,o)=>{const p=o.params,a=p.angle*Math.PI/180,w=Math.round(Math.abs(Math.cos(a))*c.width+Math.abs(Math.sin(a))*c.height),h=Math.round(Math.abs(Math.sin(a))*c.width+Math.abs(Math.cos(a))*c.height),out=R.canvas(w,h),ctx=out.getContext('2d');ctx.translate(w/2,h/2);ctx.rotate(a);ctx.scale(p.flipX?-1:1,p.flipY?-1:1);ctx.drawImage(c,-c.width/2,-c.height/2);return out}});
R.register('smart',{render:async(c,o)=>{if(o.params.engine!=='local')throw R.error('UNSUPPORTED_OPERATION');return smartPixels(c,o.params.recipe)}});
function smartPixels(c,recipe){const w=c.width,h=c.height,ctx=c.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,w,h),d=im.data;
  const exposure=Math.pow(2,Number(recipe.exposure||0));
  const shadows=Number(recipe.shadows||0)/100,highlights=Number(recipe.highlights||0)/100;
  const contrast=Number(recipe.contrast||0)/100,vibrance=Number(recipe.vibrance||0)/100;
  const warmth=Number(recipe.warmth||0)/100,clarity=Number(recipe.clarity||0)/100;
  const blackPoint=Number(recipe.blackPoint||0)/255,whitePoint=Number(recipe.whitePoint||255)/255,gamma=Math.max(.75,Math.min(1.3,Number(recipe.gamma||1))),denoise=Math.max(0,Number(recipe.denoise||0))/100;
  const clamp8=v=>v<0?0:v>255?255:v;
  const magicLut=recipe.magic&&window.PhotoSmartCore?.magicTone?Float32Array.from({length:256},(_,v)=>window.PhotoSmartCore.magicTone(v,recipe)/255):null;
  for(let i=0;i<d.length;i+=4){
   let r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
   const skin=recipe.portraitProtection&&r>g*.94&&r>b*1.02&&r>.18;
   // Adaptive black/white normalization from the actual photo histogram.
   const span=Math.max(.18,whitePoint-blackPoint);
   r=Math.max(0,Math.min(1,(r-blackPoint)/span));
   g=Math.max(0,Math.min(1,(g-blackPoint)/span));
   b=Math.max(0,Math.min(1,(b-blackPoint)/span));
   if(magicLut){
    r=magicLut[Math.round(r*255)];g=magicLut[Math.round(g*255)];b=magicLut[Math.round(b*255)];
   }else{r=Math.pow(r,1/gamma)*exposure;g=Math.pow(g,1/gamma)*exposure;b=Math.pow(b,1/gamma)*exposure;}
   let l=.2126*r+.7152*g+.0722*b;
   const sw=(1-Math.min(1,l))**2,hw=Math.min(1,l)**2;
   const lift=magicLut?0:shadows*.30*sw,rec=magicLut?0:highlights*.26*hw;
   r=r+lift-rec;g=g+lift-rec;b=b+lift-rec;
   // Smooth S-curve contrast around perceptual mid gray.
   const cf=magicLut?1:1+contrast*.82;r=.5+(r-.5)*cf;g=.5+(g-.5)*cf;b=.5+(b-.5)*cf;
   l=.2126*r+.7152*g+.0722*b;
   const mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx>0?(mx-mn)/mx:0;
   const vf=1+vibrance*(1-sat)*1.35*(skin?.4:1);
   r=l+(r-l)*vf;g=l+(g-l)*vf;b=l+(b-l)*vf;
   r+=warmth*.055;g+=warmth*.012;b-=warmth*.055;
   d[i]=clamp8(r*255);d[i+1]=clamp8(g*255);d[i+2]=clamp8(b*255);
  }
  ctx.putImageData(im,0,0);
  // Lightweight edge-preserving noise cleanup. It is intentionally modest on iPhone.
  if(denoise>0.01){
   const src=ctx.getImageData(0,0,w,h),out=ctx.createImageData(w,h),sd=src.data,od=out.data;od.set(sd);
   const mix=Math.min(.24,denoise*.55);
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=(y*w+x)*4;
    for(let ch=0;ch<3;ch++){
     const avg=(sd[p-4+ch]+sd[p+4+ch]+sd[p-w*4+ch]+sd[p+w*4+ch])/4;
     const diff=Math.abs(sd[p+ch]-avg);
     od[p+ch]=diff<22?clamp8(sd[p+ch]*(1-mix)+avg*mix):sd[p+ch];
    }
    od[p+3]=sd[p+3];
   }
   ctx.putImageData(out,0,0);
  }
  // modest local clarity/sharpening after tone and color processing
  if(clarity>0.01){
   const src=ctx.getImageData(0,0,w,h),out=ctx.createImageData(w,h),sd=src.data,od=out.data;
   const amount=Math.min(.55,clarity*.55);
   od.set(sd);
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=(y*w+x)*4;
    for(let ch=0;ch<3;ch++){
     const blur=(sd[p-4+ch]+sd[p+4+ch]+sd[p-w*4+ch]+sd[p+w*4+ch]+sd[p+ch]*4)/8;
     od[p+ch]=clamp8(sd[p+ch]+(sd[p+ch]-blur)*amount);
    }
    od[p+3]=sd[p+3];
   }
   ctx.putImageData(out,0,0);
  }
return c;
}
window.PhotoOperationAdapters={smartPixels};
})();
