PHOTO IA 13.9 — Layered Identity Guard

Actualización basada en la lógica de edición por capas estudiada en la extensión Adobe Crema.

Cambios principales:
- La foto original de resolución completa se conserva como capa base protegida.
- Cambio de ropa: la generación se acepta solo dentro de la máscara de persona; el fondo se restaura desde el original.
- Identity Guard multipaso: combina rostro + piel y expande los límites de cabeza/cabello para proteger identidad.
- Rostro, cabello, piel y manos se recomponen desde los píxeles originales después de FLUX.
- La adaptación de iluminación se limita para no suavizar ni reconstruir rasgos faciales.
- Cambio de fondo: la persona completa se recompone desde la fotografía original.
- Escenario + vestuario: fondo/ropa pueden cambiar, pero las regiones de identidad se restauran después.
- Service Worker y cache actualizados a 13.9 para evitar que iPhone siga mostrando 13.8.

Nota: el servidor/FLUX sigue generando la imagen, pero PHOTO IA 13.9 controla qué píxeles de esa generación tienen permiso de llegar al resultado final.
