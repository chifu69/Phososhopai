/* PHOTO IA 15.16 — classic isolated MediaPipe worker
 * All MediaPipe inference runs here, never on the UI thread.
 */
const WORKER_VERSION='15.24-direct-person-bust-semantic-skin';
const MP_VERSION='1.0.1';
const ESM_LOCAL='./assets/mediapipe/vision_bundle.mjs?v=15.16';
const ESM_REMOTE=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const WASM_LOCAL='./assets/mediapipe/wasm';
const WASM_REMOTE=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const PERSON_MODEL_LOCAL='./assets/models/selfie_segmenter_landscape.tflite';
const PERSON_MODEL_REMOTE='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';
const MULTICLASS_MODEL_LOCAL='./assets/models/selfie_multiclass_256x256.tflite';
const MULTICLASS_MODEL_REMOTE='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
const FACE_MODEL_LOCAL='./assets/models/face_landmarker.task';
const FACE_MODEL_REMOTE='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
let PERSON_MODEL=PERSON_MODEL_LOCAL,MULTICLASS_MODEL=MULTICLASS_MODEL_LOCAL,FACE_MODEL=FACE_MODEL_LOCAL;
let mp=null,fileset=null;
let diag={worker:'READY',workerVersion:WORKER_VERSION,workerKind:'classic',module:'NOT_LOADED',wasm:'NOT_LOADED',personModel:'NOT_LOADED',multiclassModel:'NOT_LOADED',faceModel:'NOT_LOADED',lastTask:'-',lastPhase:'idle',lastMs:0,input:'-',engine:'MediaPipe Worker',personMaskSource:'-',personConfidenceIndex:-1,personLabels:'-',personCoverage:0,personBounds:'-',personMaskMax:0,error:''};
const now=()=>performance.now();
function phase(name,extra={}){diag.lastPhase=name;Object.assign(diag,extra);postMessage({type:'phase',phase:name,diag:{...diag}})}
function errText(e){return String(e?.message||e||'Error desconocido')}
async function loadMP(){
  if(mp&&fileset)return;
  const t=now();
  diag.module='LOADING';diag.wasm='NOT_LOADED';
  diag.importScriptsAvailable=typeof importScripts==='function'?'YES':'NO';
  phase('Inicializando Worker clásico…',{module:'LOADING',wasm:'NOT_LOADED',workerKind:'classic',workerVersion:WORKER_VERSION,importScriptsAvailable:diag.importScriptsAvailable});
  if(typeof importScripts!=='function')throw new Error('Worker incorrecto: MediaPipe necesita un Worker clásico con importScripts().');
  let localErr=null;
  try{
    phase('Cargando MediaPipe ESM local…');
    mp=await import(ESM_LOCAL);
    diag.moduleSource='LOCAL';
  }catch(err){
    localErr=err;
    phase('Bundle local no disponible; probando CDN…');
    try{mp=await import(ESM_REMOTE);diag.moduleSource='CDN';}
    catch(remoteErr){diag.module='ERROR';throw new Error(`MediaPipe module local: ${errText(localErr)} | CDN: ${errText(remoteErr)}`);}
  }
  if(!mp?.FilesetResolver||!mp?.ImageSegmenter||!mp?.FaceLandmarker){diag.module='ERROR';throw new Error('El bundle MediaPipe cargó incompleto.');}
  diag.module='READY';phase('MediaPipe módulo READY',{module:'READY'});

  try{
    phase('Cargando MediaPipe WASM local…',{wasm:'LOADING'});
    fileset=await mp.FilesetResolver.forVisionTasks(WASM_LOCAL);
    diag.wasmSource='LOCAL';
  }catch(localWasmErr){
    phase('WASM local no disponible; probando CDN…',{wasm:'LOADING'});
    try{fileset=await mp.FilesetResolver.forVisionTasks(WASM_REMOTE);diag.wasmSource='CDN';}
    catch(remoteWasmErr){diag.wasm='ERROR';throw new Error(`MediaPipe WASM local: ${errText(localWasmErr)} | CDN: ${errText(remoteWasmErr)}`);}
  }
  diag.wasm='READY';diag.loadMs=Math.round(now()-t);
  phase('MediaPipe WASM READY',{module:'READY',wasm:'READY'});
}

async function createSegmenterWithFallback(localPath,remotePath,extra={}){
  const opts={baseOptions:{modelAssetPath:localPath},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false,...extra};
  try{return await mp.ImageSegmenter.createFromOptions(fileset,opts);}
  catch(localErr){
    phase('Modelo local no disponible; probando remoto…');
    return await mp.ImageSegmenter.createFromOptions(fileset,{...opts,baseOptions:{modelAssetPath:remotePath}});
  }
}
async function createFaceWithFallback(){
  const opts=path=>({baseOptions:{modelAssetPath:path},runningMode:'IMAGE',numFaces:1,minFaceDetectionConfidence:.40,minFacePresenceConfidence:.40,minTrackingConfidence:.40,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
  try{return await mp.FaceLandmarker.createFromOptions(fileset,opts(FACE_MODEL_LOCAL));}
  catch(localErr){phase('Face model local no disponible; probando remoto…');return await mp.FaceLandmarker.createFromOptions(fileset,opts(FACE_MODEL_REMOTE));}
}
function closeResult(r){try{r?.categoryMask?.close?.()}catch(_){} try{r?.confidenceMasks?.forEach(m=>m.close?.())}catch(_){}}
function maskBytes(m){if(!m)return null;try{const a=m.getAsUint8Array?.();if(a)return new Uint8Array(a)}catch(_){} try{const a=m.getAsFloat32Array?.();if(a)return Uint8Array.from(a,v=>Math.round(Math.max(0,Math.min(1,v))*255))}catch(_){} return null}
function classMask(cat,ids){const set=new Set(ids),out=new Uint8Array(cat.length);for(let i=0;i<cat.length;i++)if(set.has(cat[i]))out[i]=255;return out}

function floatMask(m){
  if(!m)return null;
  try{
    const a=m.getAsFloat32Array?.();
    if(a)return new Float32Array(a);
  }catch(_){}
  try{
    const a=m.getAsUint8Array?.();
    if(a)return Float32Array.from(a,v=>v/255);
  }catch(_){}
  return null;
}
function maskStats(mask,w,h){
  if(!mask||!mask.length)return {coverage:0,bounds:null,min:0,max:0};
  let n=0,minV=255,maxV=0,minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const v=mask[y*w+x];
    minV=Math.min(minV,v);maxV=Math.max(maxV,v);
    if(v>=80){
      n++;
      if(x<minX)minX=x;if(x>maxX)maxX=x;
      if(y<minY)minY=y;if(y>maxY)maxY=y;
    }
  }
  return {
    coverage:+((n/Math.max(1,w*h))*100).toFixed(1),
    bounds:maxX>=0?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:null,
    min:minV===255&&maxV===0?0:minV,
    max:maxV
  };
}
function confidenceToPersonMask(conf){
  const out=new Uint8Array(conf.length);
  for(let i=0;i<conf.length;i++){
    const p=Math.max(0,Math.min(1,conf[i]));
    // Preserve soft shoulders/edges instead of binary clipping.
    out[i]=p>=.75?255:
           p>=.55?230:
           p>=.38?195:
           p>=.24?145:
           p>=.14?90:
           p>=.08?48:0;
  }
  return out;
}

async function personMask(image){
  await loadMP();
  const t=now();
  phase('Selfie Segmentation…');
  phase('Cargando modelo Selfie Segmentation…',{personModel:'LOADING'});

  // Person/Busto need soft confidence information. Hair/Clothing remain untouched.
  const seg=await createSegmenterWithFallback(
    PERSON_MODEL_LOCAL,
    PERSON_MODEL_REMOTE,
    {outputCategoryMask:true,outputConfidenceMasks:true}
  );
  diag.personModel='READY';
  phase('Selfie Segmentation READY',{personModel:'READY'});

  let result;
  try{
    result=seg.segment(image);

    let out=null;
    let source='CATEGORY';
    let confidenceIndex=-1;

    const labels=typeof seg.getLabels==='function' ? (seg.getLabels()||[]) : [];
    const normLabels=labels.map(v=>String(v||'').toLowerCase());
    let personIdx=normLabels.findIndex(v=>v.includes('person')||v.includes('foreground'));
    if(personIdx<0 && result?.confidenceMasks?.length===2)personIdx=1;
    if(personIdx<0 && result?.confidenceMasks?.length===1)personIdx=0;

    if(personIdx>=0 && result?.confidenceMasks?.[personIdx]){
      const conf=floatMask(result.confidenceMasks[personIdx]);
      if(conf){
        out=confidenceToPersonMask(conf);
        source='CONFIDENCE';
        confidenceIndex=personIdx;
      }
    }

    // Fallback: category mask as before.
    if(!out){
      const cat=maskBytes(result?.categoryMask);
      if(!cat)throw new Error('Selfie Segmentation no devolvió máscara');
      out=new Uint8Array(cat.length);

      // Determine actual person category when labels are present.
      let catPerson=normLabels.findIndex(v=>v.includes('person')||v.includes('foreground'));
      if(catPerson<0)catPerson=1;
      for(let i=0;i<cat.length;i++)if(cat[i]===catPerson)out[i]=255;
      source='CATEGORY';
      confidenceIndex=-1;
    }

    const side=Math.round(Math.sqrt(out.length));
    const stats=maskStats(out,side,Math.max(1,Math.round(out.length/side)));
    diag.personMaskSource=source;
    diag.personConfidenceIndex=confidenceIndex;
    diag.personLabels=labels.join('|')||'-';
    diag.personCoverage=stats.coverage;
    diag.personBounds=stats.bounds?`${stats.bounds.x},${stats.bounds.y},${stats.bounds.w}×${stats.bounds.h}`:'-';
    diag.personMaskMax=stats.max;
    diag.personMs=Math.round(now()-t);
    return out;
  } finally {
    closeResult(result);
    try{seg.close?.()}catch(_){}
  }
}
async function multiclass(image,mode){
  await loadMP();const t=now();phase(`Segmentación multiclase: ${mode}…`);
  phase('Cargando modelo multiclase…',{multiclassModel:'LOADING'});const seg=await createSegmenterWithFallback(MULTICLASS_MODEL_LOCAL,MULTICLASS_MODEL_REMOTE);diag.multiclassModel='READY';phase('Modelo multiclase READY',{multiclassModel:'READY'});
  let result;try{result=seg.segment(image);const cat=maskBytes(result?.categoryMask);if(!cat)throw new Error('Multiclase no devolvió máscara');diag.multiclassMs=Math.round(now()-t);if(mode==='hair')return classMask(cat,[1]);if(mode==='clothing')return classMask(cat,[4]);if(mode==='skin')return classMask(cat,[2,3]);if(mode==='face')return classMask(cat,[3]);return classMask(cat,[1,2,3,4,5])}finally{closeResult(result);try{seg.close?.()}catch(_){}}
}
async function landmarks(image){
  await loadMP();const t=now();phase('Face Landmarker…');
  phase('Cargando Face Landmarker…',{faceModel:'LOADING'});const lm=await createFaceWithFallback();diag.faceModel='READY';phase('Face Landmarker READY',{faceModel:'READY'});
  try{const r=lm.detect(image),pts=r?.faceLandmarks?.[0];if(!pts||pts.length<100)throw new Error('Face Landmarker no encontró el rostro');diag.faceMs=Math.round(now()-t);return pts.map(p=>({x:p.x,y:p.y,z:p.z||0}))}finally{try{lm.close?.()}catch(_){}}
}
function bbox(points,w,h){let minX=1,minY=1,maxX=0,maxY=0;for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)}return{x:minX*w,y:minY*h,w:(maxX-minX)*w,h:(maxY-minY)*h}}
function ycbcr(r,g,b){return{y:.299*r+.587*g+.114*b,cb:128-.168736*r-.331264*g+.5*b,cr:128+.5*r-.418688*g-.081312*b}}
function median(v){if(!v.length)return 0;v=[...v].sort((a,b)=>a-b);const m=(v.length-1)/2;return Number.isInteger(m)?v[m]:(v[Math.floor(m)]+v[Math.ceil(m)])/2}
function mad(v,c){return Math.max(1,median(v.map(x=>Math.abs(x-c))))}
function adaptiveSkin(imageData,person,face){
  const {width:w,height:h,data}=imageData,cx=face.x+face.w*.5,cy=face.y+face.h*.55,rx=Math.max(3,face.w*.30),ry=Math.max(3,face.h*.34),cbs=[],crs=[];
  for(let y=Math.max(0,Math.floor(face.y+face.h*.20));y<Math.min(h,Math.ceil(face.y+face.h*.86));y++)for(let x=Math.max(0,Math.floor(face.x+face.w*.18));x<Math.min(w,Math.ceil(face.x+face.w*.82));x++){const ex=(x-cx)/rx,ey=(y-cy)/ry;if(ex*ex+ey*ey>1)continue;const j=(y*w+x)*4,c=ycbcr(data[j],data[j+1],data[j+2]);if(c.y<45||c.y>238)continue;cbs.push(c.cb);crs.push(c.cr)}
  if(cbs.length<20)throw new Error('No pude aprender el tono de piel');const cb=median(cbs),cr=median(crs),cbm=Math.max(4,mad(cbs,cb)),crm=Math.max(4,mad(crs,cr)),out=new Uint8Array(w*h),faceBottom=face.y+face.h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(person&&person[i]<100)continue;const dx=Math.abs(x-cx),faceZone=dx<face.w*.72&&y>face.y-face.h*.12&&y<faceBottom+face.h*.75,bodyZone=y>=faceBottom+face.h*.15&&y<Math.min(h,faceBottom+face.h*3.2)&&dx<face.w*1.8;if(!faceZone&&!bodyZone)continue;const j=i*4,c=ycbcr(data[j],data[j+1],data[j+2]),dcb=Math.abs(c.cb-cb)/Math.max(8,cbm*3.0),dcr=Math.abs(c.cr-cr)/Math.max(9,crm*3.0),d=Math.sqrt(dcb*dcb+dcr*dcr);if(c.y>28&&c.y<250&&d<1.08)out[i]=255}
  return out
}
function faceMask(points,w,h){const b=bbox(points,w,h),out=new Uint8Array(w*h),cx=b.x+b.w*.5,cy=b.y+b.h*.52,rx=b.w*.58,ry=b.h*.62;for(let y=Math.max(0,Math.floor(cy-ry));y<Math.min(h,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(w,Math.ceil(cx+rx));x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1)out[y*w+x]=255}return out}
async function runProfile(mode,imageData){
  const w=imageData.width,h=imageData.height;diag.lastTask=mode;diag.input=`${w}×${h}`;const total=now();let mask,pts,person,face;
  let source=imageData;
  if(typeof OffscreenCanvas!=='undefined'){const c=new OffscreenCanvas(w,h);c.getContext('2d',{alpha:false}).putImageData(imageData,0,0);source=c;}
  if(mode==='person'){mask=await personMask(source)}
  else if(mode==='hair'||mode==='clothing'){mask=await multiclass(source,mode)}
  else if(mode==='face'){pts=await landmarks(source);mask=faceMask(pts,w,h)}
  else if(mode==='bust'){
    person=await personMask(source);
    pts=await landmarks(source);
    mask=buildBustFromPersonMask(person,pts,w,h);
  }
  else if(mode==='skin'){
    // Use the model's own semantic skin classes as authority.
    // Hair/clothing already proved this multiclass model works well on this device.
    mask=await multiclass(source,'skin');
  }
  else throw new Error(`Modo no soportado: ${mode}`);
  diag.lastMs=Math.round(now()-total);diag.lastPhase='done';diag.error='';return {mask,points:pts||null,diag:{...diag}}
}

function convexHull(points){
  if(points.length<=3)return points.slice();
  const pts=points.slice().sort((a,b)=>a.x===b.x?a.y-b.y:a.x-b.x);
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[];
  for(const p of pts){
    while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();
    lower.push(p);
  }
  const upper=[];
  for(let i=pts.length-1;i>=0;i--){
    const p=pts[i];
    while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();
    upper.push(p);
  }
  upper.pop();lower.pop();
  return lower.concat(upper);
}
function pointInPoly(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x, yi=poly[i].y, xj=poly[j].x, yj=poly[j].y;
    const intersect=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi+1e-9)+xi);
    if(intersect)inside=!inside;
  }
  return inside;
}
function featherRegion(mask,w,h,r=2){
  if(r<=0)return mask;
  let out=mask.slice();
  for(let pass=0;pass<r;pass++){
    const n=out.slice();
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      let s=0,c=0;
      for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){s+=out[(y+yy)*w+x+xx];c++;}
      n[y*w+x]=Math.round(s/c);
    }
    out=n;
  }
  return out;
}

function firstFaceLandmarks(result){
  return result?.faceLandmarks?.[0]||result?.landmarks?.[0]||null;
}


function buildBustFromPersonMask(personMask,landmarks,w,h){
  if(!personMask||personMask.length!==w*h)throw new Error('No hay máscara de persona válida');
  if(!landmarks||landmarks.length<50)throw new Error('Face Landmarker did not return enough landmarks');

  const b=bbox(landmarks,w,h);
  const faceBottom=b.y+b.h;

  // Keep the real person silhouette from the top of the image down through upper chest.
  // Face Landmarker only decides WHERE to cut vertically.
  const bottom=Math.min(h-1,Math.round(faceBottom+b.h*2.10));
  const fadeStart=Math.max(0,Math.round(bottom-b.h*.22));

  const out=new Uint8Array(w*h);

  for(let y=0;y<=bottom;y++){
    const fade = y<=fadeStart ? 1 : Math.max(0,(bottom-y)/Math.max(1,bottom-fadeStart));
    for(let x=0;x<w;x++){
      const i=y*w+x;
      const pv=personMask[i];
      if(pv<35)continue;

      let v=pv;
      if(y>fadeStart)v=Math.round(v*fade);
      if(v>out[i])out[i]=v;
    }
  }

  // Remove tiny background leaks near the top by requiring stronger person confidence
  // above the forehead while preserving hats/hair/glasses that are part of the person.
  const topGuard=Math.max(0,Math.round(b.y-b.h*.65));
  for(let y=0;y<topGuard;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x;
      if(out[i] && personMask[i]<80)out[i]=0;
    }
  }

  let mask=featherRegion(out,w,h,1);
  if(typeof closeMask==='function')mask=closeMask(mask,w,h,1);
  if(typeof blurMask==='function')mask=blurMask(mask,w,h,1);
  return mask;
}

function buildIdMaskFromFaceLandmarks(landmarks,w,h,personMask){
  if(!landmarks||landmarks.length<50)throw new Error('Face Landmarker did not return enough landmarks');
  const pts=landmarks.map(p=>({x:(p.x<=1?p.x*w:p.x),y:(p.y<=1?p.y*h:p.y)}));

  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of pts){
    minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
    maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
  }

  const fw=Math.max(12,maxX-minX);
  const fh=Math.max(12,maxY-minY);
  const cx=(minX+maxX)/2;
  const jawY=maxY;

  const out=new Uint8Array(w*h);

  // HEAD/FACE: use the actual landmark cloud instead of a round ellipse.
  const hull=convexHull(pts);
  const centerY=(minY+maxY)/2;
  const expanded=hull.map(p=>{
    const dx=p.x-cx;
    const dy=p.y-centerY;
    const sx=dx*(dy<0?1.08:1.05);
    const sy=dy*(dy<0?1.10:1.04);
    return {
      x:Math.max(0,Math.min(w-1,cx+sx)),
      y:Math.max(0,Math.min(h-1,centerY+sy))
    };
  });

  // Conservative forehead/temple extension; intentionally small to avoid hats/background.
  const topPad=Math.max(1,fh*.055);
  const templePad=Math.max(1,fw*.045);
  expanded.push({x:Math.max(0,minX-templePad), y:Math.max(0,minY+fh*.08)});
  expanded.push({x:Math.max(0,cx-fw*.38), y:Math.max(0,minY-topPad)});
  expanded.push({x:cx, y:Math.max(0,minY-topPad*1.15)});
  expanded.push({x:Math.min(w-1,cx+fw*.38), y:Math.max(0,minY-topPad)});
  expanded.push({x:Math.min(w-1,maxX+templePad), y:Math.max(0,minY+fh*.08)});

  const headPoly=convexHull(expanded);
  const polyMinY=Math.max(0,Math.floor(Math.min(...headPoly.map(p=>p.y))));
  const polyMaxY=Math.min(h-1,Math.ceil(Math.max(...headPoly.map(p=>p.y))));
  const scanMinX=Math.max(0,Math.floor(minX-fw*.15));
  const scanMaxX=Math.min(w-1,Math.ceil(maxX+fw*.15));

  for(let y=polyMinY;y<=polyMaxY;y++){
    for(let x=scanMinX;x<=scanMaxX;x++){
      if(pointInPoly(x+.5,y+.5,headPoly)){
        const i=y*w+x;
        let v=255;
        if(personMask&&personMask.length===out.length && y<minY+fh*.12){
          const pv=personMask[i];
          if(pv<18)v=80;
          else if(pv<42)v=150;
          else if(pv<75)v=215;
        }
        if(v>out[i])out[i]=v;
      }
    }
  }

  // TRUE BUST: preserve 15.21 lower-body confidence logic exactly.
  const bustTop=Math.max(0,Math.floor(jawY-fh*.04));
  const bustBottom=Math.min(h-1,Math.floor(jawY+fh*2.45));
  const maxHalf=Math.min(w*.495,fw*2.80);

  for(let y=bustTop;y<=bustBottom;y++){
    const t=Math.max(0,Math.min(1,(y-bustTop)/Math.max(1,bustBottom-bustTop)));
    const half=Math.min(maxHalf, fw*(.55 + 1.75*Math.pow(t,.62)));
    const lx=Math.max(0,Math.floor(cx-half));
    const rx=Math.min(w-1,Math.ceil(cx+half));

    for(let x=lx;x<=rx;x++){
      const i=y*w+x;
      if(!personMask||personMask.length!==out.length)continue;

      const pv=personMask[i];
      if(pv<40)continue;

      let v = pv>=220 ? 255 :
              pv>=180 ? 240 :
              pv>=135 ? 220 :
              pv>=90  ? 195 :
              pv>=55  ? 160 : 115;

      if(t>.90){
        const fade=1-(t-.90)/.10;
        v=Math.round(v*Math.max(.15,fade));
      }

      if(v>out[i])out[i]=v;
    }
  }

  // Smooth jaw -> neck -> shoulder transition.
  // Blend a tapered neck corridor into the Selfie silhouette instead of forcing a flat bridge.
  const transTop=Math.max(0,Math.floor(jawY-fh*.16));
  const transBottom=Math.min(h-1,Math.floor(jawY+fh*.62));
  for(let y=transTop;y<=transBottom;y++){
    const t=Math.max(0,Math.min(1,(y-transTop)/Math.max(1,transBottom-transTop)));

    // Narrow near jaw, widen gradually into the real shoulder silhouette.
    const half=fw*(.38 + .34*Math.pow(t,.85));
    const lx=Math.max(0,Math.floor(cx-half));
    const rx=Math.min(w-1,Math.ceil(cx+half));

    for(let x=lx;x<=rx;x++){
      const i=y*w+x;
      const pv=personMask&&personMask.length===out.length?personMask[i]:255;
      if(pv<22)continue;

      const edge=half?Math.abs(x-cx)/half:1;
      const centerWeight=Math.max(0,1-Math.pow(edge,2.2));

      // Stronger close to jaw/center, progressively hand authority to Selfie below.
      const jawInfluence=(1-t);
      const selfieInfluence=t;
      const selfieV = pv>=220 ? 255 :
                      pv>=180 ? 240 :
                      pv>=135 ? 220 :
                      pv>=90  ? 195 :
                      pv>=55  ? 160 : 115;

      let target=Math.round(
        (225 + 25*centerWeight)*jawInfluence +
        selfieV*selfieInfluence
      );

      // Feather side edges so there is no visible horizontal shelf.
      if(edge>.84){
        const fade=Math.max(0,(1-edge)/.16);
        target=Math.round(target*fade);
      }

      if(target>out[i])out[i]=target;
    }
  }

  // One extra gentle local blur only around the transition band.
  // This removes the visible step without softening the head or the shoulder silhouette globally.
  const transitionCopy=out.slice();
  for(let y=Math.max(1,transTop);y<Math.min(h-1,transBottom);y++){
    for(let x=1;x<w-1;x++){
      const i=y*w+x;
      let sum=0,weight=0;
      for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){
        const ww=(xx===0&&yy===0)?4:1;
        sum+=transitionCopy[(y+yy)*w+(x+xx)]*ww;
        weight+=ww;
      }
      out[i]=Math.max(out[i],Math.round(sum/weight));
    }
  }

  let mask=featherRegion(out,w,h,1);
  if(typeof closeMask==='function')mask=closeMask(mask,w,h,1);
  if(typeof blurMask==='function')mask=blurMask(mask,w,h,1);
  return mask;
}


function resetTaskDiagnostics(task){
  diag.lastTask=task||'-';
  diag.lastPhase='starting';
  diag.lastMs=0;
  diag.selfieMs=0;
  diag.faceMs=0;
  diag.multiclassMs=0;
  diag.error='';
  diag.personMaskSource='-';
  diag.personConfidenceIndex=-1;
  diag.personLabels='-';
  diag.personCoverage=0;
  diag.personBounds='-';
  diag.personMaskMax=0;
}

self.onmessage=async e=>{
  const {id,type,mode,width,height,rgba}=e.data||{};
  if(type==='ping'){postMessage({type:'pong',id,diag:{...diag}});return}
  if(type!=='profile')return;
  try{const image=new ImageData(new Uint8ClampedArray(rgba),width,height);const result=await runProfile(mode,image);postMessage({type:'result',id,width,height,mask:result.mask.buffer,points:result.points,diag:result.diag},[result.mask.buffer])}
  catch(err){diag.error=errText(err);diag.lastPhase='error';postMessage({type:'error',id,message:diag.error,diag:{...diag}})}
};
postMessage({type:'ready',diag:{...diag}});
