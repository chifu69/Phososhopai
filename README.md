# PHOTO IA 15.37.0 — Interfaz Studio

Interfaz grafito con iconos SVG, etiquetas visibles y navegación inferior en móvil. Conserva el tema claro elegido y las herramientas existentes.

Consulta `CHANGELOG-15.37.0.md`.

## Antecedentes: PHOTO IA 15.36.0 — Mejora automática

Analiza la fotografía o aplica directamente la mejora automática de luz, sombras y color. Receta adaptativa con límites para retratos, modo compatible y protección al cambiar de foto durante el proceso.

Consulta `CHANGELOG-15.36.0.md`. Pruebas: `node tests/smart-enhance.test.cjs` y `node tests/garment-recolor.test.cjs`.

## Antecedentes: PHOTO IA 15.35.5 — Garment Detail Refinement

Color de ropa tiñe también las costuras y sombras profundas, con una elevación controlada del negro. Conserva luces, sombras y textura, con protección local para objetos de bolsillo. Se mantiene la cobertura de selfies recortadas de 15.35.2.

Consulta `CHANGELOG-15.35.5.md`. Pruebas locales: `node tests/garment-recolor.test.cjs`.

## Antecedentes: 15.35.2 — Clothing Mask Crop Fix

Esta versión parte de PHOTO IA 15.35.1 y corrige el corte horizontal de **Camisa / Top** visto en selfies y fotos recortadas.

## Color de ropa / Camisa
- Si la misma máscara de ropa continúa de forma ancha y centrada hasta el borde inferior de la foto, PHOTO IA ahora conserva esa continuación en lugar de cortar siempre cerca de la cadera o en el 56% de la máscara.
- Si las rodillas/tobillos sí son visibles, se mantiene el límite anatómico para no convertir el pantalón en parte de la camisa.
- El fallback local también detecta cuándo la prenda se estrecha o se separa como piernas y evita extender la camisa hasta abajo.

## Conservado de 15.35.1
- Hotfix de selección y color de cabello.
- Vestido de una sola pieza.
- Tono de piel natural.
- Smart, retoque corporal y herramientas creativas sin cambios funcionales intencionales.

## Caché PWA
La versión actual y la caché son 15.36.0 para que Safari/iPhone cargue los scripts actualizados.

Consulta `CHANGELOG-15.35.2.md` para el detalle técnico.
