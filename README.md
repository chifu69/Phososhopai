# PHOTO IA 15.32 — Core Stabilization

Base: PHOTO IA 15.31.2 Hair Palette Only.

## Stabilized in 15.32
- Hair and clothing recolor now moves both hue and luminance while preserving texture/shadows, so dark hair can actually become blonde/white and light hair can become dark.
- Hair, clothing and skin previews use a lighter preview raster plus sequence guards so Cancel cannot be overwritten by an older asynchronous preview.
- Local skin/hair/clothing retouch now preserves the existing Brightness/Contrast/Saturation/Temperature/Sharpness/Blur filter stack and keeps the sliders synchronized.
- Current-image analysis now reads the filtered/visible photo when a filtered raster is available.
- Processed and Alienware results replace only the photo layer and preserve text, stickers, shapes and drawings.
- Alienware sends a photo-only raster instead of accidentally flattening creative layers into the request.
- Alienware connection badge, test button ID, unexpected connection errors and progress timer cleanup fixed.
- One history owner for object modifications; duplicate Undo snapshots removed.
- History jump creates a real branch, and restored photo adjustments are rehydrated into the slider UI.
- Before/After is non-destructive and temporarily hides creative layers.
- Export is cropped to the photograph and targets the working photo resolution rather than 2× the small phone viewport.
- Viewport rotation/resizing keeps creative layers registered to the photograph.
- Rotate rotates the full composition, not only the photo.
- Reset restores the photo while preserving creative layers.
- Crop is blocked when editable layers exist instead of silently flattening/destroying them.
- Smart mode buttons now perform real local edits.
- Local-cache-first dependency routing with CDN fallback for Fabric, Cropper, TensorFlow, COCO-SSD and OpenCV. After a successful online local-core install, cached copies can be served through the PWA; first-run optional engines may still need Internet.
- Service-worker/build cache versioning aligned; stale cache deletion is limited to PHOTO IA caches.
- Missing JS/CSS resources now return an error instead of silently receiving index.html.
- Worker first-load timeout increased so model download/initialization is not killed prematurely.
- Person-mask diagnostics no longer blindly assume square output.
- PNG/WebP input is preserved in a non-JPEG working master when possible.
- PWA manifest and install icons refreshed for 15.32.

## Deliberate limitations
- PHOTO IA still uses a ~2000 px working master on mobile for memory safety. True non-destructive full-original-resolution replay/export requires a larger document-engine redesign and is not falsely claimed in this build.
- Heavy optional vision/segmentation runtimes and models are not physically bundled in this small ZIP. They are downloaded/cached when available, with graceful fallback when unavailable.
