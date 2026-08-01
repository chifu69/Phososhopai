# PHOTO IA 7.3.2 — Segmentation Runtime Fix

Esta versión corrige el bloqueo indefinido de **Separar persona** y **Selección inteligente** en navegadores móviles.

## Cambios principales

- La inferencia de MediaPipe usa el resultado directo en lugar del callback que podía no ejecutarse en Safari/Chrome móvil.
- El overlay se alcanza a dibujar antes de iniciar el análisis pesado.
- Las máscaras usan sus dimensiones reales.
- Tiempo máximo ampliado para teléfonos más lentos.
- Caché del service worker renovada a 7.3.2.
- El botón Cancelar queda como protección; el objetivo principal es que la función termine correctamente.

## Prueba recomendada

1. Instala/publica todos los archivos de esta carpeta.
2. Cierra por completo la versión anterior.
3. Vuelve a abrir y, si está instalada como app, recárgala dos veces para reemplazar la caché anterior.
4. Abre una foto y prueba **Separar persona**.
5. Prueba **Tocar objeto**, toca cerca del centro del objeto y luego **Quitar fondo**.
