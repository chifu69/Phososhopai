const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async(p,{ready})=>{
 await importPhoto(p,320,240);const a=await p.evaluate(async()=>{await PhotoProject.saveNow();return PhotoIA.getDocument().id});await importPhoto(p,200,300);
 const result=await p.evaluate(async a=>{if(!PhotoProject.openProject)return {missing:true};const b=PhotoIA.getDocument().id;await PhotoProject.saveNow();await PhotoProject.openProject(a);const token=PhotoProject.token();await PhotoProject.openProject(b);await PhotoProject.openProject(a);const stale=!PhotoProject.valid(token);await PhotoProject.renameProject(a,'Viaje');return {stale,count:(await PhotoProject.listProjects()).length,name:PhotoIA.getDocument().name,b}},a);
 assert(!result.missing,'Gallery navigation required');assert(result.stale);assert.equal(result.count,2);assert.equal(result.name,'Viaje');
 await p.reload({waitUntil:'domcontentloaded'});await ready();await p.locator('[data-resume]').click();await p.waitForFunction(()=>PhotoIA.getDocument()?.name==='Viaje');await p.evaluate(b=>PhotoProject.openProject(b),result.b);assert.equal(await p.evaluate(()=>PhotoIA.getDocument().size.height),300);console.log('PASS gallery navigation, epoch, rename and multiple projects after reload');
}).catch(e=>{console.error(e);process.exitCode=1});
