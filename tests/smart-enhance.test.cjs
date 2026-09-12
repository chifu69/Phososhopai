const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('smart-core.js','utf8');
const button={disabled:false,textContent:'Aplicar'},state={photo:{},originalDataUrl:'photo-a'},messages=[];
const api={state,toast:m=>messages.push(m)};
const ctx=vm.createContext({console,window:{PhotoIA:api},document:{getElementById:()=>null}});
vm.runInContext(source.slice(source.indexOf('const VERSION'),source.indexOf('function scene'))+';globalThis.test={buildRecipe,magicTone};',ctx);
const {buildRecipe,magicTone}=ctx.test;
function report(mid,lo=20,hi=235,face=0){return {brightness:mid,contrast:45,noiseEstimate:5,blurRisk:'low',regions:{face},histogram:{p05:lo,p50:mid,p95:hi}}}
for(const cv of [report(40),report(65,8,250,.1),report(132),report(210,120,255),report(132,110,150)]){
 const recipe=buildRecipe(cv,{issues:[]});let previous=-1;
 for(let v=0;v<256;v++){const y=magicTone(v,recipe);assert(Number.isFinite(y)&&y>=0&&y<=255);assert(y>=previous,'Tone must not reverse local shading');previous=y;}
 const output=magicTone(cv.brightness,recipe);
 if(cv.brightness<80)assert(output>cv.brightness+20,'Underexposed photos need visible improvement');
 if(cv.brightness>190)assert(output<cv.brightness-15,'Bright photos need exposure reduction');
 if(cv.brightness===132&&cv.histogram.p05===20)assert(Math.abs(output-132)<8,'Balanced photos must remain natural');
 if(cv.regions.face)assert.equal(recipe.clarity,0,'Do not sharpen skin globally');
}
const dark=buildRecipe(report(40),{issues:[]});assert(magicTone(245,dark)<255,'Opening shadows must not clip highlights');
vm.runInContext(source.slice(source.indexOf('async function apply(btn'),source.indexOf('function renderRecipe'))+';globalThis.apply=apply;',ctx);
ctx.renderRecipe=()=>{};ctx.analyze=async()=>null;
function setAnalysis(){ctx.a={source:state.originalDataUrl,recommendation:dark,opencv:report(40)};vm.runInContext('lastAnalysis=a;',ctx)}
(async()=>{
 let fallback=0;
 api.applySmartPixelRecipe=async(r,commit,guard)=>{assert(guard());fallback++;return true};
 ctx.window.PhotoOpenCV={ready:true,enhanceCurrent:async()=>{throw Error('simulated OpenCV failure')}};
 setAnalysis();await ctx.apply(button);assert.equal(fallback,1,'OpenCV failure must use compatible renderer');assert.equal(button.disabled,false);
 let finish;ctx.window.PhotoOpenCV={ready:true,enhanceCurrent:()=>new Promise(r=>finish=r)};
 setAnalysis();const pending=ctx.apply(button);await Promise.resolve();await ctx.apply(button);
 state.originalDataUrl='photo-b';state.photo={};finish('old-result');await pending;
 assert.equal(fallback,1,'Stale work must not overwrite a new photo');assert.equal(button.disabled,false);
 console.log('PASS: adaptive exposure, balanced photos, highlights, monotone tone, portrait limits, fallback, duplicate click and stale-photo guards');
})().catch(e=>{console.error(e);process.exitCode=1});
