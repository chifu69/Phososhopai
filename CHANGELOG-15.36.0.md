# PHOTO IA 15.36.0 — Adaptive automatic enhancement

- Enable automatic enhancement immediately after loading a photo; analysis remains available separately.
- Replace the very small exposure correction with bounded, histogram-driven exposure, shadow, highlight and contrast adjustments. Keep balanced photos subtle and portrait clarity at zero.
- Share a highlight-preserving tone function between the OpenCV and compatible paths. OpenCV uses Lab lightness and retains regional processing; the compatible path uses RGB channels, so results are not pixel-identical.
- Avoid automatic gray-world color balancing for the new recipe, which could neutralize intentional scene colors. Limit fallback vibrance on likely skin.
- Fall back when OpenCV initialization/enhancement fails; shorten analysis startup waiting.
- Ignore stale analysis/results after a photo change and serialize Apply clicks. Repeat application always starts from the original, without accumulating filters.
- Route fallback image replacement through the standard guarded replacement API, preserving displayed dimensions when processing downsizes a large photo.
- Keep clothing, hair, skin-retouch and wardrobe algorithms unchanged. Update app/cache URLs to 15.36.0.

Validation: synthetic adaptive tone/portrait/highlight tests, monotonicity, engine failure, duplicate clicks, stale-image guards, all garment regressions, JS/HTML-script syntax, manifest/cache checks. Real-photo visual assessment and iPhone testing are still needed. The tool cannot reconstruct clipped detail or genuinely out-of-focus information. Both existing engines process at up to 1800 px.
