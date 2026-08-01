# PHOTO IA 7.3.1 — Segmentation Stability Fix

Correcciones principales:

- Tiempo máximo de 25 segundos para cargar MediaPipe/modelos.
- Tiempo máximo de 20 segundos para cada segmentación.
- Botón Cancelar tanto en el panel como en la pantalla de procesamiento.
- La interfaz siempre se recupera después de un error o cancelación.
- Reintento automático con CPU cuando GPU falla.
- Imagen temporal reducida a 512 px en iPhone/iPad y 640 px en otros equipos.
- Mensajes específicos para red, memoria, GPU y timeout.
- MediaPipe fijado a @mediapipe/tasks-vision 0.10.35 para evitar cambios inesperados de `latest`.
- Caché actualizada a 7.3.1.

Sube todos los archivos directamente a la raíz del repositorio.
