const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
for(const name of fs.readdirSync(__dirname).filter(n=>n.endsWith('.cjs')&&!['helpers.cjs','run.cjs'].includes(n)).sort()){
 const r=spawnSync(process.execPath,[path.join(__dirname,name)],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);
}
