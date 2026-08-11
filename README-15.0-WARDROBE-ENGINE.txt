PHOTO IA 15.0 — Wardrobe Engine Rewrite

ROOT CAUSE FOUND
================
The uploaded 14.2 package had a major cache/version mismatch:
index.html loaded:
  ai-studio.js?v=13.3-identity-lock
while the service worker precached:
  ai-studio.js?v=14.2-clean-wardrobe-flow

That means Safari/PWA could keep executing an older AI Studio script even after
the file itself had been changed. This is consistent with the old blue skin
overlay and old status behavior continuing to appear.

ENGINE REWRITE
==============
Wardrobe editing is now a separate engine: wardrobe-engine.js.

For "Cambiar ropa":
1. Wardrobe Engine owns the task from button press to returned image.
2. Local segmentSkin / segmentPerson / segmentFace are not part of this path.
3. No client-side person, skin, clothing or identity mask is attached to the request.
4. PHOTO IA sends:
   - original visible image
   - user prompt
   - mode=change_clothes
   - profile/task=wardrobe_only
   - server_semantic_parser=true
   - client_masks_authoritative=false
5. Alienware owns semantic segmentation and wardrobe region generation.
6. PHOTO IA receives the final image and displays it directly.
7. Local segmentation is suspended while Wardrobe Engine is active so a late
   asynchronous segmentation result cannot redraw the blue overlay.

CACHE FIX
=========
- New PWA cache: photo-ia-15-0-wardrobe-engine
- Service worker VERSION: 15.0
- index.html and service worker use the same v15.0 URLs.
- wardrobe-engine.js is precached.
- ai-studio.js no longer uses the stale v13.3 query string.

IMPORTANT
=========
This package intentionally does NOT change the Alienware server.
First validate that PHOTO IA 15.0:
- shows no blue skin/person overlay when Cambiar ropa runs
- shows no old "Piel listo" wardrobe status
- sends the request directly to Alienware

If the returned clothing is still incomplete after this clean client flow,
the remaining problem is in the server/ComfyUI generation workflow, not in
PHOTO IA's local segmentation path.
