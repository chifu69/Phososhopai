import {validRequest} from './protocol.js';
let engine,epoch=0,revision=0,wasm;
try{const mod=await import('./engine/photoia_photocraft_bridge.js');wasm=await mod.default();engine=new mod.Bridge();postMessage({type:'ready'})}catch(e){postMessage({type:'fatal',message:String(e)})}
self.onmessage=({data:m})=>{
 if(!validRequest(m))return;
 const opening=m.action==='openImage'||m.action==='openProject';
 try{
  if(!engine)throw Error('ENGINE_UNAVAILABLE');
  if(opening){if(m.epoch<epoch)throw Error('STALE_RESULT');epoch=m.epoch}else if(m.epoch!==epoch||m.expectedRevision!==revision)throw Error('STALE_RESULT');
  let result,transfer=[];
  if(opening){const b=m.payload?.bytes;if(!(b instanceof ArrayBuffer)||b.byteLength>64*1024*1024)throw Error('LIMIT_EXCEEDED');result=JSON.parse(engine[m.action==='openImage'?'open_image':'open_project'](new Uint8Array(b)));revision=result.revision}
  else if(m.action==='inspect')result=JSON.parse(engine.inspect());
  else if(m.action==='renderPreview'){
   const packed=engine.preview(m.payload?.ev??undefined),header=new DataView(packed.buffer,packed.byteOffset,8),rgba=packed.slice(8).buffer;
   result={width:header.getUint32(0,true),height:header.getUint32(4,true),rgba,wasmBytes:wasm.memory.buffer.byteLength};transfer=[rgba];
  }else if(m.action==='serialize'||m.action==='exportImage'){
   const bytes=engine[m.action==='serialize'?'serialize':'export_png']().buffer,info=JSON.parse(engine.inspect());result={bytes,mime:m.action==='serialize'?'application/x-pcraft':'image/png',width:info.width,height:info.height};transfer=[bytes];
  }else if(m.action==='close'){engine.free();engine=null;revision=0;result=null}
  else{result=JSON.parse(engine.execute(m.action,JSON.stringify(m.payload)));revision=result.revision}
  postMessage({protocol:1,id:m.id,epoch:m.epoch,revision,ok:true,result},transfer);
 }catch(e){const message=String(e),code=['STALE_RESULT','LIMIT_EXCEEDED','UNSUPPORTED_FORMAT','ENGINE_UNAVAILABLE'].find(c=>message.includes(c))||'INVALID_INPUT';postMessage({protocol:1,id:m.id,epoch:m.epoch,revision,ok:false,error:{code,message}})}
};
