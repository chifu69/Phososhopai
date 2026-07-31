# PHOTO IA 4.0

Editor PWA privado con una base profesional:

- OpenCV.js para procesamiento de imagen local (CLAHE, color, blur, nitidez y escala de grises).
- Fabric.js para texto, capas y objetos editables.
- Cropper.js para recorte libre y relaciones de aspecto.
- Fallback de Canvas API cuando OpenCV no termina de cargar.

## Publicación
Sube **el contenido de esta carpeta** a la raíz de tu repositorio de GitHub Pages y reemplaza los archivos anteriores. Abajo debe aparecer la versión **4.0.0**.

La primera vez requiere conexión para descargar las bibliotecas externas. Después el Service Worker intenta conservarlas en caché. Las herramientas generativas (ropa, cabello, face swap y fondos generados) todavía requieren conectar un modelo o servicio de IA; la app no simula esas funciones.
