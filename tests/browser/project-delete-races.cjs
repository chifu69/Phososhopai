const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async(p,{ready})=>{
 await importPhoto(p,320,240);
 const r=await p.evaluate(async()=>{
  const id=PhotoIA.getDocument().id,render=PhotoRenderer.renderExport;
  let releaseFirst,releaseSecond,entered;const first=new Promise(r=>releaseFirst=r),second=new Promise(r=>releaseSecond=r),started=new Promise(r=>entered=r);let calls=0;
  PhotoRenderer.renderExport=async(...args)=>{if(++calls===1){entered();await first}else await second;return render(...args)};
  try{const saving=PhotoProject.saveNow();await started;const deleting=PhotoProject.deleteProject(id),late=PhotoProject.saveNow();releaseFirst();await saving;await deleting;releaseSecond();await late;return (await PhotoProject.listProjects()).some(x=>x.id===id)}finally{releaseFirst();releaseSecond();PhotoRenderer.renderExport=render}
 });assert.equal(r,false,'deleted project resurrected by queued save');
 await importPhoto(p,320,240);await p.evaluate(()=>PhotoProject.saveNow());await p.reload({waitUntil:'domcontentloaded'});await ready();await p.locator('#project-recovery').waitFor({state:'visible'});
 await p.evaluate(async()=>{const items=await PhotoProject.listProjects();await PhotoProject.deleteProject(items[0].id);await document.querySelector('[data-resume]').onclick()});assert.equal(await p.evaluate(()=>PhotoIA.getDocument()),null,'deleted recovery snapshot resurrected');
 console.log('PASS queued-save and recovery-banner deletion races');
}).catch(e=>{console.error(e);process.exitCode=1});
