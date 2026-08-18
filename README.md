# PHOTO IA 15.19 — Selfie-Authority Bust + Stable Worker

- Ropa y Cabello NO se modificaron.
- Mantiene Worker clásico, MediaPipe local, WASM local y modelos estables de 15.18.
- Busto/ID:
  - Face Landmarker manda en la cabeza/rostro.
  - Debajo de la mandíbula, Selfie Segmentation manda en cuello, hombros y pecho.
  - Se exige silueta real de persona en la parte inferior.
  - Se suaviza la unión mandíbula-cuello y el borde inferior.
- Diagnóstico:
  - Los tiempos se reinician al iniciar cada tarea.
  - Ya no debe aparecer un tiempo viejo de Multiclase después de ejecutar Busto.
