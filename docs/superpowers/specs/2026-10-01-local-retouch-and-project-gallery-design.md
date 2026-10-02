# PHOTO IA: pincel local, corrector/clonar y galería

Estado: diseño escrito aprobado por el usuario. Plan de implementación preparado para revisión; ejecución directa conservada. No se han modificado archivos de producto ni instalado dependencias. Base: PHOTO IA 15.41.0, commit aa077a4.

## Objetivo

Añadir las tres funciones recomendadas y aceptadas: corregir luz/color en zonas pintadas, reparar detalles mediante corrector/clonar y conservar varios proyectos editables. El flujo principal sigue siendo móvil, privado y local. Se conservan original, capas, máscaras, historial y resolución efectiva; los paneles reservan espacio para ver la fotografía completa.

No se incluyen todavía desenfoque de fondo, perspectiva, edición por lotes ni nuevas variantes del botón Smart. No se añade un servidor, cuenta, suscripción ni servicio externo. No hacer commit ni push sin una nueva petición del usuario.

## Enfoque elegido

Extender Canvas/Fabric e IndexedDB existentes. Las herramientas nuevas registran recetas locales reproducibles y la galería guarda proyectos independientes por ID.

Alternativas consideradas:

- Guardar cada retoque como una imagen reducida: simplifica la implementación, pero pierde resolución y aumenta el almacenamiento. Se conserva como comportamiento de las herramientas raster antiguas, no como base de las nuevas.
- Enviar los retoques a Alienware: permitiría reparaciones generativas complejas, pero exige conexión y no aporta precisión inmediata al pincel. El AI Fill existente conserva ese papel.

La implementación se divide en un motor de pincel compartido, dos modos de retoque y una galería. El motor y el modelo de proyecto son sus únicos puntos compartidos; la interfaz de cada función permanece separada.

## 1. Pincel de luz y color

Acceso desde Ajustes, con una tarjeta «Pincel local». Controles de tamaño, suavidad e intensidad; ajustes de exposición, temperatura y saturación. Modos Pintar y Borrar zona, interruptor Mostrar zona y botones Aplicar/Cancelar.

El usuario pinta una máscara y ajusta el efecto sobre esa zona. Cambiar un control recalcula desde la base de la sesión, evitando acumulaciones accidentales. La máscara puede limitarse a la selección IA actual mediante una opción explícita; sin esa opción solo manda el pincel.

- Cursor circular y trazo interpolado para evitar puntos separados al mover rápido el dedo.
- Coordenadas y radio en unidades normalizadas de la foto, usando la inversa de la transformación Fabric. Giro, reflejo y tamaño de pantalla no alteran el lugar pintado.
- La transparencia de la foto se conserva; los píxeles fuera de la máscara quedan intactos.
- Exposición y temperatura modifican los píxeles originales de la sesión; saturación conserva luminancia y se limita a valores válidos.
- Aplicar registra una operación con parámetros, trazos y, cuando proceda, referencia a la selección congelada como recurso. Exportar reproduce esa operación a la resolución disponible del documento.
- Cancelar, cambiar de proyecto o cerrar el panel sin aplicar descarta la sesión temporal. Las vistas previas no se guardan en la galería.

## 2. Corrector y clonar

Acceso desde Limpiar, con modos «Corrector» y «Clonar». Comparten tamaño, suavidad e intensidad con el motor de pincel.

Flujo táctil: pulsar «Elegir origen», tocar una zona limpia y pintar sobre el defecto. La muestra se indica con una cruz; se puede volver a elegir. El desplazamiento origen/destino se mantiene durante el trazo. No requiere teclado ni gesto Alt.

Clonar copia textura y color de la muestra. Corrector adapta la luminosidad y el color de baja frecuencia de esa muestra al destino y mezcla el borde suavemente. Está orientado a manchas y detalles pequeños; las reconstrucciones grandes continúan usando AI Fill.

La fuente de muestreo se congela al comenzar cada sesión: pintar cerca del origen no produce retroalimentación ni manchas arrastradas. Las muestras se recortan a los límites de la foto; nunca se rellenan zonas fuera del origen con negro. Los modos preservan alfa y permiten borrar trazos temporales antes de aplicar.

La operación almacena trazos, desplazamientos de muestra, modo y parámetros, para reproducirlos sin llamadas externas. Un Aplicar corresponde a un paso del historial; Deshacer/Rehacer recuperan el resultado completo. El renderer usa exactamente el mismo algoritmo de mezcla para preview y exportación, con radios escalados al tamaño de render.

## 3. Galería de proyectos

Acceso «Mis proyectos» desde Inicio y desde el menú de proyecto. Tarjetas con miniatura, nombre, dimensiones y fecha de modificación. Acciones: Abrir, Renombrar y Eliminar; la eliminación exige confirmación dentro de la interfaz. Un botón «Nueva fotografía» usa la importación existente.

Cada fotografía importada crea un proyecto independiente. Abrir otra fotografía deja de sustituir el único proyecto guardado. No se eliminan proyectos antiguos automáticamente para liberar espacio.

Antes de cambiar de proyecto, se termina el guardado de los cambios confirmados. Si falla, el proyecto actual permanece abierto y se ofrece reintentar o exportar; no se anuncia un guardado correcto. Los resultados de trabajos que pertenecen a otro proyecto o a otra apertura del mismo proyecto se descartan mediante un identificador de sesión además del ID/revisión.

### Persistencia y migración

- IndexedDB pasa a versión 2 y añade un catálogo `projects`, indexado por ID y fecha. Cada entrada contiene nombre, dimensiones, miniatura Blob y referencia a la sesión completa guardada.
- La migración convierte el último proyecto de versión 1 en la primera entrada de la galería. Conserva sus recursos, historial y referencia de recuperación. Si la transacción aborta, la base anterior permanece intacta.
- Guardar un proyecto publica sus recursos, sesión y catálogo en una transacción. No borra sesiones de otros proyectos.
- El puntero al último proyecto abierto cambia por una acción de navegación válida; una escritura atrasada de otro proyecto no lo modifica.
- La limpieza de recursos considera todos los proyectos y sus historiales, no solo el activo. Eliminar un proyecto libera únicamente recursos que ya no estén referenciados.
- Las miniaturas se generan a tamaño reducido desde una revisión confirmada. Si falla su generación, se conserva la anterior o se usa una tarjeta neutra; no se pierde el proyecto.
- Se mantiene el mensaje de que el almacenamiento local no sustituye una copia descargada. Ante cuota llena se conserva la última versión íntegra y no se eliminan otras fotos automáticamente.

## Integración

- Motor puro de píxeles: un nuevo módulo para máscara de pincel, exposición/color, clonación y corrección de tono. Sin dependencia del DOM para permitir pruebas numéricas.
- Controlador de interacción: un nuevo módulo que usa los eventos Fabric y los modos existentes. Al activar un pincel se desactivan dibujo, máscaras y AI Fill para evitar manejadores simultáneos.
- `photo-operation-adapters.js`: handlers de las dos recetas; no altera los algoritmos de ropa, cabello, piel ni Wardrobe.
- `photo-project.js`: sesión temporal de retoque, resolución de recursos, validación de trabajos asíncronos y navegación entre proyectos. Los filtros previos se materializan en el orden correcto una sola vez al confirmar el retoque.
- `project-store.js`: catálogo, migración, guardado por proyecto, renombrado, borrado y limpieza compartida.
- `ui-layout.js`, `index.html` y `styles.css`: paneles y galería integrados en la interfaz Studio, controles táctiles y estados vacíos/cargando/error.
- Versión prevista 15.42.0: scripts, manifest y service worker se actualizan juntos y se incluyen todos los módulos nuevos en la caché.

El proyecto original sigue siendo inmutable. Ninguna herramienta nueva modifica archivos del usuario fuera del almacenamiento de la app.

## Verificación y aceptación

1. Pintar una zona cambia solo sus píxeles; borrar la zona y cancelar no deja cambios confirmados.
2. El trazo coincide con el dedo tras giro, reflejo y cambios entre móvil vertical/horizontal y escritorio.
3. Una edición de luz seguida de clonar y Smart conserva los tres efectos. Deshacer/Rehacer restaura cada confirmación.
4. Clonar reproduce una muestra conocida; el corrector conserva detalle y reduce una diferencia de tono en un fixture controlado. No aparecen bordes negros al muestrear cerca de los límites.
5. PNG mantiene transparencia. Los retoques nuevos exportan a la resolución disponible sin reducir silenciosamente un original de 4032 × 3024.
6. Dos proyectos con fotos, capas y máscaras distintas sobreviven a recargar y a alternar entre ellos. Renombrar uno no modifica el otro.
7. Una base real de versión 1 migra y recupera el proyecto existente. Pruebas de aborto, cuota llena y recursos compartidos verifican que no se pierden otros proyectos.
8. Un resultado de retoque o miniatura de una sesión anterior no sobrescribe una foto nueva, ni una reapertura del mismo proyecto.
9. Galería y paneles funcionan a 320 × 740, 390 × 844, 844 × 390 y 1440 × 1000, en claro y oscuro, sin cubrir la foto con controles.
10. Pasan las pruebas existentes de ropa, Smart, capas, máscaras, exportación y recuperación. Se informa por separado si no se dispone de iPhone físico.

## Entrega

Primero migración/galería, después motor compartido y pincel local, y finalmente corrector/clonar e integración. Una revisión independiente comprueba persistencia, coordenadas y resultados asíncronos. Se entrega resumen del diff y pruebas; commit/push quedan sujetos a una petición posterior.
