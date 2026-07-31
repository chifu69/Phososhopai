'use strict';

const $ = id => document.getElementById(id);
const canvas = $('editor-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
const sliders = ['brightness', 'contrast', 'saturation', 'temperature', 'sharpness', 'blur'];
const controls = [...document.querySelectorAll(
  'button[data-preset],button[data-command],button[data-studio],.slider-list input,#rotate-left,#rotate-right,#flip-x,#crop-square,#reset-btn,#compare-btn,#download-btn,#command-input,#command-btn'
)];

let sourceImage = null;
let sourceObjectURL = '';
let rotation = 0;
let flipX = false;
let squareCrop = false;
let compareDown = false;
let history = [];
let historyIndex = -1;
let renderToken = 0;
let renderTimer = 0;
let rendering = false;
let toastTimer = 0;

const PREVIEW_MAX_EDGE = 1080;
const MAX_SHARPEN_PIXELS = 720000;

const studioData = {
  magic: { title: 'One Click Magic', desc: 'Mejoras locales que funcionan ahora mismo.', options: [
    ['✨', 'Mejora profesional', 'Color, contraste y nitidez', 'local', 'professional'],
    ['🙂', 'Retrato natural', 'Tonos suaves', 'local', 'portrait'],
    ['🌈', 'Color vibrante', 'Más fuerza sin exagerar', 'local', 'vivid'],
    ['◐', 'Blanco y negro', 'Escala de grises real', 'local', 'bw']
  ]},
  outfit: { title: 'Outfit Studio', desc: 'Preparado para cambiar ropa conservando pose, cuerpo y rostro.', options: [
    ['👔', 'Traje elegante', 'Negro, azul o gris', 'IA'], ['🧥', 'Chaqueta', 'Cuero, denim o casual', 'IA'],
    ['🏭', 'Uniforme industrial', 'Casco, chaleco y uniforme', 'IA'], ['🦸', 'Disfraces', 'Ediciones divertidas', 'IA']
  ]},
  hair: { title: 'Hair Studio', desc: 'Peinados, color, barba y cambios de apariencia.', options: [
    ['💇', 'Cambiar peinado', 'Corto, largo, rizado o liso', 'IA'], ['🎨', 'Cambiar color', 'Rubio, negro, rojo o fantasía', 'IA'],
    ['🧔', 'Barba y bigote', 'Agregar o quitar', 'IA'], ['✨', 'Reflejos', 'Mechas y tonos selectivos', 'IA']
  ]},
  face: { title: 'Face Studio', desc: 'Retoques y transformaciones faciales.', options: [
    ['😁', 'Sonrisa', 'Cambiar expresión', 'IA'], ['🕰️', 'Edad', 'Rejuvenecer o envejecer', 'IA'],
    ['💄', 'Retoque natural', 'Piel, ojos y dientes', 'IA'], ['👓', 'Accesorios', 'Lentes y sombreros', 'IA']
  ]},
  swap: { title: 'Fun Swap', desc: 'Intercambia caras o cuerpos para uso creativo.', options: [
    ['🔄', 'Face Swap', 'Intercambiar rostros', 'IA'], ['🕺', 'Body Swap', 'Intercambiar cuerpos', 'IA'],
    ['🎭', 'Cambio de cabeza', 'Cabeza en otro cuerpo', 'IA'], ['🎲', 'Surprise Me', 'Transformación al azar', 'IA']
  ]},
  background: { title: 'Background Studio', desc: 'Fondo y profundidad.', options: [
    ['🫥', 'Quitar fondo', 'Crear transparencia', 'IA'], ['🌫️', 'Desenfocar foto', 'Desenfoque local', 'local', 'blur'],
    ['🌅', 'Cambiar escenario', 'Playa, ciudad o estudio', 'IA'], ['🎨', 'Color sólido', 'Fondo de estudio', 'IA']
  ]},
  design: { title: 'Text & Design', desc: 'Diseño visual.', options: [
    ['🔤', 'Agregar texto', 'Próximo módulo', 'next'], ['😊', 'Stickers', 'Próximo módulo', 'next'],
    ['✏️', 'Dibujar', 'Próximo módulo', 'next'], ['🖼️', 'Marco', 'Próximo módulo', 'next']
  ]},
  repair: { title: 'Magic Repair', desc: 'Limpieza y restauración.', options: [
    ['🧽', 'Borrar objeto', 'Relleno inteligente', 'IA'], ['🩹', 'Healing Brush', 'Próximo módulo', 'next'],
    ['🕰️', 'Restaurar foto vieja', 'Ruido y daños', 'IA'], ['🔍', 'Aumentar resolución', 'Upscale inteligente', 'IA']
  ]}
};

function toast(message, duration = 1900) {
  clearTimeout(toastTimer);
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  toastTimer = setTimeout(() => element.classList.remove('show'), duration);
}

function setProcessing(value) {
  rendering = value;
  $('processing').hidden = !value;
}

function getValues() {
  return Object.fromEntries(sliders.map(id => [id, Number($(id).value)]));
}

function setSlider(id, value) {
  const input = $(id);
  if (!input) return;
  const safe = Math.max(Number(input.min), Math.min(Number(input.max), Number(value)));
  input.value = String(safe);
  $(id + '-out').value = String(safe);
}

function setEnabled(enabled) {
  controls.forEach(element => { element.disabled = !enabled; });
  $('undo-btn').disabled = !enabled || historyIndex <= 0;
  $('redo-btn').disabled = !enabled || historyIndex >= history.length - 1;
}

function snapshot() {
  return { filters: getValues(), rotation, flipX, squareCrop };
}

function commit() {
  const next = JSON.parse(JSON.stringify(snapshot()));
  const current = history[historyIndex];
  if (current && JSON.stringify(current) === JSON.stringify(next)) return;
  history = history.slice(0, historyIndex + 1);
  history.push(next);
  historyIndex = history.length - 1;
  setEnabled(Boolean(sourceImage));
}

async function applySnapshot(state) {
  sliders.forEach(id => setSlider(id, state.filters[id]));
  rotation = state.rotation;
  flipX = state.flipX;
  squareCrop = state.squareCrop;
  await requestRender();
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    toast('Selecciona una imagen válida.');
    return;
  }
  if (sourceObjectURL) URL.revokeObjectURL(sourceObjectURL);
  sourceObjectURL = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.onload = async () => {
    sourceImage = image;
    rotation = 0;
    flipX = false;
    squareCrop = false;
    sliders.forEach(id => setSlider(id, 0));
    history = [];
    historyIndex = -1;
    commit();
    $('empty-state').hidden = true;
    canvas.style.display = 'block';
    $('project-title').textContent = file.name || 'Foto';
    $('image-info').textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    await requestRender(true);
    toast('Foto abierta');
  };
  image.onerror = () => toast('No pude abrir esa imagen. Prueba JPG, PNG o WebP.');
  image.src = sourceObjectURL;
}

function outputDimensions() {
  let width = sourceImage.naturalWidth;
  let height = sourceImage.naturalHeight;
  if (squareCrop) width = height = Math.min(width, height);
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawBaseImage() {
  const { width, height } = outputDimensions();
  canvas.width = width;
  canvas.height = height;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(flipX ? -1 : 1, 1);

  let sw = sourceImage.naturalWidth;
  let sh = sourceImage.naturalHeight;
  let sx = 0;
  let sy = 0;
  if (squareCrop) {
    const size = Math.min(sw, sh);
    sx = (sw - size) / 2;
    sy = (sh - size) / 2;
    sw = sh = size;
  }
  const rotated = Math.abs(rotation) % 180 === 90;
  const dw = rotated ? height : width;
  const dh = rotated ? width : height;
  ctx.filter = 'none';
  ctx.drawImage(sourceImage, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function clamp255(value) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function applyPixelAdjustments(filters) {
  const needsPixels = filters.brightness || filters.contrast || filters.saturation || filters.temperature;
  if (!needsPixels) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const brightness = filters.brightness * 2.15;
  const contrastValue = Math.max(-99, Math.min(99, filters.contrast));
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const saturationFactor = Math.max(0, (100 + filters.saturation) / 100);
  const temperature = filters.temperature * 0.72;

  for (let index = 0; index < data.length; index += 4) {
    let red = contrastFactor * (data[index] - 128) + 128 + brightness;
    let green = contrastFactor * (data[index + 1] - 128) + 128 + brightness;
    let blue = contrastFactor * (data[index + 2] - 128) + 128 + brightness;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    red = luminance + (red - luminance) * saturationFactor + temperature;
    green = luminance + (green - luminance) * saturationFactor;
    blue = luminance + (blue - luminance) * saturationFactor - temperature;
    data[index] = clamp255(red);
    data[index + 1] = clamp255(green);
    data[index + 2] = clamp255(blue);
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyBlur(radius) {
  if (!radius) return;
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = `blur(${Math.min(14, radius)}px)`;
  ctx.drawImage(copy, 0, 0);
  ctx.filter = 'none';
}

function applySharpen(amount) {
  if (!amount || canvas.width * canvas.height > MAX_SHARPEN_PIXELS) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const source = imageData.data;
  const output = new Uint8ClampedArray(source);
  const width = canvas.width;
  const height = canvas.height;
  const mix = Math.min(0.72, amount / 120);
  const stride = width * 4;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * stride + x * 4;
      for (let channel = 0; channel < 3; channel++) {
        const sharpened = source[index + channel] * 5
          - source[index - 4 + channel]
          - source[index + 4 + channel]
          - source[index - stride + channel]
          - source[index + stride + channel];
        output[index + channel] = clamp255(source[index + channel] * (1 - mix) + sharpened * mix);
      }
    }
  }
  imageData.data.set(output);
  ctx.putImageData(imageData, 0, 0);
}

async function renderNow(showOriginal = false) {
  if (!sourceImage) return;
  const token = ++renderToken;
  setProcessing(true);
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    drawBaseImage();
    if (!showOriginal) {
      const filters = getValues();
      applyPixelAdjustments(filters);
      applyBlur(filters.blur);
      applySharpen(filters.sharpness);
    }
    if (token !== renderToken) return;
  } catch (error) {
    console.error(error);
    toast('No pude procesar ese ajuste. Prueba con una foto más pequeña.', 2600);
  } finally {
    if (token === renderToken) setProcessing(false);
  }
}

function requestRender(immediate = false, showOriginal = false) {
  clearTimeout(renderTimer);
  if (immediate) return renderNow(showOriginal);
  return new Promise(resolve => {
    renderTimer = setTimeout(async () => {
      await renderNow(showOriginal);
      resolve();
    }, 32);
  });
}

async function preset(name) {
  const presets = {
    auto: [10, 12, 10, 4, 14, 0],
    professional: [10, 14, 12, 3, 16, 0],
    portrait: [8, -2, -5, 5, 7, 0],
    vivid: [6, 18, 30, 3, 12, 0],
    bw: [0, 10, -100, 0, 0, 0]
  };
  const values = presets[name] || [0, 0, 0, 0, 0, 0];
  sliders.forEach((id, index) => setSlider(id, values[index]));
  commit();
  await requestRender(true);
  const messages = { bw: 'Blanco y negro aplicado', portrait: 'Retrato aplicado', vivid: 'Color vibrante aplicado', auto: 'Mejora aplicada', professional: 'Mejora profesional aplicada' };
  toast(messages[name] || 'Ajuste aplicado');
}

function normalizeCommand(text = '') {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const commandIntents = [
  ['professional', [/\bprofessional\b/, /\bprofesional\b/, /\bmejorar\b/, /\bhazla pro\b/, /\bcalidad profesional\b/]],
  ['portrait', [/\bportrait\b/, /\bretrato\b/, /\bpiel natural\b/, /\bmejorar rostro\b/]],
  ['vivid', [/\bvivid\b/, /\bvibrante\b/, /\bmas color\b/, /\bsaturacion\b/, /\bcolor intenso\b/]],
  ['bw', [/\bbw\b/, /\bb w\b/, /\bblack and white\b/, /\bblanco y negro\b/, /\bescala de grises\b/, /\bmonocromo\b/, /\bsin color\b/, /\bgrayscale\b/]],
  ['brighten', [/\bmas brillo\b/, /\bmas brillante\b/, /\baclara\b/, /\bmore light\b/, /\bbrighten\b/]],
  ['darken', [/\bmenos brillo\b/, /\boscurece\b/, /\bdarken\b/]],
  ['contrastUp', [/\bmas contraste\b/, /\bcontrast up\b/]],
  ['contrastDown', [/\bmenos contraste\b/, /\bcontrast down\b/]],
  ['warm', [/\bmas calida\b/, /\btono calido\b/, /\bwarm\b/]],
  ['cool', [/\bmas fria\b/, /\btono frio\b/, /\bcool\b/]],
  ['blur', [/\bdesenfoca\b/, /\bdesenfoque\b/, /\bblur\b/]],
  ['sharpen', [/\bmas nitida\b/, /\bnitidez\b/, /\benfoca\b/, /\bsharpen\b/]],
  ['reset', [/\brestablece\b/, /\boriginal\b/, /\bquita filtros\b/, /\breset\b/]],
  ['rotateLeft', [/\bgira izquierda\b/, /\brotar izquierda\b/, /\brotate left\b/]],
  ['rotateRight', [/\bgira derecha\b/, /\brotar derecha\b/, /\brotate right\b/]],
  ['flip', [/\bespejo\b/, /\bvoltea horizontal\b/, /\bflip\b/]],
  ['square', [/\brecorte cuadrado\b/, /\bhazla cuadrada\b/, /\bsquare crop\b/]],
  ['aiOutfit', [/\bcambia ropa\b/, /\btraje\b/, /\bvestido\b/, /\buniforme\b/, /\boutfit\b/]],
  ['aiHair', [/\bcambia el pelo\b/, /\bcambia el cabello\b/, /\bcambia peinado\b/, /\bhair\b/]],
  ['aiSwap', [/\bface swap\b/, /\bbody swap\b/, /\bintercambia caras\b/, /\bintercambia cuerpos\b/, /\bmi cabeza\b/]],
  ['aiBackground', [/\bquita el fondo\b/, /\bcambia el fondo\b/, /\bfondo transparente\b/, /\bremove background\b/]],
  ['aiErase', [/\bborra objeto\b/, /\belimina persona\b/, /\bmagic eraser\b/]]
];

async function resetLocalEdits() {
  sliders.forEach(id => setSlider(id, 0));
  rotation = 0;
  flipX = false;
  squareCrop = false;
  commit();
  await requestRender(true);
  toast('Foto restablecida');
}

async function runIntent(id) {
  if (['professional', 'portrait', 'vivid', 'bw'].includes(id)) return preset(id);
  const changes = {
    brighten: ['brightness', 25, 'Foto aclarada'], darken: ['brightness', -20, 'Brillo reducido'],
    contrastUp: ['contrast', 18, 'Contraste aumentado'], contrastDown: ['contrast', -18, 'Contraste reducido'],
    warm: ['temperature', 20, 'Tono más cálido'], cool: ['temperature', -20, 'Tono más frío'],
    blur: ['blur', 5, 'Desenfoque aplicado'], sharpen: ['sharpness', 22, 'Nitidez aplicada']
  };
  if (changes[id]) {
    const [slider, delta, message] = changes[id];
    setSlider(slider, Number($(slider).value) + delta);
    commit();
    await requestRender(true);
    toast(message);
    return true;
  }
  if (id === 'reset') return resetLocalEdits();
  if (id === 'rotateLeft') rotation = (rotation - 90) % 360;
  else if (id === 'rotateRight') rotation = (rotation + 90) % 360;
  else if (id === 'flip') flipX = !flipX;
  else if (id === 'square') squareCrop = !squareCrop;
  else {
    const messages = {
      aiOutfit: 'Cambiar ropa necesita conectar un motor generativo.', aiHair: 'Cambiar cabello necesita conectar un motor generativo.',
      aiSwap: 'Intercambiar caras o cuerpos necesita conectar un motor generativo.', aiBackground: 'Quitar o reemplazar fondo necesita el módulo de IA.',
      aiErase: 'El borrado inteligente necesita el módulo de IA.'
    };
    if (messages[id]) { toast(messages[id], 2700); return true; }
    return false;
  }
  commit();
  await requestRender(true);
  toast(id === 'square' ? (squareCrop ? 'Recorte cuadrado' : 'Recorte original') : 'Transformación aplicada');
  return true;
}

function detectIntents(query) {
  const direct = { professional: 'professional', portrait: 'portrait', vivid: 'vivid', bw: 'bw', auto: 'professional' };
  if (direct[query]) return [direct[query]];
  return commandIntents.filter(([, patterns]) => patterns.some(pattern => pattern.test(query))).map(([id]) => id);
}

async function executeCommand(raw) {
  if (!sourceImage) return toast('Primero abre una foto.');
  const query = normalizeCommand(raw);
  if (!query) return toast('Escribe lo que quieres hacer.');
  const intents = detectIntents(query);
  if (!intents.length) return toast('No entendí. Prueba “blanco y negro”, “más brillo” o “hazla profesional”.', 2600);
  const presetIntent = intents.find(id => ['professional', 'portrait', 'vivid', 'bw'].includes(id));
  if (presetIntent) return runIntent(presetIntent);
  const aiIntent = intents.find(id => id.startsWith('ai'));
  if (aiIntent) return runIntent(aiIntent);
  for (const intent of intents.slice(0, 3)) await runIntent(intent);
}

function openStudio(key) {
  const data = studioData[key];
  if (!data) return;
  $('sheet-title').textContent = data.title;
  $('sheet-description').textContent = data.desc;
  $('sheet-content').innerHTML = '';
  data.options.forEach(([icon, title, subtitle, type, action]) => {
    const button = document.createElement('button');
    button.className = 'sheet-option';
    button.innerHTML = `<span>${icon}</span><div><strong>${title}</strong><small>${subtitle}</small></div><em class="badge">${type === 'local' ? 'LOCAL' : type === 'next' ? 'PRÓXIMO' : 'IA'}</em>`;
    button.onclick = async () => {
      if (type === 'local') {
        if (action === 'blur') { setSlider('blur', 6); commit(); await requestRender(true); toast('Desenfoque aplicado'); }
        else await preset(action);
        closeSheet();
      } else toast(type === 'next' ? 'Esta herramienta se añadirá en el próximo módulo.' : 'Esta opción necesita conectar el motor de IA generativa.', 2600);
    };
    $('sheet-content').appendChild(button);
  });
  $('studio-sheet').hidden = false;
}

function closeSheet() { $('studio-sheet').hidden = true; }

sliders.forEach(id => {
  $(id).addEventListener('input', () => {
    $(id + '-out').value = $(id).value;
    requestRender();
  });
  $(id).addEventListener('change', commit);
});

document.querySelectorAll('button[data-preset]').forEach(button => { button.onclick = () => preset(button.dataset.preset); });
document.querySelectorAll('button[data-command]').forEach(button => { button.onclick = () => runIntent(button.dataset.command); });
document.querySelectorAll('button[data-studio]').forEach(button => { button.onclick = () => openStudio(button.dataset.studio); });

$('command-btn').onclick = () => executeCommand($('command-input').value);
$('command-input').addEventListener('keydown', event => { if (event.key === 'Enter') executeCommand(event.target.value); });
$('file-input').onchange = event => loadFile(event.target.files[0]);
$('camera-input').onchange = event => loadFile(event.target.files[0]);
$('rotate-left').onclick = () => runIntent('rotateLeft');
$('rotate-right').onclick = () => runIntent('rotateRight');
$('flip-x').onclick = () => runIntent('flip');
$('crop-square').onclick = () => runIntent('square');
$('reset-btn').onclick = resetLocalEdits;
$('undo-btn').onclick = async () => { if (historyIndex > 0) { historyIndex--; await applySnapshot(history[historyIndex]); setEnabled(true); } };
$('redo-btn').onclick = async () => { if (historyIndex < history.length - 1) { historyIndex++; await applySnapshot(history[historyIndex]); setEnabled(true); } };
$('compare-btn').addEventListener('pointerdown', async () => { compareDown = true; await renderNow(true); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(eventName => $('compare-btn').addEventListener(eventName, async () => {
  if (compareDown) { compareDown = false; await renderNow(false); }
}));
$('download-btn').onclick = async () => {
  if (!sourceImage) return;
  await renderNow(false);
  const format = $('format').value;
  const quality = Number($('quality').value) / 100;
  const extension = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
  canvas.toBlob(blob => {
    if (!blob) return toast('No pude preparar la imagen.');
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.download = `photo-ia-${Date.now()}.${extension}`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Imagen guardada');
  }, format, quality);
};
$('theme-btn').onclick = () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('photoIATheme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
};
$('sheet-close').onclick = closeSheet;
$('sheet-backdrop').onclick = closeSheet;

if (localStorage.getItem('photoIATheme') === 'dark') document.documentElement.classList.add('dark');
setEnabled(false);

window.addEventListener('load', async () => {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('photo-ia-') && key !== 'photo-ia-3.0.0').map(key => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.register('sw.js?v=3.0.0', { updateViaCache: 'none' });
      await registration.update();
    }
  } catch (error) {
    console.warn('Service worker update skipped', error);
  }
});
