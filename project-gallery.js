(() => {
'use strict';
let panel=null,sequence=0,urls=[];
const clearURLs=()=>{urls.forEach(URL.revokeObjectURL);urls=[]};
function button(text,action,style='secondary'){const b=document.createElement('button');b.type='button';b.className=style;b.textContent=text;b.onclick=action;return b}
function errorMessage(e){return e.code==='STORAGE_FULL'?'No queda espacio. Exporta una copia y elimina un proyecto que ya no necesites.':'No se pudo completar. Tu proyecto abierto se conserva.'}
async function refresh(){
 const own=++sequence,root=panel;if(!root?.isConnected)return;clearURLs();root.replaceChildren();
 const bar=document.createElement('div');bar.className='gallery-heading';bar.append(button('Nueva fotografía',()=>document.getElementById('file-input').click(),'primary'));root.append(bar);
 const message=document.createElement('p');message.className='project-note';message.textContent='Cargando proyectos…';root.append(message);
 try{const projects=await PhotoProject.listProjects();if(own!==sequence||!root.isConnected)return;message.textContent=projects.length?'Guardados en este dispositivo. Descarga una copia de tus fotos importantes.':'Aún no hay proyectos guardados. Abre una fotografía para empezar.';
  const grid=document.createElement('div');grid.className='project-gallery-grid';root.append(grid);
  for(const item of projects){
   const card=document.createElement('article');card.className='project-card';card.dataset.projectId=item.id;
   const preview=button('',async()=>{try{await PhotoProject.openProject(item.id);PhotoWorkspace.closePanel()}catch(e){PhotoIA.toast(errorMessage(e))}},'project-card-preview');preview.setAttribute('aria-label',`Abrir ${item.name}`);
   if(item.thumbnail){const img=document.createElement('img'),url=URL.createObjectURL(item.thumbnail);urls.push(url);img.src=url;img.alt='';preview.append(img)}else preview.textContent='Sin miniatura';
   const title=document.createElement('strong');title.textContent=item.name;const detail=document.createElement('small');detail.textContent=`${item.width} × ${item.height} · ${new Date(item.updatedAt).toLocaleDateString()}`;
   const actions=document.createElement('div');actions.className='project-card-actions';
   actions.append(button('Renombrar',async()=>{const name=prompt('Nombre del proyecto',item.name);if(name===null)return;try{await PhotoProject.renameProject(item.id,name);await refresh()}catch(e){PhotoIA.toast(e.code==='INVALID_NAME'?'Escribe un nombre de 1 a 80 caracteres.':errorMessage(e))}}),button('Eliminar',async()=>{if(!confirm(`¿Eliminar el proyecto «${item.name}» de este dispositivo?`))return;try{await PhotoProject.deleteProject(item.id);await refresh()}catch(e){PhotoIA.toast(errorMessage(e))}},'secondary danger'));
   card.append(preview,title,detail,actions);grid.append(card);
  }
 }catch(e){if(own!==sequence)return;message.textContent=errorMessage(e);root.append(button('Reintentar',refresh),button('Exportar foto abierta',()=>PhotoIA.download()))}
}
function open(){const root=document.createElement('section');root.className='project-gallery';PhotoWorkspace.showPanel('Mis proyectos',root);panel=root;refresh()}
function close(){++sequence;clearURLs();panel=null}
document.addEventListener('photoia:panel-closing',close);
window.PhotoProjectGallery={open};
document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('[data-open-project-gallery]').forEach(b=>b.onclick=open));
})();
