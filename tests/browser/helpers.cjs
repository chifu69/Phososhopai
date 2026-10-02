const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
async function withEditor(work,{hasTouch=false}={}){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const root=path.resolve(__dirname,'../..');
 const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{const page=await browser.newPage({viewport:{width:390,height:844},hasTouch});page.on('pageerror',e=>console.error('PAGE',e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname.endsWith('fabric.min.js')&&process.env.FABRIC_TEST_PATH)return r.fulfill({path:process.env.FABRIC_TEST_PATH,contentType:'application/javascript'});if(u.origin!==url)return r.abort();if(/(?:opencv-engine|vision|onnx-engine|segmentation-worker)\.js$/.test(u.pathname)||/\/assets\/vendor\//.test(u.pathname))return r.fulfill({contentType:'application/javascript',body:''});return r.continue()});
 async function ready(){await page.waitForFunction(()=>window.PhotoIA?.state?.canvas);if(await page.locator('#local-install-skip').isVisible())await page.locator('#local-install-skip').click();}
 await page.goto(url,{waitUntil:'domcontentloaded'});await ready();await work(page,{url,ready});
 }finally{await browser.close();await new Promise(r=>server.close(r))}
}
async function importPhoto(page,w=4032,h=3024){return page.evaluate(async({w,h})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#386b90';x.fillRect(0,0,w,h);x.fillStyle='#f0a060';x.fillRect(0,0,w/3,h/3);const blob=await new Promise(r=>c.toBlob(r,'image/png'));await PhotoIA.loadFile(new File([blob],'test.png',{type:'image/png'}));return [...new Uint8Array(await blob.arrayBuffer())];},{w,h})}
module.exports={withEditor,importPhoto,assert};
