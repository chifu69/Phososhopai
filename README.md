# PHOTO IA 15.20 — True Selfie Bust + Stable Worker

- Ropa y Cabello NO se modificaron.
- Worker, MediaPipe, WASM y modelos se mantienen como en 15.19.
- Busto/ID:
  - Cabeza/rostro: Face Landmarker.
  - Desde mandíbula hacia abajo: la silueta real de Selfie Segmentation manda.
  - La ventana horizontal es deliberadamente amplia para no cortar hombros.
  - Se eliminó la forma geométrica de hombros como autoridad.
  - El borde inferior se desvanece suavemente; no debe aparecer una línea horizontal dura.
- El diagnóstico de motores se conserva.
