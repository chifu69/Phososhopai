# PHOTO IA 15.38.1 — iPhone ONNX loader fix

## Corrección principal
- Corrige `no available backend found. ERR: [wasm] TypeError: Importing a module script failed` visto en Safari/iPhone al preparar Local AI Fill.
- ONNX Runtime Web sigue usando WASM en el teléfono, pero ahora resuelve explícitamente el par versionado `ort-wasm-simd-threaded.mjs` + `ort-wasm-simd-threaded.wasm` mediante URLs absolutas compatibles con ORT Web 1.23.0.
- Se fuerza `numThreads=1` y se desactiva el proxy worker para evitar dependencias innecesarias de workers/COOP-COEP en iOS.
- El service worker conserva también los recursos remotos de ORT por su URL original para reutilizarlos después de la primera descarga.

## Sin cambios funcionales
- MI-GAN continúa siendo el motor de AI Fill.
- Imagen y máscara se procesan localmente; no se envían a un servidor de inferencia.
- Curvas, Máscara, Wardrobe, Smart, Garment Recolor y herramientas previas permanecen sin cambios.
