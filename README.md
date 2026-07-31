# PHOTO IA 2.0

Editor de fotos personal y privado, optimizado para teléfonos.

## Funciona ahora
- Abrir foto o cámara
- One Click Magic
- Presets profesional, retrato, vibrante y blanco y negro
- Brillo, contraste, saturación, temperatura, nitidez y desenfoque
- Rotar, espejo y recorte cuadrado
- Deshacer, rehacer y comparación antes/después
- Comandos sencillos escritos en español
- Exportación JPG, PNG y WebP
- PWA y funcionamiento offline

## Arquitectura preparada
Incluye las pantallas y flujos para Outfit Studio, Hair Studio, Face Studio, Fun Swap, Background Studio y Magic Repair. Estas transformaciones necesitan conectar posteriormente un motor de IA generativa; no se simulan ni se envían fotos a un servidor en esta versión.


## 2.0.2
- Corrige congelamiento en iPhone al aplicar blanco y negro.
- Reduce la resolución de vista previa para mantener la app fluida.
- Blanco y negro ya no ejecuta el filtro de nitidez pesado.


## 2.1.1
- Los botones rápidos llaman directamente a su filtro, sin pasar por el intérprete.
- Limpieza automática de cachés anteriores.
- Service Worker configurado para no servir código viejo.
- La versión 2.1.1 aparece visible en el pie de la app.
