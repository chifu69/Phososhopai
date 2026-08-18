# PHOTO IA 15.24 — Direct Person Bust + Semantic Skin

Cambios:
- Persona completa NO se modifica.
- Ropa NO se modifica.
- Cabello NO se modifica.
- Busto/ID:
  - usa directamente la máscara real de Persona completa;
  - Face Landmarker solo determina hasta dónde cortar verticalmente;
  - conserva cabeza, cuello, hombros y pecho superior con la silueta real;
  - elimina la geometría inventada de hombros.
- Piel:
  - usa directamente las clases semánticas de piel facial + piel corporal del modelo multiclase;
  - YCbCr deja de ser la autoridad principal;
  - ojos, cejas, cabello y ropa quedan fuera según las clases del modelo.
- Worker/MediaPipe/WASM/modelos permanecen intactos.
