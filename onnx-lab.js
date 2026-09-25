(() => {
'use strict';
const $ = id => document.getElementById(id);
const models = () => window.PhotoIALabModels;
const engine = () => window.PhotoIALabEngine;
const recolor = () => window.PhotoIALabRecolor;

const state = {
  file: null, image: null, originalUrl: '', resultUrl: '', maskUrl: '',
  resultCanvas: null, mask: null, generatedCanvas: null,
  mode: 'hair', region: 'upper', view: 'result', busy: false,
  parserRecord: null, recolorRecord: null,
  times: { segmentation: 0, recolor: 0, total: 0 },
  inferenceSize: '', lastError: '', detectedRegion: '',
  modelInfo: { parser: null, recolor: null }
};

function setStatus(text, kind = '') {
  const el = $('status'); el.textContent = text; el.dataset.kind = kind;
}
function setBusy(on) {
  state.busy = on;
  $('apply').disabled = on || !state.image;
  $('prepare-models').disabled = on;
  $('file-input').disabled = on;
  [...document.querySelectorAll('[data-mode],[data-region]')].forEach(b => b.disabled = on || !state.image);
}
function setProgress(loaded, total, label) {
  const pct = total ? Math.min(100, Math.round(loaded / total * 100)) : 0;
  $('download-bar').style.width = `${pct}%`;
  $('download-label').textContent = total ? `${label} — ${pct}% (${engine().bytesLabel(loaded)} / ${engine().bytesLabel(total)})` : `${label} — ${engine().bytesLabel(loaded)}`;
}

function sanitizeHex(value) {
  const v = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v.toLowerCase()}`;
  return null;
}
function syncColor(hex) {
  const h = sanitizeHex(hex); if (!h) return false;
  $('target-color').value = h; $('target-text').value = h; return true;
}

async function refreshModelStatuses() {
  const m = models();
  const [p, r] = await Promise.all([engine().modelStatus(m.parser), engine().modelStatus(m.recolor)]);
  state.modelInfo.parser = p; state.modelInfo.recolor = r;
  $('parser-status').textContent = p.cached ? `Cached ${engine().bytesLabel(p.bytes)}` : 'Not installed';
  $('recolor-status').textContent = r.cached ? `Cached ${engine().bytesLabel(r.bytes)}` : 'Not installed';
  $('parser-status').className = p.cached ? 'status-ready' : '';
  $('recolor-status').className = r.cached ? 'status-ready' : '';
  $('backend-status').textContent = engine().backend;
  updateDiagnostics();
}

async function prepareModels() {
  if (state.busy) return;
  setBusy(true); state.lastError = '';
  try {
    setStatus('Loading ONNX Runtime and semantic model…');
    const p = await engine().createSessionForModel(models().parser, { onProgress: x => setProgress(x.loaded, x.total, x.cached ? 'Semantic model from local cache' : 'Downloading semantic model') });
    state.parserRecord = p;
    $('parser-status').textContent = `Ready ${engine().bytesLabel(p.bytes)}`; $('parser-status').className = 'status-ready';
    $('backend-status').textContent = p.backend;

    setStatus('Loading ONNX recolor model…');
    const r = await engine().createSessionForModel(models().recolor, { onProgress: x => setProgress(x.loaded, x.total, x.cached ? 'Recolor model from local cache' : 'Downloading recolor model') });
    state.recolorRecord = r;
    $('recolor-status').textContent = `Ready ${engine().bytesLabel(r.bytes)}`; $('recolor-status').className = 'status-ready';
    $('backend-status').textContent = r.backend;
    setProgress(1, 1, 'Models ready');
    setStatus('Both ONNX models are ready. You can run the experiment.');
  } catch (err) {
    state.lastError = String(err?.message || err);
    setStatus(`Model preparation failed: ${state.lastError}`, 'error');
    if (!state.parserRecord) { $('parser-status').textContent = 'Failed'; $('parser-status').className = 'status-failed'; }
    if (!state.recolorRecord) { $('recolor-status').textContent = 'Failed'; $('recolor-status').className = 'status-failed'; }
  } finally {
    setBusy(false); await refreshModelStatuses();
  }
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode this image.')); };
    img.src = url;
  });
}

async function openPhoto(file) {
  if (!file) return;
  try {
    if (state.originalUrl?.startsWith('blob:')) URL.revokeObjectURL(state.originalUrl);
    const { img, url } = await readFile(file);
    state.file = file; state.image = img; state.originalUrl = url; state.resultUrl = ''; state.maskUrl = ''; state.resultCanvas = null; state.mask = null; state.generatedCanvas = null; state.lastError = ''; state.detectedRegion = '';
    $('mode-hair').disabled = false; $('mode-clothing').disabled = false;
    [...document.querySelectorAll('[data-region]')].forEach(b => b.disabled = state.mode !== 'clothing');
    $('apply').disabled = false; $('reset').disabled = false; $('save').disabled = true;
    setStatus(`Photo loaded: ${img.naturalWidth}×${img.naturalHeight}. Inference will use reduced local copies.`);
    state.view = 'original'; renderView(); updateDiagnostics();
  } catch (err) { setStatus(String(err?.message || err), 'error'); }
}

function selectedRegionMode() { return state.mode === 'hair' ? 'hair' : state.region; }

async function ensureSessions() {
  if (!state.parserRecord) state.parserRecord = await engine().createSessionForModel(models().parser, { onProgress: x => setProgress(x.loaded, x.total, x.cached ? 'Semantic model cache' : 'Downloading semantic model') });
  if (!state.recolorRecord) state.recolorRecord = await engine().createSessionForModel(models().recolor, { onProgress: x => setProgress(x.loaded, x.total, x.cached ? 'Recolor model cache' : 'Downloading recolor model') });
  $('backend-status').textContent = engine().backend;
}

async function runSegmentation(sourceCanvas) {
  const t0 = performance.now();
  const model = models().parser, rec = state.parserRecord;
  const prep = recolor().schpInputFromCanvas(sourceCanvas, model);
  const tensor = new ort.Tensor('float32', prep.data, model.inputShape);
  let outputs;
  try { outputs = await rec.session.run({ pixel_values: tensor }); }
  finally { try { tensor.dispose?.(); } catch (_) {} }
  const out = outputs.parsing_logits || outputs.logits || outputs[rec.session.outputNames?.[0]];
  if (!out) throw new Error(`Parser did not return logits. Outputs: ${Object.keys(outputs).join(', ')}`);
  const mask = recolor().maskFromLogits(out.data, out.dims, selectedRegionMode(), model);
  state.times.segmentation = performance.now() - t0;
  state.detectedRegion = mask.label;
  try { for (const v of Object.values(outputs)) v?.dispose?.(); } catch (_) {}
  return mask;
}

async function runRecolor(sourceCanvas, mask) {
  const t0 = performance.now();
  const model = models().recolor, rec = state.recolorRecord;
  const target = sanitizeHex($('target-text').value) || $('target-color').value;
  const prep = recolor().recolorInputFromCanvas(sourceCanvas, mask, target, engine().isIOS ? 512 : 640);
  state.inferenceSize = `${prep.width}×${prep.height}`;
  const tensor = new ort.Tensor('float32', prep.data, [1, 5, prep.height, prep.width]);
  let outputs;
  try { outputs = await rec.session.run({ input: tensor }); }
  finally { try { tensor.dispose?.(); } catch (_) {} }
  const out = outputs.rgb || outputs[rec.session.outputNames?.[0]];
  if (!out) throw new Error(`Recolor model did not return rgb. Outputs: ${Object.keys(outputs).join(', ')}`);
  const generated = recolor().tensorRgbToCanvas(out.data, out.dims);
  state.times.recolor = performance.now() - t0;
  try { for (const v of Object.values(outputs)) v?.dispose?.(); } catch (_) {}
  return generated;
}

async function apply() {
  if (!state.image || state.busy) return;
  if (!syncColor($('target-text').value)) return setStatus('Target color must be a valid #RRGGBB value.', 'error');
  setBusy(true); state.lastError = ''; const total0 = performance.now();
  try {
    setStatus('Preparing local ONNX sessions…');
    await ensureSessions();
    const analysis = recolor().canvasForImage(state.image, engine().isIOS ? 768 : 960);
    setStatus(`Running ONNX semantic selection for ${selectedRegionMode()}…`);
    const mask = await runSegmentation(analysis);
    state.mask = mask;
    state.maskUrl = recolor().maskCanvas(mask.alpha, mask.width, mask.height, 'overlay').toDataURL('image/png');

    setStatus(`Detected ${mask.label}. Running ONNX guided recolor…`);
    const generated = await runRecolor(analysis, mask);
    state.generatedCanvas = generated;

    setStatus('Compositing selected region back at original resolution…');
    const result = recolor().compositeToOriginal(state.image, generated, mask, {
      intensity: Number($('intensity').value) / 100,
      preserveShadows: $('preserve-shadows').checked,
      preserveHighlights: $('preserve-highlights').checked,
      preserveTexture: $('preserve-texture').checked
    });
    state.resultCanvas = result;
    state.resultUrl = result.toDataURL('image/jpeg', 0.94);
    state.times.total = performance.now() - total0;
    state.view = 'result';
    $('save').disabled = false;
    setStatus(`Done locally. ${mask.label} detected; ONNX recolor completed in ${(state.times.total / 1000).toFixed(1)} s.`);
    renderView();
  } catch (err) {
    state.lastError = String(err?.message || err);
    state.resultCanvas = null; state.resultUrl = '';
    setStatus(`ONNX experiment failed: ${state.lastError}`, 'error');
  } finally {
    setBusy(false); await refreshModelStatuses(); updateDiagnostics();
  }
}

function makeImg(src, alt) { const img = document.createElement('img'); img.src = src; img.alt = alt; return img; }
function renderView() {
  const stage = $('stage'); stage.innerHTML = '';
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  if (!state.image) { stage.innerHTML = '<div class="empty"><strong>Open a photo</strong><p>Then choose Hair or Clothing and run the local ONNX pipeline.</p></div>'; return; }
  if (state.view === 'mask') {
    if (!state.maskUrl) stage.innerHTML = '<div class="empty">No generated mask yet. Run Apply first.</div>'; else stage.append(makeImg(state.maskUrl, 'Generated semantic mask'));
    return;
  }
  if (state.view === 'compare') {
    const wrap = document.createElement('div'); wrap.className = 'compare';
    const a = document.createElement('figure'), b = document.createElement('figure');
    a.append(makeImg(state.originalUrl, 'Before')); const ca = document.createElement('figcaption'); ca.textContent = 'Before'; a.append(ca);
    if (state.resultUrl) b.append(makeImg(state.resultUrl, 'After')); else b.innerHTML = '<div class="empty">Run Apply</div>';
    const cb = document.createElement('figcaption'); cb.textContent = 'After'; b.append(cb); wrap.append(a, b); stage.append(wrap); return;
  }
  if (state.view === 'original' || !state.resultUrl) stage.append(makeImg(state.originalUrl, 'Original')); else stage.append(makeImg(state.resultUrl, 'ONNX recolor result'));
}

function reset() {
  state.resultUrl = ''; state.maskUrl = ''; state.resultCanvas = null; state.mask = null; state.generatedCanvas = null; state.lastError = ''; state.detectedRegion = ''; state.times = { segmentation: 0, recolor: 0, total: 0 }; state.inferenceSize = '';
  $('save').disabled = true; state.view = 'original'; setStatus('Result reset. Original photo preserved.'); renderView(); updateDiagnostics();
}
function saveResult() {
  if (!state.resultCanvas) return;
  state.resultCanvas.toBlob(blob => {
    if (!blob) return setStatus('Could not create output file.', 'error');
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `photo-ia-onnx-lab-${Date.now()}.jpg`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/jpeg', 0.95);
}

function updateDiagnostics() {
  const p = state.parserRecord, r = state.recolorRecord;
  const lines = [
    `Runtime loaded: ${window.ort?.InferenceSession ? 'yes' : 'no'}`,
    `ONNX Runtime Web: ${engine().ortVersion}`,
    `Active backend: ${engine().backend}`,
    `iPhone/iPad mode: ${engine().isIOS ? 'yes (WASM threads=1)' : 'no'}`,
    `Parser model: ${p ? 'loaded' : (state.modelInfo.parser?.cached ? 'cached, session not created' : 'not installed')}`,
    `Parser size: ${p ? engine().bytesLabel(p.bytes) : engine().bytesLabel(state.modelInfo.parser?.bytes || 0)}`,
    `Parser input names: ${p?.session?.inputNames?.join(', ') || models().parser.inputNames.join(', ')}`,
    `Parser output names: ${p?.session?.outputNames?.join(', ') || models().parser.outputNames.join(', ')}`,
    `Recolor model: ${r ? 'loaded' : (state.modelInfo.recolor?.cached ? 'cached, session not created' : 'not installed')}`,
    `Recolor size: ${r ? engine().bytesLabel(r.bytes) : engine().bytesLabel(state.modelInfo.recolor?.bytes || 0)}`,
    `Recolor input names: ${r?.session?.inputNames?.join(', ') || models().recolor.inputNames.join(', ')}`,
    `Recolor output names: ${r?.session?.outputNames?.join(', ') || models().recolor.outputNames.join(', ')}`,
    `Inference image dimensions: ${state.inferenceSize || '-'}`,
    `Detected region: ${state.detectedRegion || '-'}`,
    `Mask coverage: ${state.mask ? (state.mask.coverage * 100).toFixed(2) + '%' : '-'}`,
    `Segmentation time: ${state.times.segmentation ? state.times.segmentation.toFixed(0) + ' ms' : '-'}`,
    `Recolor time: ${state.times.recolor ? state.times.recolor.toFixed(0) + ' ms' : '-'}`,
    `Total processing time: ${state.times.total ? state.times.total.toFixed(0) + ' ms' : '-'}`,
    `Memory-related/last failure: ${state.lastError || 'none detected'}`,
    '',
    'EXPERIMENTAL RECOLOR WARNING:',
    models().recolor.warning
  ];
  $('diagnostics').textContent = lines.join('\n');
}

function bind() {
  $('file-input').addEventListener('change', e => openPhoto(e.target.files?.[0]));
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
    $('clothing-regions').hidden = state.mode !== 'clothing';
    document.querySelectorAll('[data-region]').forEach(x => x.disabled = state.mode !== 'clothing' || !state.image);
  }));
  document.querySelectorAll('[data-region]').forEach(b => b.addEventListener('click', () => { state.region = b.dataset.region; document.querySelectorAll('[data-region]').forEach(x => x.classList.toggle('active', x === b)); }));
  $('target-color').addEventListener('input', e => syncColor(e.target.value));
  $('target-text').addEventListener('change', e => { if (!syncColor(e.target.value)) setStatus('Target color must be #RRGGBB.', 'error'); });
  document.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => syncColor(b.dataset.color)));
  $('intensity').addEventListener('input', e => $('intensity-out').textContent = `${e.target.value}%`);
  $('prepare-models').addEventListener('click', prepareModels);
  $('apply').addEventListener('click', apply);
  $('reset').addEventListener('click', reset);
  $('save').addEventListener('click', saveResult);
  $('clear-cache').addEventListener('click', async () => {
    if (state.busy) return;
    setBusy(true); try { await engine().clearModelCache(); state.parserRecord = state.recolorRecord = null; setStatus('LAB model cache deleted. Stable PHOTO IA was not touched.'); } catch (e) { setStatus(String(e?.message || e), 'error'); } finally { setBusy(false); refreshModelStatuses(); }
  });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { state.view = b.dataset.view; renderView(); }));
  $('show-mask').addEventListener('click', () => { state.view = 'mask'; renderView(); });
  $('copy-diagnostics').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('diagnostics').textContent); setStatus('Diagnostics copied.'); } catch (_) { setStatus('Could not copy diagnostics.', 'error'); } });
  window.addEventListener('pagehide', () => engine().releaseAll());
}

bind();
refreshModelStatuses();
updateDiagnostics();
})();
