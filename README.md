# PHOTO IA 7.3.3 — iPhone Segmentation Runtime Fix

Correcciones principales:
- Cambia “Separar persona” al modelo SelfieSegmenter ligero y optimizado para móviles.
- En iPhone/iPad usa CPU para evitar bloqueos del delegate WebGL/GPU.
- Reduce la copia de trabajo en móviles para terminar la inferencia con menos memoria.
- Bloquea completamente el desplazamiento de la página mientras aparece el proceso.
- Evita que una operación cancelada cierre o altere una operación nueva.
- Renueva la caché del service worker a 7.3.3.

Instalación: reemplaza todos los archivos, cierra la app instalada y vuelve a abrirla. Si conserva la versión anterior, elimina la app de inicio y agrégala de nuevo para limpiar el service worker.
