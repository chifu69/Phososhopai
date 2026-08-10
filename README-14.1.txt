PHOTO IA 14.1 — Alienware Wardrobe ROI Fix

Cambio principal:
- Cambiar ropa YA NO ejecuta segmentación de persona/piel/ropa en el iPhone.
- Envía la fotografía original completa al Alienware.
- No envía mask ni identity_mask para wardrobe_only.
- Alienware Semantic Parser queda como autoridad para localizar ropa/anatomía.
- PHOTO IA ya no recompone el resultado usando su máscara local; esa recomposición podía restaurar la ropa vieja y borrar el cambio de FLUX.
- Se agregan server_semantic_parser=true y client_masks_authoritative=false para wardrobe_only.

Background-only conserva el flujo anterior. Scene+wardrobe se mantiene separado por ahora.
