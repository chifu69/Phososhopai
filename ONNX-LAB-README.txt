PHOTO IA ONNX LAB 2.0 — Recolor + Restore + Depth
==================================================

PURPOSE
-------
A completely isolated disposable ONNX laboratory. It does not import or modify PHOTO IA stable modules.
Delete the LAB files and clear its IndexedDB model cache to remove it.

FLAT LAB FILES
--------------
onnx-lab.html
onnx-lab.css
onnx-lab.js
onnx-lab-engine.js
onnx-lab-models.js
onnx-lab-recolor.js
onnx-lab-restore.js
onnx-lab-depth.js
onnx-lab-selection.js
ONNX-LAB-README.txt

NO PHOTO IA STABLE FILE IS INCLUDED OR MODIFIED.
No tests/ folder. No assets/ folder. No service worker.

STATUS — WHAT IS REAL VS NOT READY
----------------------------------
1) HAIR & CLOTHING RECOLOR — REAL / RETAINED FROM LAB 1.0
   The same SCHP semantic parser + guided ONNX recolor architecture used in LAB 1.0 is retained.
   The user already reported LAB 1.0 recolor working very well on real photos.
   LAB 2.0 adds Light/Balanced/Strong comparison and optional protection controls.
   This exact 2.0 package was syntax/static checked, but its browser inference was not independently executed by the packager.

2) BACKGROUND SEPARATION — REAL PIPELINE / DEVICE VALIDATION REQUIRED
   Uses the verified SCHP ONNX parser already used by recolor.
   It creates a human-subject mask and supports Select Subject, Remove Background, Blur Background and Solid Color Background.

3) DEPTH ESTIMATION — REAL MODEL / DEVICE VALIDATION REQUIRED
   Uses Depth Anything V2 Small quantized ONNX.
   Produces relative inverse depth. Larger values represent nearer scene regions.

4) PORTRAIT BLUR — REAL DEPTH PIPELINE / DEVICE VALIDATION REQUIRED
   Uses the Depth Anything ONNX output, then performs local progressive sharp-to-blur compositing.
   No photo is uploaded.

5) SUPER RESOLUTION — REAL MODEL / DEVICE VALIDATION REQUIRED
   Uses Real-ESRGAN RRDBNet ONNX with tiled inference.
   2x is the iPhone target. 4x is disabled on iPhone in this build due output-memory growth.
   The LAB refuses unsafe output sizes instead of silently resizing the source photo.

6) AI DENOISE — MODEL NOT INSTALLED / EXPERIMENT NOT READY
   Reason: no single-file general-photo ONNX denoiser was selected for this build without weakening the flat/disposable model rule.

7) AI DEBLUR — MODEL NOT INSTALLED / EXPERIMENT NOT READY
   NAFNet was considered, but this build does not claim a browser ONNX input/output contract that was not fully verified for this integration.

8) FACE RESTORATION — MODEL NOT INSTALLED / EXPERIMENT NOT READY
   No identity-conservative browser-safe adapter was verified for this build.

9) BLACK & WHITE COLORIZATION — MODEL NOT INSTALLED / EXPERIMENT NOT READY
   No verified general-photography ONNX adapter was selected.

10) ADVANCED TAP-ANY-OBJECT SELECTION — MODEL NOT INSTALLED / EXPERIMENT NOT READY
    SCHP is human parsing, not a promptable arbitrary-object segmenter. The LAB does not pretend otherwise.

VERIFIED MODEL ADAPTERS
-----------------------
A) Human parsing / semantic selection
   Model: pirocheto/schp-lip-20 — INT8 static ONNX
   File: schp-lip-20-int8-static.onnx
   Source: https://huggingface.co/pirocheto/schp-lip-20
   Download: https://huggingface.co/pirocheto/schp-lip-20/resolve/main/onnx/schp-lip-20-int8-static.onnx?download=true
   License: MIT
   Approx size: 65-66 MB
   Input: pixel_values float32 [1,3,473,473]
   Outputs: logits / parsing_logits / edge_logits
   Normalization: RGB 0..1; mean [0.406,0.456,0.485], std [0.225,0.224,0.229]
   Classes used: Hair, Upper-clothes, Dress, Coat, Pants, Jumpsuits, Skirt, Face, arms, legs, shoes, and all non-background classes for subject separation.

B) Guided experimental recolor
   Model: Faridzar/manga-colorization-v2-onnx
   File: manga-colorize-fp16.onnx
   Source: https://huggingface.co/Faridzar/manga-colorization-v2-onnx
   License: MIT
   Approx size: 61.7 MB
   Input: input float32 [1,5,H,W]
     channel 0 = grayscale 0..1
     channels 1-3 = color hint ((c-.5)/.5)
     channel 4 = hint mask 0..1
     H/W multiples of 32
   Output: rgb float32 [1,3,H,W]
   Important: trained for manga/anime, not photos. It remains LAB-only even though the user reported very good photo recolor transfer in LAB 1.0.

C) Relative depth
   Model: Depth Anything V2 Small — quantized ONNX
   Publisher used here: skillsafe-ai browser-ready artifact with provenance to onnx-community / Depth Anything V2 Small
   File: model_quantized.onnx
   Source: https://huggingface.co/skillsafe-ai/depth-anything-v2-small
   Download: https://huggingface.co/skillsafe-ai/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx?download=true
   License: Apache-2.0
   Approx size: 26.0 MB
   Input: pixel_values float32 [1,3,518,518] in this LAB
   Output: predicted_depth float32 [1,518,518] for the tested fixed shape
   Preprocess: RGB /255, mean [0.485,0.456,0.406], std [0.229,0.224,0.225]
   Meaning: relative inverse depth, not metric distance; larger values are nearer.

D) Super Resolution 2x
   Model: Real-ESRGAN RRDBNet 2x ONNX
   File: real_esrgan_x2.onnx
   Source: https://huggingface.co/SceneWorks/real-esrgan-onnx
   Download: https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x2.onnx?download=true
   License: BSD-3-Clause
   Approx size: 67.1 MB
   Input: input float32 [1,3,H,W] RGB [0,1]
   Output: output float32 [1,3,2H,2W]
   Dynamic H/W. LAB uses tiled inference.

E) Super Resolution 4x
   Model: Real-ESRGAN RRDBNet 4x ONNX
   File: real_esrgan_x4.onnx
   Source: https://huggingface.co/SceneWorks/real-esrgan-onnx
   Download: https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x4.onnx?download=true
   License: BSD-3-Clause
   Approx size: 67.1 MB
   Input: input float32 [1,3,H,W] RGB [0,1]
   Output: output float32 [1,3,4H,4W]
   Disabled on iPhone in LAB 2.0 by design.

RECOLOR PRO CHANGES
-------------------
The original ONNX recolor inference still runs once. LAB 2.0 then creates three deterministic full-resolution composites:
- Light
- Balanced
- Strong

Protect skin / protect face use SCHP class labels to suppress semantic-mask bleed at those regions.
Protect logos is an experimental deterministic high-frequency edge protection during final compositing. It is not a logo detector and is clearly LAB-only.
Preserve texture/shadows/highlights remain local post-processing around the ONNX-generated candidate.

MODEL CACHE
-----------
Models are downloaded only when an experiment needs them and cached in IndexedDB.
LAB 2.0 intentionally keeps the LAB 1.0 database name:
  photo-ia-onnx-lab-1-models
This allows the already-downloaded parser/recolor weights from LAB 1.0 to be reused.
The UI supports deleting one cached model or all LAB model cache.

ONNX RUNTIME
------------
ONNX Runtime Web 1.23.0 is loaded independently by the LAB from jsDelivr.
The LAB tries WebGPU when navigator.gpu exists and falls back to WASM.
On iPhone/iPad, WASM threads are forced to 1.
No stable PHOTO IA onnx-engine.js is imported.

IPHONE SAFETY
-------------
- WASM threads = 1.
- Models lazy-load; all models are not loaded at startup.
- Sessions are reused.
- Input/output tensors are disposed where supported.
- Real-ESRGAN runs tiled rather than sending a full high-resolution photo into one tensor.
- 4x Super Resolution is disabled on iPhone.
- Super Resolution and full-resolution blur operations use explicit pixel-count safety limits and fail without changing the original if too large.
- Safari may evict IndexedDB model data under storage pressure.
- WebGPU support can vary; WASM fallback is attempted.

PRIVACY
-------
This code never uploads the user image.
It does not call Alienware, ComfyUI, PHOTO IA servers, OpenAI, or cloud inference APIs.
Only public ONNX runtime/model files are downloaded.

DIAGNOSTICS
-----------
The Diagnostics panel reports:
- active experiment
- runtime loaded
- ONNX Runtime version
- WebGPU availability
- active backend
- model names
- actual session input/output names after load
- inference resolution
- detected region
- output size
- preprocessing / segmentation / recolor / inference / postprocessing / total timings
- memory-failure heuristic
- exact error text

HOW TO DELETE THE LAB COMPLETELY
--------------------------------
1) Open LAB 2.0 and press "Delete all LAB model cache" if you want to remove downloaded model bytes.
2) Delete these ten flat LAB files listed at the top of this README.
3) No PHOTO IA stable file needs restoration because this ZIP contains none and imports none.

PACKAGING VERIFICATION
----------------------
The package was checked for:
- JavaScript syntax using Node.js --check for every LAB JS file.
- Flat ZIP structure with no subfolders.
- Every local script/CSS reference in onnx-lab.html resolves to a packaged file.
- No stable PHOTO IA module is included or referenced by script src/import.
- No claim is made that new Depth, Background or Super Resolution browser inference was successfully executed on the target iPhone before delivery.
- Existing LAB 1.0 recolor had already been reported by the user as working very well; LAB 2.0 preserves that core architecture and extends around it.
