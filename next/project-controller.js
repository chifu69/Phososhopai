import {workingCopy} from './image-working-copy.js?v=0.2.1';
import {EngineClient} from './engine-client.js?v=0.2.0';
import {save,loadLatest} from './project-store.js?v=0.2.0';
import {failure} from './protocol.js?v=0.2.0';
export class ProjectController extends EventTarget{
 constructor(){super();this.client=new EngineClient();this.info=null;this.original=null;this.montageOriginals={};this.previewVersion=0;this.saveQueue=Promise.resolve()}
 emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}))}
 async start(){await this.client.start()}
 async open(file){if(file.size>64*1024*1024)throw failure('LIMIT_EXCEEDED');const copy=await workingCopy(file,4000000);const bytes=await copy.file.arrayBuffer();const info=await this.client.openImage(bytes);this.original=file;this.montageOriginals={};this.info={...info,workingCopy:copy.resized,name:file.name||'Fotografía'};this.changed();await this.render();return info}
 async resume(){const snapshot=await loadLatest();if(!snapshot)throw failure('INVALID_INPUT');const info=await this.client.openProject(snapshot.engineBytes);this.original=snapshot.original;this.montageOriginals=snapshot.montageOriginals||{};this.info={...info,workingCopy:!!snapshot.metadata.workingCopy,name:snapshot.metadata.name||'Fotografía'};this.changed();await this.render()}
 changed(){this.previewVersion++;this.emit('document',this.info)}
 async render(ev){const generation=++this.previewVersion,epoch=this.client.epoch;const frame=await this.client.request('renderPreview',ev===undefined?{}:{ev});if(generation===this.previewVersion&&epoch===this.client.epoch)this.emit('preview',frame)}
 async apply(action,payload={}){this.previewVersion++;const name=this.info.name;const info=await this.client.request(action,payload);this.info={...this.info,...info,name};this.changed();await this.render()}
 save(){
  const epoch=this.client.epoch,revision=this.client.revision,metadata=structuredClone(this.info),original=this.original,montageOriginals={...this.montageOriginals};
  if(!metadata||!original)return Promise.reject(failure('INVALID_INPUT'));
  const job=this.saveQueue.catch(()=>{}).then(async()=>{
   if(epoch!==this.client.epoch||revision!==this.client.revision)throw failure('STALE_RESULT');
   const result=await this.client.request('serialize');
   if(epoch!==this.client.epoch||revision!==this.client.revision)throw failure('STALE_RESULT');
   await save({engineBytes:result.bytes,original,montageOriginals,metadata});return metadata;
  });this.saveQueue=job.catch(()=>{});return job;
 }
 async export(){return this.client.request('exportImage')}
 dispose(){this.previewVersion++;this.client.dispose()}
}
