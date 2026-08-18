# PHOTO IA 15.16 — Classic Worker MediaPipe Fix

- Cambia el worker de MediaPipe de `type: module` a Worker clásico.
- Motivo: MediaPipe Tasks usa `importScripts()` internamente; los module workers no lo permiten.
- El bundle ESM sigue cargándose con `import()` dentro del Worker clásico.
- MediaPipe 1.0.1: bundle y WASM alineados.
- Rutas locales virtuales se sirven mediante el service worker, con fallback CDN.
- Cache totalmente nuevo `photo-ia-15-16-classic-worker-mediapipe`.
- Los JS versionados usan network-first para evitar mezclar versiones anteriores.
- Diagnóstico muestra worker build/type, importScripts, módulo, WASM y modelos por separado.
