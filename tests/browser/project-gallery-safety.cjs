const {withEditor,importPhoto,assert}=require('./helpers.cjs');
withEditor(async p=>{
 await importPhoto(p,320,240);const a=await p.evaluate(()=>PhotoIA.getDocument().id);await importPhoto(p,200,300);
 const r=await p.evaluate(async a=>{const b=PhotoIA.getDocument().id,before=PhotoIA.state.photo;PhotoIA.addText();const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='revisions')throw new DOMException('full','QuotaExceededError');return put.apply(this,args)};let code;try{await PhotoProject.openProject(a)}catch(e){code=e.code}finally{IDBObjectStore.prototype.put=put}return {b,code,samePhoto:PhotoIA.state.photo===before,id:PhotoIA.getDocument().id}},a);
 assert.equal(r.code,'STORAGE_FULL');assert(r.samePhoto);assert.equal(r.id,r.b);
 await p.evaluate(()=>PhotoProjectGallery.open());await p.locator(`.project-card[data-project-id="${a}"]`).waitFor();
 p.once('dialog',d=>d.accept('Recuerdo'));await p.locator(`.project-card[data-project-id="${a}"]`).getByRole('button',{name:'Renombrar'}).click();await p.waitForFunction(id=>document.querySelector(`[data-project-id="${id}"] strong`)?.textContent==='Recuerdo',a);
 p.once('dialog',d=>d.accept());await p.locator(`.project-card[data-project-id="${r.b}"]`).getByRole('button',{name:'Eliminar'}).click();await p.waitForFunction(()=>!PhotoIA.getDocument());
 await p.waitForTimeout(650);assert.equal(await p.evaluate(async()=> (await PhotoProject.listProjects()).length),1);
 await p.locator(`.project-card[data-project-id="${a}"] .project-card-preview`).click();await p.waitForFunction(id=>PhotoIA.getDocument()?.id===id,a);assert.equal(await p.evaluate(()=>PhotoIA.getDocument().source.fileName),'test.png');
 console.log('PASS quota blocks navigation without losing editor; gallery rename/delete/open and original filename');
}).catch(e=>{console.error(e);process.exitCode=1});
