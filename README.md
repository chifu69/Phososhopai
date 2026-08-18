# PHOTO IA 15.17.1 — Landmark ID Routing Fix

- Mantiene intacto el Worker clásico estable de 15.16.
- Corrige un error en 15.17: el helper nuevo de ID existía, pero la ruta `bust` todavía llamaba al generador viejo.
- `Busto / identificación` ahora usa realmente los landmarks de Face Landmarker para construir cabeza + cuello + hombros.
- Selfie Segmentation solo recorta/apoya la parte inferior de la máscara.
- No se cambian WASM, modelos ni arquitectura del Worker.
