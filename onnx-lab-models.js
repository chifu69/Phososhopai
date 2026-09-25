(() => {
'use strict';

const MODELS = {
  parser: {
    id: 'schp-lip-20-int8-static',
    kind: 'semantic-segmentation',
    filename: 'schp-lip-20-int8-static.onnx',
    source: 'https://huggingface.co/pirocheto/schp-lip-20/resolve/main/onnx/schp-lip-20-int8-static.onnx?download=true',
    project: 'https://huggingface.co/pirocheto/schp-lip-20',
    license: 'MIT',
    approximateBytes: 66 * 1024 * 1024,
    inputNames: ['pixel_values'],
    outputNames: ['logits', 'parsing_logits', 'edge_logits'],
    inputShape: [1, 3, 473, 473],
    inputType: 'float32',
    normalization: {
      range: '[0,1] then channel-wise normalize',
      meanRGB: [0.406, 0.456, 0.485],
      stdRGB: [0.225, 0.224, 0.229],
      note: 'SCHP uses RGB tensors with BGR-indexed training constants.'
    },
    expectedImageSize: '473x473 direct bilinear resize',
    labels: [
      'Background','Hat','Hair','Glove','Sunglasses','Upper-clothes','Dress','Coat','Socks','Pants',
      'Jumpsuits','Scarf','Skirt','Face','Left-arm','Right-arm','Left-leg','Right-leg','Left-shoe','Right-shoe'
    ],
    regions: {
      hair: [2],
      upper: [5, 7],
      lower: [9, 12],
      dress: [6, 10],
      shoes: [18, 19],
      garmentAuto: [5, 6, 7, 9, 10, 12, 18, 19]
    },
    verified: true,
    notes: 'Real ONNX human parsing model. INT8 static model reported by its project at about 65-66 MB with 99.09% pixel agreement vs FP32.'
  },

  recolor: {
    id: 'manga-colorization-v2-fp16',
    kind: 'guided-colorization-experimental',
    filename: 'manga-colorize-fp16.onnx',
    source: 'https://huggingface.co/Faridzar/manga-colorization-v2-onnx/resolve/main/manga-colorize-fp16.onnx?download=true',
    project: 'https://huggingface.co/Faridzar/manga-colorization-v2-onnx',
    license: 'MIT',
    approximateBytes: 61.7 * 1024 * 1024,
    inputNames: ['input'],
    outputNames: ['rgb'],
    inputShape: [1, 5, 'H', 'W'],
    inputType: 'float32',
    normalization: {
      channel0: 'grayscale 0..1',
      channels1to3: 'color hint ((c - 0.5) / 0.5); zero outside hint region',
      channel4: 'hint mask 0..1',
      spatial: 'H and W must be multiples of 32'
    },
    expectedImageSize: 'LAB uses 512x512 for iPhone stability',
    maskFormat: 'semantic mask converted to soft hint mask; only selected region is composited back',
    verified: true,
    warning: 'This recolor generator was trained for manga/anime colorization, not photographic hair or garments. It is intentionally used only in this disposable LAB to test transfer to photos. Do not promote to stable PHOTO IA based on architecture alone.'
  }
};

window.PhotoIALabModels = Object.freeze(MODELS);
})();
