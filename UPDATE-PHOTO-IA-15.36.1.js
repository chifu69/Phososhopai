'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const VERSION = '15.36.1';
const touched = [
  'ai-studio.js',
  'wardrobe-engine.js',
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'README.md'
];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error(`Falta ${rel}. Ejecuta este updater dentro de la carpeta raíz de PHOTO IA 15.36.0.`);
  return fs.readFileSync(p, 'utf8');
}
function replaceOnce(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`No pude localizar ${label}. No se modificó ningún archivo.`);
  return text.replace(before, after);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const originals = Object.fromEntries(touched.map(f => [f, read(f)]));
const created = [];
let out = {...originals};

try {
  // Guard against applying the patch to the wrong base.
  assert(out['index.html'].includes('15.36.0') || out['index.html'].includes('15.36.1'), 'index.html no parece ser PHOTO IA 15.36.0/15.36.1.');
  if (out['index.html'].includes('15.36.1') && out['wardrobe-engine.js'].includes("if(mode==='replace_background') return false;") && out['ai-studio.js'].includes('wardrobe.hasClothingIntent(prompt)')) {
    console.log('PHOTO IA 15.36.1 Wardrobe Routing Fix ya está aplicado.');
    process.exit(0);
  }

  out['ai-studio.js'] = out['ai-studio.js'].replace("const ENGINE_VERSION='15.34';", "const ENGINE_VERSION='15.36.1';");
  const oldClassify = `function classifyEdit(prompt){
 const t=normalizedText(prompt);
 if(state.mode==='portrait_id')return 'portrait_id';
 const clothing=/\\b(ropa|camisa|playera|pantalon|vestido|traje|chaqueta|chamarra|abrigo|sueter|sudadera|uniforme|zapatos|botas|gorra|sombrero|ponme|visteme|cambia.*ropa|wear|shirt|pants|dress|jacket|coat|sweater|outfit|uniform|shoes|boots|hat)\\b/.test(t);
 const scene=/\\b(fondo|paisaje|playa|alaska|nieve|montana|bosque|ciudad|calle|atardecer|amanecer|desierto|campo|oficina|estudio|background|beach|snow|mountain|forest|city|sunset|desert|landscape)\\b/.test(t)||state.mode==='replace_background';
 if(scene&&clothing)return 'scene_and_wardrobe';
 if(scene)return 'background_only';
 if(clothing)return 'wardrobe_only';
 return 'general_edit';
}`;
  const newClassify = `function classifyEdit(prompt){
 const t=normalizedText(prompt);
 if(state.mode==='portrait_id')return 'portrait_id';
 const wardrobe=window.PhotoWardrobeEngine;
 const clothing=typeof wardrobe?.hasClothingIntent==='function'
  ? wardrobe.hasClothingIntent(prompt)
  : /\\b(ropa|camisa|playera|pantalon|pantalones|vestido|traje|chaqueta|chamarra|abrigo|sueter|sudadera|uniforme|zapatos|botas|gorra|sombrero|ponme|visteme|cambia.*ropa|wear|shirt|pants|dress|suit|jacket|coat|sweater|outfit|uniform|shoes|boots|hat)\\b/.test(t);
 const scene=(typeof wardrobe?.hasSceneIntent==='function'
  ? wardrobe.hasSceneIntent(prompt)
  : /\\b(fondo|paisaje|playa|alaska|nieve|montana|bosque|ciudad|calle|atardecer|amanecer|desierto|campo|oficina|estudio|background|beach|snow|mountain|forest|city|sunset|desert|landscape)\\b/.test(t))||state.mode==='replace_background';
 if(scene&&clothing)return 'scene_and_wardrobe';
 if(scene)return 'background_only';
 if(clothing)return 'wardrobe_only';
 return 'general_edit';
}`;
  out['ai-studio.js'] = replaceOnce(out['ai-studio.js'], oldClassify, newClassify, 'classifyEdit() en ai-studio.js');

  out['wardrobe-engine.js'] = out['wardrobe-engine.js'].replace("const VERSION='15.34';", "const VERSION='15.36.1';");
  const oldWardrobeRegex = `return /\\b(ropa|camisa|playera|pantalon|pantalones|vestido|traje|chaqueta|chamarra|abrigo|sueter|sudadera|uniforme|zapatos|botas|gorra|sombrero|outfit|wear|shirt|pants|dress|suit|jacket|coat|sweater|uniform|shoes|boots|hat)\\b/.test(t);`;
  const newWardrobeRegex = `return /\\b(ropa|camisa|playera|pantalon|pantalones|vestido|traje|chaqueta|chamarra|abrigo|sueter|sudadera|uniforme|zapatos|botas|gorra|sombrero|ponme|visteme|outfit|wear|shirt|pants|dress|suit|jacket|coat|sweater|uniform|shoes|boots|hat)\\b/.test(t);`;
  out['wardrobe-engine.js'] = replaceOnce(out['wardrobe-engine.js'], oldWardrobeRegex, newWardrobeRegex, 'regex de ropa en wardrobe-engine.js');

  const oldMatches = `function matches(mode,prompt){
  if(mode==='change_clothes') return true;
  return hasClothingIntent(prompt) && !hasSceneIntent(prompt);
}`;
  const newMatches = `function matches(mode,prompt){
  // Cambiar fondo conserva el control de peticiones combinadas fondo + ropa.
  if(mode==='replace_background') return false;
  if(mode==='change_clothes') return true;
  return hasClothingIntent(prompt) && !hasSceneIntent(prompt);
}`;
  out['wardrobe-engine.js'] = replaceOnce(out['wardrobe-engine.js'], oldMatches, newMatches, 'matches() en wardrobe-engine.js');

  const oldExport = `window.PhotoWardrobeEngine={
  version:VERSION,
  matches,`;
  const newExport = `window.PhotoWardrobeEngine={
  version:VERSION,
  hasClothingIntent,
  hasSceneIntent,
  matches,`;
  out['wardrobe-engine.js'] = replaceOnce(out['wardrobe-engine.js'], oldExport, newExport, 'export de PhotoWardrobeEngine');

  // PWA cache/version bump so iPhone/Safari does not keep stale routing code.
  out['index.html'] = out['index.html'].replaceAll('15.36.0', '15.36.1');
  out['index.html'] = out['index.html'].replace('PHOTO IA v15.36.1 · Dress + Natural Skin', 'PHOTO IA v15.36.1 · Wardrobe Routing Fix');
  out['index.html'] = out['index.html'].replace('<footer>PHOTO IA 15.36.1 • Dress + Natural Skin</footer>', '<footer>PHOTO IA 15.36.1 • Wardrobe Routing Fix</footer>');
  out['sw.js'] = out['sw.js'].replaceAll('15.36.0', '15.36.1').replaceAll('15-36-0', '15-36-1');
  out['manifest.webmanifest'] = out['manifest.webmanifest'].replaceAll('15.36.0', '15.36.1');

  const oldReadmeTitle = '# PHOTO IA 15.36.0 — Mejora automática\n';
  if (out['README.md'].startsWith(oldReadmeTitle)) {
    out['README.md'] = `# PHOTO IA 15.36.1 — Wardrobe Routing Fix\n\nCorrige el enrutamiento de Cambiar ropa sin perder las mejoras de PHOTO IA 15.36.0. \`ai-studio.js\` reutiliza el detector de intención de \`wardrobe-engine.js\`, reconoce también "ponme", "vísteme", "pantalones" y "suit", y protege el modo Cambiar fondo cuando una petición mezcla escenario y vestuario.\n\nPrueba de regresión: \`node tests/wardrobe-routing.test.cjs\`.\n\n## Base: PHOTO IA 15.36.0 — Mejora automática\n` + out['README.md'].slice(oldReadmeTitle.length);
  }

  // Syntax check before touching disk.
  new Function(out['ai-studio.js']);
  new Function(out['wardrobe-engine.js']);
  assert(out['wardrobe-engine.js'].includes("if(mode==='replace_background') return false;"), 'Faltó la protección replace_background.');
  assert(out['wardrobe-engine.js'].includes('ponme|visteme'), 'Faltan expresiones naturales de ropa.');
  assert(out['ai-studio.js'].includes('wardrobe.hasClothingIntent(prompt)'), 'ai-studio.js no quedó usando el matcher compartido.');

  const changelog = `# PHOTO IA 15.36.1 — Wardrobe Routing Fix\n\n- Unifica la detección de intención de ropa entre ai-studio.js y wardrobe-engine.js.\n- Añade ponme, visteme, pantalones y suit al matcher compartido.\n- Evita que Wardrobe Engine secuestre replace_background.\n- Conserva los algoritmos de mejora 15.36.0, color de ropa, cabello, piel, segmentación, Body Retouch, ONNX y Connection Router.\n- Sube cache y asset URLs a 15.36.1 para forzar actualización en iPhone/Safari.\n`;

  const test = `const fs=require('fs');\nconst vm=require('vm');\nconst assert=require('assert');\nconst w=fs.readFileSync('wardrobe-engine.js','utf8');\nconst a=fs.readFileSync('ai-studio.js','utf8');\nnew Function(w); new Function(a);\nconst context={window:{},document:{dispatchEvent(){}},CustomEvent:function(t){this.type=t;},Blob,FormData,AbortController,FileReader:function(){},console};\nvm.createContext(context); vm.runInContext(w,context);\nconst e=context.window.PhotoWardrobeEngine;\nassert(e); assert.strictEqual(e.version,'15.36.1');\nassert.strictEqual(e.hasClothingIntent('Ponme algo elegante'),true);\nassert.strictEqual(e.hasClothingIntent('Vísteme para una boda'),true);\nassert.strictEqual(e.hasClothingIntent('cambia mis pantalones'),true);\nassert.strictEqual(e.hasClothingIntent('give me a suit'),true);\nassert.strictEqual(e.matches('image_edit','Ponme algo elegante'),true);\nassert.strictEqual(e.matches('replace_background','Ponme un traje elegante'),false);\nassert.strictEqual(e.matches('image_edit','Ponme un traje en la playa'),false);\nassert(a.includes('wardrobe.hasClothingIntent(prompt)'));\nassert(a.includes('wardrobe.hasSceneIntent(prompt)'));\nconsole.log('wardrobe-routing.test.cjs: OK');\n`;

  // Write only after every preflight check passed.
  for (const f of touched) fs.writeFileSync(path.join(ROOT, f), out[f], 'utf8');
  fs.writeFileSync(path.join(ROOT, 'CHANGELOG-15.36.1.md'), changelog, 'utf8');
  fs.mkdirSync(path.join(ROOT, 'tests'), {recursive:true});
  fs.writeFileSync(path.join(ROOT, 'tests', 'wardrobe-routing.test.cjs'), test, 'utf8');
  created.push('CHANGELOG-15.36.1.md', path.join('tests','wardrobe-routing.test.cjs'));

  // Regression test. Roll back if it fails.
  const testResult = cp.spawnSync(process.execPath, [path.join('tests','wardrobe-routing.test.cjs')], {cwd:ROOT, encoding:'utf8'});
  if (testResult.status !== 0) {
    throw new Error(`La prueba de regresión falló:\n${testResult.stdout || ''}\n${testResult.stderr || ''}`);
  }

  console.log('');
  console.log('✅ PHOTO IA 15.36.1 aplicado correctamente');
  console.log('✅ Wardrobe routing unificado');
  console.log('✅ replace_background protegido');
  console.log('✅ ponme / vísteme / pantalones / suit reconocidos');
  console.log('✅ Caché PWA subida a 15.36.1');
  console.log('✅ Regression test OK');
  console.log('');
  console.log('Archivos modificados:');
  [...touched, ...created].forEach(f => console.log(' - ' + f));
} catch (err) {
  // Restore originals if anything after writing failed.
  try {
    for (const [f, data] of Object.entries(originals)) fs.writeFileSync(path.join(ROOT, f), data, 'utf8');
    for (const f of created) {
      const p = path.join(ROOT, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (_) {}
  console.error('');
  console.error('❌ No se aplicó PHOTO IA 15.36.1');
  console.error(err.message || err);
  process.exit(1);
}
