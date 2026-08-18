# PHOTO IA 15.14 — Worker Isolated AI

Esta versión cambia la arquitectura de Selección IA para evitar congelamientos.

- MediaPipe para Persona, Busto/ID, Rostro, Piel, Cabello y Ropa corre dentro de `segmentation-worker.js`, fuera del hilo de interfaz.
- En teléfonos la imagen de análisis se reduce a 256 px en el lado mayor.
- Los modelos se ejecutan secuencialmente, nunca en paralelo.
- Busto/ID: Selfie Segmentation → Face Landmarker → región de cabeza/cuello/hombros.
- Piel: Selfie Segmentation → Face Landmarker → tono de piel aprendido de la cara.
- Rostro: Face Landmarker.
- Cabello/Ropa: segmentación multiclase.
- Si el worker se atasca, se termina el worker; la UI no debe congelarse.
- Primera inferencia: hasta 18 s para permitir carga del modelo. Inferencias siguientes: 6.5 s antes de reiniciar el worker.
- Se añadió “Diagnóstico motor” a Selección IA para ver Worker, MediaPipe, resolución y tiempos.
- En móvil, Objeto por toque usa temporalmente la selección local segura para evitar ejecutar Interactive Segmenter en el hilo principal.
