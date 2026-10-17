import {failure} from './protocol.js?v=0.2.0';
// Only working pixels are resized. Callers retain the original File for recovery/download.
export async function workingCopy(file,maxPixels){
 if(file.size>64*1024*1024)throw failure('LIMIT_EXCEEDED');
 const magic=new Uint8Array(await file.slice(0,8).arrayBuffer());
 const jpeg=magic[0]===255&&magic[1]===216&&magic[2]===255;
 const png=[137,80,78,71,13,10,26,10].every((n,i)=>magic[i]===n);
 if(!jpeg&&!png)throw failure('INVALID_INPUT');
 let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw failure('INVALID_INPUT')}
 try{
  const {width,height}=bitmap;
  if(!width||!height||width>16384||height>16384||width*height>64000000)throw failure('LIMIT_EXCEEDED');
  if(width*height<=maxPixels)return {file,resized:false,width,height};
  const scale=Math.sqrt(maxPixels/(width*height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.floor(width*scale));canvas.height=Math.max(1,Math.floor(height*scale));
  try{
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw failure('LIMIT_EXCEEDED');
   return {file:blob,resized:true,width,height};
  }finally{canvas.width=canvas.height=1}
 }finally{bitmap.close()}
}
