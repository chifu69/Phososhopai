# PHOTO IA 15.39.0 — Smart Selection

## Nuevo
- pestaña **Selección IA** en Creative Studio
- selección local de Persona, Rostro, Cabello, Piel, Prenda superior, Prenda inferior, Vestido y Zapatos
- selección por toque de objeto desde el panel creativo
- acciones Mostrar/Ocultar, Refinar, Limpiar, Crear recorte y **Enviar a AI Fill**
- `PhotoAIFill.importMask()` para reutilizar máscaras de segmentación

## Cambios técnicos
- `segmentation.js` ahora emite eventos cuando cambia la máscara
- `smart-select.js` nuevo módulo de integración
- `sw.js`, `manifest.webmanifest`, `index.html`, `ui-layout.js` y `styles.css` actualizados a versión 15.39.0
