# PHOTO IA 15.35.3 — Natural garment recolor

- Replace compressed HSL lightness with linear-light shading relative to the garment's median luminance. Preserve folds, texture and shadow ordering, with a soft highlight shoulder and neutral black/white/gray dyes.
- Analyze the original photo at up to 600 px once per garment session. Protect small regions enclosed by hard contrast boundaries (including object interiors), abrupt details and their antialiased rims. Preview and full-resolution Apply share this protection map.
- Keep the semantic clothing mask and all 15.35.2 cropped-selfie coverage logic unchanged. Hair, skin and wardrobe algorithms are unchanged.
- Bump app, asset URLs, worker URLs, manifest and service-worker cache to 15.35.3.

Validation: `node tests/garment-recolor.test.cjs` checks shading/texture, neutral dyes, synthetic radio/pen/badge interiors, zero intensity, unmasked pixels and crop-edge recoloring. JavaScript syntax and unchanged crop/hair/skin code are checked separately.

Limitations: local contrast heuristics cannot identify every accessory. Similar-colored objects, blurred boundaries or objects merged into the fabric may still recolor; strongly contrasting prints or seams may be protected. Real-photo and iPhone visual validation remains necessary.
