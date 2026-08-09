PHOTO IA 13.4.1 — SELECTION IA iPHONE HOTFIX

Corrección principal:
- Busto / identificación ya no intenta cargar MediaPipe/WASM/modelos opcionales antes de trabajar.
- Evita el spinner/congelamiento visto en iPhone cuando los folders assets no están presentes en GitHub Pages.
- Persona completa, Busto/identificación, Solo rostro y Solo piel usan el motor local compatible como ruta estable.
- Objeto por toque también usa el motor local de color/bordes para no depender de archivos opcionales.
- Se conserva la lógica distinta de máscaras introducida en 13.4.
- Cache actualizado a 13.4.1 para forzar que Safari deje de usar segmentation.js 13.4.

IMPORTANTE:
Sube los archivos de la raíz. No se requieren folders vacíos para este hotfix. Cierra PHOTO IA completamente y vuelve a abrirla después del deploy.
