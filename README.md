# PHOTO IA 8.3 — Offline Segmentation Core

Esta versión elimina BodyPix del flujo de **Separar persona** para evitar fallos de CDN. La nueva máscara se calcula completamente en el teléfono con un motor local de recorte de retrato basado en contraste, bordes y componentes conectados.

## Cambios

- No descarga BodyPix ni modelos de segmentación.
- No depende de `unpkg.com` para separar personas.
- El botón **Separar persona** termina y produce una máscara local.
- **Tocar objeto** continúa como alternativa para fondos difíciles.
- **Quitar fondo**, mostrar/ocultar máscara y cancelar siguen funcionando.
- Caché renovada a 8.3.
- Conserva AI Studio y el Windows AI Bridge 8.2.

## Importante

El recorte local es una alternativa ligera, no un modelo generativo. En fotos donde la ropa y el fondo tengan colores muy parecidos puede ser menos preciso; en esos casos use **Tocar objeto** o, cuando el servidor Alienware esté activo, el flujo avanzado de ComfyUI.

## Publicación

Suba los archivos principales a GitHub Pages. La carpeta `windows-server` se copia únicamente al Alienware. Después de publicar, cierre la PWA y vuelva a abrirla para renovar la caché.
