# PHOTO IA 5.0

Arquitectura reconstruida para evitar el lienzo vacío:

- Fabric.js controla el lienzo visible y las capas.
- La cámara y la galería cargan primero la foto con `Image.decode()` y luego la convierten a un lienzo seguro antes de entregarla a Fabric.
- OpenCV.js se carga como motor opcional; la app no espera a OpenCV para mostrar la fotografía.
- Cropper.js se usa únicamente dentro del modal de recorte.
- Los ajustes principales funcionan con filtros Fabric en tiempo real.

## Publicar en GitHub Pages

Sube el contenido de esta carpeta directamente a la raíz del repositorio. Reemplaza los archivos anteriores. Cuando GitHub termine de publicar, abre el sitio con `?v=500` al final de la dirección.

La parte inferior debe mostrar `5.0.0`.
