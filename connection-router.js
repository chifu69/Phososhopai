(() => {
'use strict';

const VERSION='15.4';
const TAILSCALE_URL='https://desktop-i33j4gg.tail079508.ts.net';

function normalizeUrl(value){
  return String(value||'').trim().replace(/\/+$/,'');
}
function isLanUrl(url){
  const u=normalizeUrl(url);
  return /^https?:\/\/192\.168\./i.test(u) || /^https?:\/\/10\./i.test(u) || /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\./i.test(u);
}
function orderedCandidates(primary){
  const list=[];
  const p=normalizeUrl(primary);
  if(p) list.push({url:p,kind:isLanUrl(p)?'lan':'custom'});
  if(!list.some(x=>x.url===TAILSCALE_URL)) list.push({url:TAILSCALE_URL,kind:'tailscale'});
  return list;
}
async function probe(url,token,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(`${normalizeUrl(url)}/health`,{
      method:'GET',
      headers:token?{'X-PhotoIA-Token':token}:{},
      signal:controller.signal,
      cache:'no-store'
    });
    if(!res.ok){
      let detail='';
      try{
        const j=await res.json();
        detail=j.detail||j.error||'';
      }catch(_){}
      return {ok:false,url,status:res.status,error:detail||`HTTP ${res.status}`};
    }
    let data=null;
    try{data=await res.json()}catch(_){}
    return {ok:true,url,status:res.status,data};
  }catch(e){
    return {ok:false,url,error:e?.name==='AbortError'?'timeout':(e?.message||'network_error')};
  }finally{
    clearTimeout(timer);
  }
}
async function resolve({primary,token,onTry}={}){
  const candidates=orderedCandidates(primary);
  const attempts=[];
  for(const candidate of candidates){
    // LAN should fail fast so we don't wait 10s before trying Tailscale.
    const timeoutMs=candidate.kind==='lan'?1800:5500;
    onTry?.(candidate);
    const result=await probe(candidate.url,token,timeoutMs);
    attempts.push({...candidate,...result});
    if(result.ok){
      return {
        ok:true,
        url:candidate.url,
        kind:candidate.kind,
        label:candidate.kind==='tailscale'?'Tailscale':candidate.kind==='lan'?'red local':'servidor',
        attempts,
        data:result.data
      };
    }
  }
  return {ok:false,attempts,error:'No se pudo conectar por red local ni por Tailscale.'};
}

window.PhotoConnectionRouter={
  version:VERSION,
  tailscaleUrl:TAILSCALE_URL,
  normalizeUrl,
  orderedCandidates,
  probe,
  resolve
};
})();
