const {withEditor,assert}=require('./helpers.cjs');
withEditor(async p=>{const r=await p.evaluate(async()=>{
 const store=await PhotoProjectStore.open(),a={id:'a',blob:new Blob(['original']),mime:'image/png',width:4,height:3},s=PhotoDocument.create({assetId:'a',mime:a.mime,width:4,height:3},'saved');await store.save(s,[a]);
 const codes=[];try{const bad=PhotoDocument.create({assetId:'missing',mime:a.mime,width:4,height:3},'bad');await store.save(bad,[])}catch(e){codes.push(e.code)}
 const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='metadata')throw new DOMException('Simulated full disk','QuotaExceededError');return put.apply(this,args)};
 try{await store.save({...s,current:{...s.current,name:'partial'}},[a])}catch(e){codes.push(e.code)}finally{IDBObjectStore.prototype.put=put}
 try{await store.save({...s,current:{...s.current,schemaVersion:2}},[a])}catch(e){codes.push(e.code)}
 store.close();const again=await PhotoProjectStore.open(),loaded=await again.loadLatest();
 const b={...a,id:'b',blob:new Blob(['new'])},next=PhotoDocument.create({assetId:'b',mime:b.mime,width:4,height:3},'next');await again.save(next,[b]);const cleaned=await again.loadLatest();again.close();return {codes,name:loaded.session.current.name,blob:await loaded.assets[0].blob.text(),cleaned:cleaned.assets.map(a=>a.id)};
 });assert.deepEqual(r.codes,['MISSING_ASSET','STORAGE_FULL','UNSUPPORTED_SCHEMA']);assert.equal(r.name,'saved');assert.equal(r.blob,'original');assert.deepEqual(r.cleaned,['b']);console.log('PASS IndexedDB reload, missing asset, aborted quota transaction, schema rejection and orphan cleanup');}).catch(e=>{console.error(e);process.exitCode=1});
