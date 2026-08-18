# PHOTO IA 15.15 — Worker + Official MediaPipe Bundle

Cambios principales:
- Worker sigue aislando toda inferencia pesada del hilo principal.
- MediaPipe Tasks Vision usa el bundle ESM oficial `vision_bundle.mjs`, versión 1.0.1.
- WASM usa exactamente la misma versión 1.0.1.
- Se eliminó el import `+esm` que produjo `Importing a module script failed`.
- Diagnóstico ahora separa: módulo ESM, WASM, Selfie model, Face model y modelo multiclase.
- La imagen de análisis sigue limitada a 256×256 aprox. en teléfono.
- Selfie Segmentation y Face Landmarker siguen secuenciales, no paralelos.

Nota:
Los binarios de MediaPipe/modelos se cargan desde las URLs oficiales/pinneadas al iniciar el Worker. La interfaz permanece aislada y el Worker se puede terminar si una inferencia no responde.
