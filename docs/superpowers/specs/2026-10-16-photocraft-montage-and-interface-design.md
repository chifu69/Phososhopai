# PHOTO IA — montaje de cabeza/cuerpo e interfaz PhotoCraft

Estado: diseño aprobado e implementado en Estudio 0.2; validación Safari física pendiente.

## Petición confirmada

Combinar fotografías propias para colocar la cabeza de una persona sobre otro cuerpo. Priorizar iPhone/navegador, usar la mayor parte posible del motor PhotoCraft y acercar la interfaz a PhotoCraft. «Photocad» se interpreta como PhotoCraft, el repositorio seleccionado en esta conversación. El usuario eligió fotos propias: no se añade generación de personas ni servicio generativo.

## Base y alcance

Continuar sobre `/next/` y el puente real Rust/Wasm del commit PHOTO IA `0697235`. La app estable y sus proyectos permanecen disponibles. Este trabajo sustituye la prioridad de migrar primero otras herramientas IA: primero un flujo de fotomontaje utilizable, sobre la arquitectura ya definida.

Dos vías consideradas: crear un asistente de montaje con tarjetas sobre la interfaz actual, o ampliar el editor por capas y darle organización PhotoCraft. Se recomienda ampliar el editor: el montaje es una herramienta del mismo documento, no otro editor con un historial separado.

## Flujo de montaje

1. **Foto del cuerpo:** abrir la foto destino; conserva su fondo y cuerpo.
2. **Foto de la cabeza:** añadir una segunda fotografía. Se prepara una selección de cabeza en una vista de esa fuente, sin sustituir el documento destino.
3. **Recortar cabeza:** empezar con selección ovalada ajustable; permitir un contorno por puntos para cabello/cuello y un control de suavidad de borde. Mostrar qué zona se conserva. No describir este recorte manual como detección IA automática.
4. **Colocar:** previsualizar la cabeza como capa independiente sobre el cuerpo. Arrastrar, escalar, girar y reflejar; controles numéricos/táctiles complementan los gestos. Zoom/paneo del lienzo queda separado de transformar la capa.
5. **Integrar:** ajustar opacidad, exposición y temperatura de la capa insertada. Ofrecer edición de máscara con recuperar/ocultar para afinar pelo y cuello, preservando píxeles originales.
6. **Aplicar:** confirmar una acción deshacible para la inserción inicial; posteriores transformaciones o ajustes generan pasos propios, uno por gesto confirmado. Cancelar preparación elimina solamente el estado temporal.

Para poner un cuerpo distinto a una cabeza existente se elige ese cuerpo como destino y la foto de la cabeza como fuente. No se promete reconstrucción anatómica, cambio de pose ni integración perfecta cuando perspectiva e iluminación difieren. La herramienta permite corregir el montaje manualmente.

## Reutilización real de PhotoCraft

PhotoCraft será responsable del documento, capas, máscaras, selección, transformaciones, composición, ajustes, historial y formato de proyecto. La interfaz JavaScript administrará controles táctiles, lectura de archivos y mensajes al Worker. No se crea otro modelo Fabric ni un motor de mezcla paralelo.

El código revisado ofrece `select.rect` con opción ellipse/feather, máscaras de capa, `edit.transform`, selección de capa y comandos de ajuste. El puente ampliará una lista de acciones permitidas; las firmas concretas se fijarán con pruebas contra el commit upstream utilizado. Importar bytes en memoria y agrupar inserción/máscara/posición en una acción requieren trabajo del adaptador; no se asume que exponer un nombre de comando complete esa integración.

La vista previa operará sobre un estado candidato basado en la revisión confirmada. Ni mover sliders ni arrastrar añadirá una acción por evento. Capturar época/documento/revisión/capa objetivo al empezar; rechazar resultados atrasados tras abrir otra foto, cambiar capa o cancelar. Guardado y exportación usan únicamente el documento confirmado.

Las coordenadas de selección pertenecen a la foto fuente; las transformaciones de colocación pertenecen al documento destino. El zoom del navegador/lienzo nunca modifica la geometría exportada. Cambios repetidos de escala deben partir de la fuente conservada, evitando degradación acumulativa por remuestreo.

## Interfaz PhotoCraft adaptada

Usar como referencia el tema Pro/ProMedium y su organización: superficies grises carbón, paneles planos, acento azul, bordes discretos y radios pequeños. Mantener nombre PHOTO IA y no copiar marcas ArtCraft.

- Barra superior compacta: Archivo, Editar, Capa y Selección; únicamente acciones implementadas.
- Columna lateral de herramientas: mover/transformar, seleccionar/recortar, máscara y montaje. Iconos con etiqueta accesible, ayuda y objetivo táctil de al menos 44 px.
- Barra contextual para la herramienta activa: tamaño/giro/feather/opacidad según corresponda; Aplicar/Cancelar visibles.
- Capas con miniatura, nombre, visibilidad, máscara y selección inequívoca; permitir ordenarlas y eliminar la capa insertada con undo.
- En escritorio, propiedades/capas a la derecha; en iPhone, panel plegable que reserva espacio y reajusta la foto, sin tapar su zona visible. No comprimir una barra de escritorio a iconos diminutos.
- Vista inicial orientada a Abrir foto y Montar cabeza/cuerpo; el nombre de la capa activa aparece junto a los ajustes.

## Persistencia y memoria

El proyecto guarda capas y máscaras editables, incluyendo la fuente insertada, con el mecanismo aislado existente. Descargar original conserva los bytes de la foto base; el proyecto contiene la segunda imagen. No prometer conservar todo el historial entre recargas.

Dos imágenes grandes pueden superar el presupuesto móvil: validar antes de decodificar, estimar buffers simultáneos y usar preview acotado. Si no caben, ofrecer una copia de trabajo reducida explícita o cancelar; no reducir silenciosamente los originales. No aumentar el límite actual de 24 MP por foto como solución a presión de memoria. El pico previo observado fue ~384 MiB de memoria lineal Wasm para una prueba de 12 MP: la integración de dos fotos necesita medición adicional.

Fallo de importación, memoria o guardado conserva el documento confirmado anterior. Mantener rollback de almacenamiento, protección frente a resultados obsoletos y disponibilidad de la app estable.

## Criterios de aceptación

- Combinar dos fixtures distintas y comprobar por píxeles que la cabeza/fuente se coloca sobre el cuerpo/destino; las zonas ajenas al montaje se conservan.
- Máscara oval/poligonal y feather sin halos negros; alfa correcto y recuperación de zonas ocultas.
- Mover, escalar, girar y reflejar con preview y exportación coincidentes. Validar zoom, desplazamiento del lienzo y cambio de orientación del teléfono.
- Cancelar deja revisión, capas y píxeles originales sin cambios. Deshacer/rehacer restaura exactamente la colocación confirmada.
- Reabrir conserva ambas capas, fuentes y máscara; exportación mantiene dimensiones de destino y no incluye controles de edición.
- Selección explícita de capa: los ajustes no actúan sobre una capa distinta de la indicada.
- Fotografías inválidas, montaje cancelado durante procesamiento, falta de cuota y segunda imagen excesiva no destruyen la primera.
- UI a 320×740, 390×844, 844×390 y escritorio; todas las acciones táctiles accesibles y fotografía sin paneles encima.
- Ejecutar regresiones del puente, protocolo, proyectos y PHOTO IA estable. Validación Safari en iPhone físico sigue siendo necesaria antes de reemplazar producción.

## No incluido

Generación de cuerpos, intercambio facial automático con reconocimiento de identidad, garantías de montaje fotorrealista para cualquier par de fotos, publicación/App Store y migración completa de herramientas IA antiguas. El usuario autorizó expresamente el commit y push al terminar esta entrega.
