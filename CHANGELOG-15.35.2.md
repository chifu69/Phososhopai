# PHOTO IA 15.35.2 — Clothing Mask Crop Fix

Base: PHOTO IA 15.35.1 Hair Selection Hotfix.

## Fixed
- Camisa / Top no longer stops at a hard hip/quantile line in cropped selfies when the same clothing mask continues to the bottom edge.
- The Pose path now checks whether knees/ankles are truly visible before extending the upper garment.
- The deterministic clothing fallback now follows broad, center-connected clothing rows to the crop edge instead of always cutting at the 56% clothing quantile.
- Full-body protection remains: when lower-body landmarks are visible or the clothing shape narrows/separates like legs, the upper mask keeps the anatomical cutoff.
- Garment mask validation now accepts a crop-edge upper garment only when the lower body is not visible and both clothing + selected garment reach the lower frame edge.
- PWA/cache version bumped to 15.35.2 so iPhone does not keep the old 15.35.1 segmentation worker.

## Intended result
For chest/waist-up photos where one shirt continues to the bottom of the image, Color de ropa > Camisa / Top should recolor the complete visible shirt instead of leaving a straight unedited band at the bottom.
