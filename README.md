# PHOTO IA 15.30 — Garment Color by Pose

Nuevo:
- 🎨 Color de ropa.
- Separación automática de 👕 Camisa/Top, 👖 Pantalón/Shorts y 👟 Zapatos.
- Pipeline: Selfie Multiclass (Ropa) → Pose Landmarker Lite → región anatómica → intersección con Ropa → limpieza de máscara.
- Pose Landmarker se carga solo al usar Color de ropa.
- Selector de color + intensidad + preview + Aplicar/Cancelar.
- El recoloreado conserva luminancia, sombras, pliegues y textura en vez de pintar plano.
- ☝️ Tocar prenda conserva el Interactive Segmenter actual como fallback/refinamiento.

Preservado:
- Piel y su slider 15.29.
- Persona completa, Busto/ID, Rostro, Cabello y Ropa existentes.
- Worker clásico y MediaPipe/WASM estables.
