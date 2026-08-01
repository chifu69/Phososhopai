# PHOTO IA 7.1 — Brain Core

Incluye comandos encadenados, memoria del último objeto, selección por nombre de objeto y macros guardadas localmente.

Ejemplos:
- `Cuadro rojo sin relleno, luego texto “Oferta” arriba`
- `Selecciona el círculo y luego hazlo más grande`
- `Guarda macro oferta: cuadro rojo sin relleno; texto “Oferta” amarillo arriba`
- `Aplica macro oferta`


## 7.1.1 Color Engine
- Recognizes masculine, feminine, singular, plural, and English color words.
- Applies detected colors consistently to arrows, lines, shapes, text, fill, and outline.

## 7.2.0 — Vision Engine 0.1

- Detección local de personas, animales, vehículos y objetos comunes con TensorFlow.js + COCO-SSD.
- Detección de rostros cuando el navegador ofrece FaceDetector.
- Recuadros seleccionables sobre el lienzo.
- Panel con conteos por tipo de objeto.
- Comandos: “analiza la foto”, “selecciona la persona”, “oculta las detecciones”, “muestra las detecciones”.
- Las detecciones no aparecen en la imagen exportada.
- La primera carga del modelo necesita internet; el Service Worker intenta conservar los recursos para usos posteriores.
