# PHOTO IA 15.35.4 — Garment shadow refinement

- Add a small target-colored floor in output linear light for pure black and deep textile shadows. The lift decays exponentially before midtones, preserving shadow ordering, folds and texture without brightening white-dye shadows excessively.
- Reduce contrast-only protection where neighboring colors suggest textile shading. Narrow or curved dark components can recolor; compact solid silhouettes and elongated details with distinct color/material evidence retain protection.
- Keep existing bilinear neckline/mask feathering without expanding the selection into skin. Keep the 15.35.2 cropped-selfie mask logic and hair, skin and wardrobe algorithms unchanged.
- Bump app/asset/worker/manifest versions and service-worker cache to 15.35.4.

Validation: `node tests/garment-recolor.test.cjs` covers black seams, curved collar shadows, tapered folds, shadow hue and brightness bounds, monotonic shading, neutral targets, midtone stability, radio/pen/badge protection, unchanged mask pixels and crop-edge coverage. Syntax, manifest and unchanged mask/tool logic checks also pass.

Limitations: these are local appearance heuristics, not accessory recognition. A thin black accessory with no distinct material cues can resemble a seam; compact hard-edged fabric regions can resemble an object. Real-photo/iPhone visual validation remains outstanding.
