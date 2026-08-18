# PHOTO IA 15.21 — Confidence Selfie Bust + Stable Worker

- Ropa y Cabello NO se modificaron.
- Worker/MediaPipe/WASM permanecen como en 15.20.
- Selfie Segmentation para Persona/Busto ahora solicita confidence masks.
- Se usa la confianza suave de “person” para conservar hombros y bordes que se perdían al convertir todo a categoryMask binario.
- categoryMask queda como fallback.
- Busto usa esa máscara suave debajo de la mandíbula y amplía ligeramente la ventana a pecho superior.
- Diagnóstico añade:
  - origen de la máscara Selfie (CONFIDENCE/CATEGORY)
  - coverage %
  - bounds reales de la silueta
  - índice/labels cuando estén disponibles
