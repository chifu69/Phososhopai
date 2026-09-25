PHOTO IA ONNX LAB 1.0 — Hair & Clothing Recolor
=================================================

PURPOSE
-------
This is a completely isolated disposable experiment. It does not import or modify PHOTO IA stable modules.
Delete these LAB files and clear the LAB model cache to remove it.

FILES IN THIS LAB
-----------------
onnx-lab.html
onnx-lab.css
onnx-lab.js
onnx-lab-engine.js
onnx-lab-recolor.js
onnx-lab-models.js
ONNX-LAB-README.txt

NO PHOTO IA STABLE FILE WAS MODIFIED.
There is no tests/ folder and no assets/ folder.

WHAT IS REAL
------------
1) ONNX Runtime Web runs locally in the browser.
2) Stage 1 semantic parsing is a REAL ONNX model:
   Model: pirocheto/schp-lip-20 — INT8 static ONNX
   File: schp-lip-20-int8-static.onnx
   License: MIT
   Source: https://huggingface.co/pirocheto/schp-lip-20
   Input: pixel_values float32 [1,3,473,473]
   Outputs: logits / parsing_logits / edge_logits
   Normalization: RGB tensor 0..1, mean [0.406,0.456,0.485], std [0.225,0.224,0.229]
   Classes used by the LAB: Hair, Upper-clothes, Dress, Coat, Pants, Jumpsuits, Skirt, Left-shoe, Right-shoe.

3) Stage 2 guided recolor is also a REAL ONNX model:
   Model: Faridzar/manga-colorization-v2-onnx
   File: manga-colorize-fp16.onnx
   License: MIT
   Source: https://huggingface.co/Faridzar/manga-colorization-v2-onnx
   Input: input float32 [1,5,H,W]
      ch0 grayscale 0..1
      ch1-3 color hint ((c-0.5)/0.5)
      ch4 hint mask 0..1
      H/W multiples of 32
   Output: rgb float32 [1,3,H,W] 0..1

IMPORTANT EXPERIMENTAL LIMITATION
---------------------------------
The recolor ONNX generator was trained for manga/anime colorization, NOT photographic hair or clothing.
It is used here only because its verified ONNX interface accepts explicit color hints and a hint mask.
This LAB is specifically intended to answer: does this architecture transfer well enough to photographs to be useful?
If the answer is no, delete the LAB. Do not promote this recolor model into stable PHOTO IA.

The semantic parser is appropriate for photographs/human parsing. The uncertainty is the Stage 2 recolor generator.

MODEL INSTALLATION
------------------
The ZIP does NOT contain ~127 MB of model weights.
On first Prepare/Apply, the LAB downloads the two verified ONNX files and stores them in IndexedDB under:
  photo-ia-onnx-lab-1-models

The image itself is never uploaded by this code. Only public model files are downloaded.

ONNX RUNTIME
------------
ONNX Runtime Web 1.23.0 is lazy-loaded from jsDelivr.
The LAB tries WebGPU first when navigator.gpu exists, then falls back to WASM.
On iPhone/iPad, WASM thread count is forced to 1 for stability.

IMAGE STRATEGY
--------------
- Original image stays at original resolution.
- Semantic parsing uses a reduced working copy and model input 473x473.
- Guided recolor uses 512x512 on iPhone/iPad and 640x640 elsewhere.
- Only the selected semantic region is composited back.
- Pixels outside the selected region are preserved exactly in the final compositing loop.
- A full-resolution result canvas is created only at final compositing/export time.

HAIR
----
Hair uses SCHP class 2 (Hair), softened before being used as the recolor hint/composite mask.
The LAB attempts to preserve original luminance/texture during final compositing, but the recolor model itself was not trained for photos.

CLOTHING
--------
Upper garment: Upper-clothes + Coat
Lower garment: Pants + Skirt
Dress: Dress + Jumpsuits
Shoes: Left-shoe + Right-shoe
Automatic garment detection: selects whichever of the above four groups has the largest parsed area.

PRESERVE CONTROLS
-----------------
The ONNX recolor model generates the candidate colors.
Final local compositing can reduce recolor strength in shadows/highlights and re-match generated luminance to the original region to preserve texture.
These controls are deterministic post-processing; the semantic detection and color generation remain ONNX inference stages.

DIAGNOSTICS
-----------
The UI reports runtime/backend, cached model state and size, actual session input/output names after load, inference size, detected region, mask coverage, segmentation time, recolor time, total time and the last failure.
Use Original / Mask / ONNX Result / Before-After to determine whether a failure is segmentation or recolor quality.

KNOWN IPHONE LIMITATIONS
------------------------
- First model download is large: roughly 65-66 MB parser + 61.7 MB recolor.
- Safari may evict IndexedDB data under storage pressure.
- WebGPU availability/support varies; WASM fallback is always attempted.
- Large 12-48 MP photos can still fail during the final full-resolution canvas creation if Safari runs out of memory. Failure leaves the original photo untouched.
- The recolor model is experimental for photographs and may produce unrealistic results.

HOW TO DELETE THE LAB COMPLETELY
--------------------------------
1) Delete these seven LAB files from GitHub/server.
2) Before deleting, optionally open the LAB and press "Delete LAB model cache" to remove its IndexedDB model data.
3) No PHOTO IA stable file needs to be restored because none was modified.

VERIFICATION PERFORMED WHEN PACKAGED
------------------------------------
- JavaScript syntax checked with Node.js for all LAB JS files.
- File structure checked as flat: no subfolders.
- Stable PHOTO IA files are not included in this ZIP.
- No claim is made that photographic recolor quality is proven. Actual browser ONNX inference must be tested on the target iPhone.
