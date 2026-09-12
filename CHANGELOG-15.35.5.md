# PHOTO IA 15.35.5 — Garment detail refinement

- Detect compact object interiors across wider distances using two additional, bounded analysis scales. This protects softly blurred radio boundaries that lack an abrupt single-pixel contrast step.
- Propagate only confirmed compact object regions from the coarse passes, avoiding generic edge protection that would suppress fabric seams and folds.
- Let measurable shirt chromaticity outweigh rectangular shape when identifying a compact textile shadow. Retain conservative silhouette protection for ambiguous neutral-on-neutral objects.
- Preserve the shadow floor, crop-mask coverage, mask feathering, hair, skin and wardrobe logic.
- Bump app, assets, worker, manifest and service-worker cache to 15.35.5.

Validation: `node tests/garment-recolor.test.cjs` includes soft radio boundaries at multiple sampling offsets and compact same-tint textile shadows, alongside existing shading, object, seam, collar and coverage checks.

Limits: local heuristics cannot reliably distinguish an accessory with exactly the fabric's tint from fabric, or a neutral compact fabric shadow from a neutral object. Thin blurred accessories and boundaries beyond the sampled scales can still be missed. Real-photo and iPhone visual validation remains outstanding.
