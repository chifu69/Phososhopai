# PHOTO IA 15.22 — Landmark Head Contour + Stable Worker

- Ropa y Cabello NO se modificaron.
- Worker/MediaPipe/WASM/modelos permanecen como en 15.21.
- Busto/ID:
  - Mantiene intacta la lógica de cuello, hombros y pecho de 15.21.
  - La parte superior ya no usa una elipse redonda.
  - Usa el convex hull de los landmarks faciales con una expansión conservadora de sienes/frente.
  - La máscara Selfie solo suaviza el borde superior cuando el modelo dice claramente “no person”.
- Objetivo: contorno de cabeza más natural sin tragarse gorra/fondo.
