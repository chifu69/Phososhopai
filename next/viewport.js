export function attachViewport(stage,canvas){
 let zoom=1,pan={x:0,y:0},points=new Map(),previous=null;
 function layout(){if(!canvas.width||canvas.hidden)return;const scale=Math.min((stage.clientWidth-16)/canvas.width,(stage.clientHeight-16)/canvas.height);canvas.style.width=`${Math.max(1,canvas.width*scale)}px`;canvas.style.height=`${Math.max(1,canvas.height*scale)}px`;canvas.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}
 function fit(){zoom=1;pan={x:0,y:0};layout()}
 const observer=new ResizeObserver(fit);observer.observe(stage);
 stage.addEventListener('pointerdown',e=>{if(e.target.closest('button')||canvas.hidden)return;stage.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});previous=null});
 stage.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;const old=points.get(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size===1){pan.x+=e.clientX-old.x;pan.y+=e.clientY-old.y}else{const [a,b]=[...points.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(previous)zoom=Math.max(1,Math.min(5,zoom*distance/previous));previous=distance}layout()});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,e=>{points.delete(e.pointerId);previous=null});
 return {fit,layout,dispose:()=>observer.disconnect()};
}
