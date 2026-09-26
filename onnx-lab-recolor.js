(() => {
'use strict';

function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }
function round32(v) { return Math.max(32, Math.round(v / 32) * 32); }

function canvasForImage(image, maxSide = 0) {
  const w0 = image.naturalWidth || image.width;
  const h0 = image.naturalHeight || image.height;
  let scale = 1;
  if (maxSide > 0 && Math.max(w0, h0) > maxSide) scale = maxSide / Math.max(w0, h0);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * scale));
  c.height = Math.max(1, Math.round(h0 * scale));
  c.getContext('2d', { alpha: false }).drawImage(image, 0, 0, c.width, c.height);
  return c;
}

function drawSquare(source, size, { alpha = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { alpha, willReadFrequently: true });
  if (!alpha) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size, size);
  return c;
}

function hexToRgb01(hex) {
  const s = String(hex || '#ff0000').replace('#', '');
  const n = Number.parseInt(s.length === 3 ? s.split('').map(x => x + x).join('') : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function blurMask(alpha, w, h, radius = 2) {
  radius = Math.max(0, Math.min(12, Math.round(radius)));
  if (!radius) return Uint8ClampedArray.from(alpha);
  const tmp = new Uint16Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += alpha[y * w + Math.max(0, Math.min(w - 1, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = Math.round(sum / (radius * 2 + 1));
      sum += alpha[y * w + Math.min(w - 1, x + radius + 1)] - alpha[y * w + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / (radius * 2 + 1));
      sum += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
    }
  }
  return out;
}

function maskCanvas(alpha, w, h, mode = 'white') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const im = ctx.createImageData(w, h);
  for (let i = 0; i < alpha.length; i++) {
    const p = i * 4, a = alpha[i];
    if (mode === 'overlay') { im.data[p] = 255; im.data[p + 1] = 55; im.data[p + 2] = 85; im.data[p + 3] = Math.round(a * 0.7); }
    else { im.data[p] = im.data[p + 1] = im.data[p + 2] = 255; im.data[p + 3] = a; }
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

function schpInputFromCanvas(canvas, model) {
  const size = model.inputShape[2];
  const c = drawSquare(canvas, size);
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size).data;
  const out = new Float32Array(3 * size * size);
  const mean = model.normalization.meanRGB, std = model.normalization.stdRGB;
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    out[i] = (d[p] / 255 - mean[0]) / std[0];
    out[plane + i] = (d[p + 1] / 255 - mean[1]) / std[1];
    out[plane * 2 + i] = (d[p + 2] / 255 - mean[2]) / std[2];
  }
  return { data: out, width: size, height: size };
}

function targetRegionIds(mode, model) {
  if (mode === 'auto') return model.regions.garmentAuto;
  return model.regions[mode] || model.regions.hair;
}

function regionName(mode) {
  return ({hair:'Hair',upper:'Upper garment',lower:'Lower garment',dress:'Dress / jumpsuit',shoes:'Shoes',auto:'Automatic garment'})[mode] || mode;
}

function chooseAutoRegion(labels, model) {
  const groups = [
    ['upper', model.regions.upper],
    ['lower', model.regions.lower],
    ['dress', model.regions.dress],
    ['shoes', model.regions.shoes]
  ];
  let best = groups[0], bestCount = -1;
  for (const group of groups) {
    const set = new Set(group[1]); let count = 0;
    for (const v of labels) if (set.has(v)) count++;
    if (count > bestCount) { bestCount = count; best = group; }
  }
  return { mode: best[0], ids: best[1], pixels: bestCount };
}

function maskFromLogits(logits, dims, mode, model) {
  const C = dims[1] || 20, H = dims[2] || 473, W = dims[3] || 473;
  const plane = H * W;
  if (logits.length < C * plane) throw new Error('Parser output is smaller than expected.');
  const labels = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) {
    let best = 0, bestV = -Infinity;
    for (let c = 0; c < C; c++) {
      const v = logits[c * plane + i];
      if (v > bestV) { bestV = v; best = c; }
    }
    labels[i] = best;
  }
  let selectedMode = mode, ids = targetRegionIds(mode, model);
  if (mode === 'auto') {
    const auto = chooseAutoRegion(labels, model);
    selectedMode = auto.mode; ids = auto.ids;
    if (auto.pixels < plane * 0.002) throw new Error('No garment region was confidently detected.');
  }
  const set = new Set(ids);
  const hard = new Uint8ClampedArray(plane);
  let count = 0;
  for (let i = 0; i < plane; i++) if (set.has(labels[i])) { hard[i] = 255; count++; }
  if (count < plane * 0.001) throw new Error(`${regionName(selectedMode)} was not detected in this photo.`);
  const soft = blurMask(hard, W, H, selectedMode === 'hair' ? 2 : 1);
  return { alpha: soft, width: W, height: H, mode: selectedMode, label: regionName(selectedMode), coverage: count / plane, labels };
}

function recolorInputFromCanvas(sourceCanvas, mask, targetHex, size = 512) {
  size = round32(size);
  const src = drawSquare(sourceCanvas, size);
  const m = drawSquare(maskCanvas(mask.alpha, mask.width, mask.height), size, { alpha: true });
  const srcData = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size).data;
  const maskData = m.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size).data;
  const n = size * size;
  const out = new Float32Array(5 * n);
  const target = hexToRgb01(targetHex);
  const hint = target.map(v => (v - 0.5) / 0.5);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = srcData[p] / 255, g = srcData[p + 1] / 255, b = srcData[p + 2] / 255;
    const gray = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const a = maskData[p + 3] / 255;
    out[i] = gray;
    out[n + i] = hint[0] * a;
    out[n * 2 + i] = hint[1] * a;
    out[n * 3 + i] = hint[2] * a;
    out[n * 4 + i] = a;
  }
  return { data: out, width: size, height: size };
}

function tensorRgbToCanvas(tensor, dims) {
  const H = dims[2], W = dims[3], plane = H * W;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const im = ctx.createImageData(W, H);
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    im.data[p] = Math.round(clamp(tensor[i]) * 255);
    im.data[p + 1] = Math.round(clamp(tensor[plane + i]) * 255);
    im.data[p + 2] = Math.round(clamp(tensor[plane * 2 + i]) * 255);
    im.data[p + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return c;
}


function protectMask(mask, { protectFace = false, protectSkin = false } = {}) {
  if (!mask?.labels || (!protectFace && !protectSkin)) return mask;
  const protectedIds = new Set();
  if (protectFace) protectedIds.add(13);
  if (protectSkin) [13,14,15,16,17].forEach(x => protectedIds.add(x));
  const alpha = Uint8ClampedArray.from(mask.alpha);
  for (let i = 0; i < alpha.length; i++) if (protectedIds.has(mask.labels[i])) alpha[i] = 0;
  const softened = blurMask(alpha, mask.width, mask.height, 1);
  return { ...mask, alpha: softened };
}

function subjectMaskFromLogits(logits, dims, model) {
  const C = dims[1] || 20, H = dims[2] || 473, W = dims[3] || 473;
  const plane = H * W;
  const labels = new Uint8Array(plane);
  const hard = new Uint8ClampedArray(plane);
  let count = 0;
  for (let i = 0; i < plane; i++) {
    let best = 0, bestV = -Infinity;
    for (let c = 0; c < C; c++) {
      const v = logits[c * plane + i];
      if (v > bestV) { bestV = v; best = c; }
    }
    labels[i] = best;
    if (best !== 0) { hard[i] = 255; count++; }
  }
  if (count < plane * 0.01) throw new Error('No human subject was confidently detected.');
  return { alpha: blurMask(hard, W, H, 2), width: W, height: H, mode: 'subject', label: 'Human subject', coverage: count / plane, labels };
}

function compositeToOriginal(image, generatedCanvas, mask, options = {}) {
  const W = image.naturalWidth || image.width, H = image.naturalHeight || image.height;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.drawImage(image, 0, 0, W, H);

  const gen = document.createElement('canvas'); gen.width = W; gen.height = H;
  const gctx = gen.getContext('2d', { alpha: false, willReadFrequently: true });
  gctx.imageSmoothingEnabled = true; gctx.imageSmoothingQuality = 'high';
  gctx.drawImage(generatedCanvas, 0, 0, W, H);

  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  mctx.imageSmoothingEnabled = true; mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(maskCanvas(mask.alpha, mask.width, mask.height), 0, 0, W, H);

  const base = ctx.getImageData(0, 0, W, H);
  const gd = gctx.getImageData(0, 0, W, H).data;
  const md = mctx.getImageData(0, 0, W, H).data;
  const bd = base.data;
  const intensity = clamp(Number(options.intensity ?? 0.85));
  const protectShadows = !!options.preserveShadows;
  const protectHighlights = !!options.preserveHighlights;
  const preserveTexture = !!options.preserveTexture;
  const protectLogos = !!options.protectLogos;

  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    let a = (md[p + 3] / 255) * intensity;
    if (a <= 0.001) continue;
    const lum = (0.2126 * bd[p] + 0.7152 * bd[p + 1] + 0.0722 * bd[p + 2]) / 255;
    if (protectShadows && lum < 0.22) a *= 0.45 + lum * 2.5;
    if (protectHighlights && lum > 0.80) a *= Math.max(0.35, 1 - (lum - 0.80) * 2.8);
    if (protectLogos) {
      const x = i % W, y = (i / W) | 0;
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
        const li = p - 4, ri = p + 4, ui = p - W * 4, di = p + W * 4;
        const l0 = 0.2126*bd[li] + 0.7152*bd[li+1] + 0.0722*bd[li+2];
        const l1 = 0.2126*bd[ri] + 0.7152*bd[ri+1] + 0.0722*bd[ri+2];
        const l2 = 0.2126*bd[ui] + 0.7152*bd[ui+1] + 0.0722*bd[ui+2];
        const l3 = 0.2126*bd[di] + 0.7152*bd[di+1] + 0.0722*bd[di+2];
        const edge = Math.min(1, (Math.abs(l1-l0)+Math.abs(l3-l2))/150);
        a *= 1 - edge * 0.55;
      }
    }

    let rr = gd[p], gg = gd[p + 1], bb = gd[p + 2];
    if (preserveTexture) {
      const genLum = Math.max(4, 0.2126 * rr + 0.7152 * gg + 0.0722 * bb);
      const origLum = Math.max(4, 0.2126 * bd[p] + 0.7152 * bd[p + 1] + 0.0722 * bd[p + 2]);
      const ratio = Math.max(0.45, Math.min(1.75, origLum / genLum));
      rr = Math.min(255, rr * ratio); gg = Math.min(255, gg * ratio); bb = Math.min(255, bb * ratio);
    }
    bd[p] = Math.round(bd[p] * (1 - a) + rr * a);
    bd[p + 1] = Math.round(bd[p + 1] * (1 - a) + gg * a);
    bd[p + 2] = Math.round(bd[p + 2] * (1 - a) + bb * a);
  }
  ctx.putImageData(base, 0, 0);
  return out;
}

window.PhotoIALabRecolor = {
  canvasForImage,
  schpInputFromCanvas,
  maskFromLogits,
  recolorInputFromCanvas,
  tensorRgbToCanvas,
  compositeToOriginal,
  maskCanvas,
  regionName,
  protectMask,
  subjectMaskFromLogits
};
})();
