(() => {
'use strict';

const ORT_VERSION = '1.23.0';
const ORT_SCRIPT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.js`;
const ORT_WASM_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const DB_NAME = 'photo-ia-onnx-lab-1-models';
const DB_VERSION = 1;
const STORE = 'models';

let runtimePromise = null;
const sessions = new Map();
let activeBackend = 'Not loaded';

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

function bytesLabel(n) {
  if (!Number.isFinite(n)) return 'Unknown';
  const mb = n / (1024 * 1024);
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB could not open.'));
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('Model cache read failed.'));
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Model cache write failed.')); };
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Model cache delete failed.')); };
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(s => s.src === src);
    if (existing && window.ort) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ONNX Runtime Web. Check internet access for the first run.'));
    document.head.appendChild(s);
  });
}

async function ensureRuntime() {
  if (window.ort?.InferenceSession) return configureRuntime();
  if (!runtimePromise) runtimePromise = loadScript(ORT_SCRIPT).then(configureRuntime);
  return runtimePromise;
}

function configureRuntime() {
  if (!window.ort) throw new Error('ONNX Runtime Web loaded without global ort object.');
  try {
    ort.env.wasm.wasmPaths = ORT_WASM_BASE;
    ort.env.wasm.numThreads = isIOS ? 1 : Math.max(1, Math.min(2, navigator.hardwareConcurrency || 1));
    ort.env.wasm.proxy = false;
  } catch (_) {}
  return ort;
}

async function downloadArrayBuffer(url, onProgress) {
  const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
  if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body?.getReader) {
    const ab = await res.arrayBuffer();
    onProgress?.({ loaded: ab.byteLength, total: total || ab.byteLength, done: true });
    return ab;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total, done: false });
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  onProgress?.({ loaded, total: total || loaded, done: true });
  return out.buffer;
}

async function modelStatus(model) {
  const cached = await idbGet(model.id).catch(() => null);
  return {
    cached: cached instanceof ArrayBuffer || ArrayBuffer.isView(cached),
    bytes: cached?.byteLength || cached?.buffer?.byteLength || 0,
    filename: model.filename
  };
}

async function getModelBytes(model, { onProgress, forceDownload = false } = {}) {
  if (!forceDownload) {
    const cached = await idbGet(model.id).catch(() => null);
    if (cached) {
      const ab = cached instanceof ArrayBuffer ? cached : cached.buffer;
      onProgress?.({ loaded: ab.byteLength, total: ab.byteLength, done: true, cached: true });
      return ab;
    }
  }
  const ab = await downloadArrayBuffer(model.source, onProgress);
  await idbSet(model.id, ab);
  return ab;
}

async function createSessionForModel(model, options = {}) {
  await ensureRuntime();
  const cachedSession = sessions.get(model.id);
  if (cachedSession) return cachedSession;

  const bytes = await getModelBytes(model, options);
  const attempts = [];
  if (navigator.gpu) attempts.push('webgpu');
  attempts.push('wasm');

  let lastErr = null;
  for (const backend of attempts) {
    try {
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
        enableCpuMemArena: true,
        enableMemPattern: true
      });
      activeBackend = backend.toUpperCase();
      const record = { session, backend: activeBackend, bytes: bytes.byteLength, model };
      sessions.set(model.id, record);
      return record;
    } catch (err) {
      lastErr = err;
      if (backend === 'webgpu') continue;
    }
  }
  throw new Error(`No ONNX backend could create ${model.filename}: ${lastErr?.message || lastErr}`);
}

function releaseSession(id) {
  const record = sessions.get(id);
  try { record?.session?.release?.(); } catch (_) {}
  sessions.delete(id);
}

function releaseAll() {
  for (const id of [...sessions.keys()]) releaseSession(id);
  activeBackend = 'Not loaded';
}

async function clearModelCache() {
  releaseAll();
  const models = window.PhotoIALabModels || {};
  for (const m of Object.values(models)) await idbDelete(m.id).catch(() => null);
}

window.PhotoIALabEngine = {
  version: '1.0.0',
  ortVersion: ORT_VERSION,
  isIOS,
  ensureRuntime,
  createSessionForModel,
  modelStatus,
  getModelBytes,
  clearModelCache,
  releaseAll,
  bytesLabel,
  get backend() { return activeBackend; }
};
})();
