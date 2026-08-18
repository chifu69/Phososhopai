# PHOTO IA 15.13 — Landmarker + Selfie Pipeline

- Piel aprende el tono de piel de la cara de la persona en la foto.
- Busto / identificación usa geometría del rostro para crear cabeza + cuello + hombros.
- En iPhone se mantiene la ruta local para evitar congelamientos.
- MediaPipe y ONNX siguen integrados para expansión futura.
- Solo queda un README.

## 15.13 selection pipeline
For Piel, Rostro preciso and Busto/ID the preferred path is now: MediaPipe Face Landmarker (0.40 detection/presence confidence) -> MediaPipe Selfie/Person Segmentation -> mode-specific geometry -> adaptive skin/local semantic refinement. FaceDetector/color/person-bounds remain fallbacks only. The UI watchdog still cancels stalled mobile inference.
