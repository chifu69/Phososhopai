# Base profesional de PHOTO IA

Estado: diseño aprobado e implementado en la rama local `codex/professional-editor`. Sin commit ni push.

## Objetivo y alcance

Implementar las tres prioridades aceptadas: conservar la resolución de origen al exportar, recuperar la edición tras cerrar la app y aplicar ajustes sin eliminar trabajos anteriores. Se mantienen las herramientas existentes y la interfaz Studio. Esta fase no añade herramientas fotográficas ni servicios remotos.

## Hallazgos del repositorio

- `loadFile` de app.js reduce el archivo a 2000 px y guarda esa copia como original.
- Mejora automática y varios retoques procesan a un máximo de 1800 px.
- La exportación usa la escala del lienzo y un multiplicador limitado a 6.
- El historial conserva JSON de Fabric en memoria, sin persistencia del proyecto.
- Mejora automática, presets y recorte pueden reemplazar la base de otras ediciones.

## Decisión de diseño

Añadir un modelo de proyecto local, separado de la vista Fabric. Fabric sigue siendo el editor de capas y la vista previa; las medidas de pantalla no determinan ni los datos guardados ni la resolución de exportación.

Se descarta simplemente elevar los límites de 2000/1800 px: aumentaría el consumo de memoria y no resolvería la edición reversible. Tampoco se sustituye Fabric ni se cambia de framework.

### 1. Original y operaciones

Guardar el Blob original inmutable, tipo MIME, nombre, dimensiones orientadas y una revisión del proyecto. Crear una vista previa de tamaño limitado para interacción móvil. Normalizar la orientación al decodificar y mantener un único sistema de coordenadas de documento.

Representar cada edición confirmada como una operación con identificador, parámetros, revisión de entrada y estado habilitado. Separar previsualizar, confirmar y cancelar. Repetir una mejora modifica su propia operación cuando sigue siendo la última; no acumula el efecto ni borra operaciones ajenas. Si hay operaciones posteriores, una nueva confirmación se aplica al resultado actual.

Orden reproducible: archivo original → operaciones confirmadas en orden → capas editables → exportación. Los cambios de exposición, curvas, recorte, giro y reflejo conservarán parámetros. Las selecciones se guardarán en coordenadas normalizadas del documento. Los retoques que producen píxeles requieren una receta reproducible o un resultado intermedio asociado a su revisión de entrada. Deshacer restaura el proyecto completo, incluidos recorte, selecciones pertinentes y base de imagen.

Los resultados de IA externos se conservarán como recursos del proyecto; no se volverá a llamar al servicio al exportar. No se inventará detalle de alta resolución: una operación limitada por su modelo debe indicar la resolución efectiva y ofrecer exportar esa resolución o guardar el original por separado. Esta limitación será visible antes de confirmar o descargar.

### 2. Exportación independiente

Renderizar en un lienzo separado, a dimensiones del documento y sin modificar la selección, el tamaño ni la visibilidad del editor. Reproducir los ajustes soportados sobre la fuente de alta resolución. Transformar textos y otras capas desde coordenadas de documento, conservando el encuadre.

Ofrecer tamaño original o reducido y mostrar dimensiones finales. Mantener formatos existentes; conservar alfa en PNG y aplicar un fondo definido en JPEG. Gestionar memoria de forma acotada y liberar lienzos temporales. Si el dispositivo no puede renderizar el tamaño solicitado, avisar y ofrecer un tamaño menor, sin reducir silenciosamente la imagen ni afirmar que se exportó el original.

Mantener las interfaces actuales usadas por herramientas internas; migrar descarga y compartir a una exportación asíncrona del documento. Las funciones de análisis seguirán trabajando con vistas previas limitadas.

### 3. Guardado y recuperación local

Usar IndexedDB con esquema versionado y recursos Blob, evitando duplicar archivos base64 en cada paso. En esta fase se recupera el último proyecto; no se añade una galería completa.

Guardar tras operaciones confirmadas, cambios de capas y deshacer/rehacer, agrupando eventos frecuentes. No persistir previews temporales. Publicar una revisión solo cuando sus recursos están almacenados. Mostrar «Guardando», «Guardado en este dispositivo» o un error real.

Al iniciar, ofrecer continuar el último proyecto o abrir otra fotografía. Ante un error de lectura, cuota o recurso incompleto, no sobrescribir la última revisión válida. El guardado local no se presentará como copia de seguridad permanente: el navegador puede borrar su almacenamiento. No se suben fotografías a ningún servicio nuevo.

### Integración y módulos

- `project-store.js`: esquema, migración, transacciones y recursos de IndexedDB.
- `photo-document.js`: estado de documento, revisiones, operaciones y coordenadas.
- `photo-renderer.js`: generación de preview y exportación, con límites de memoria.
- `app.js`: importación, historial, edición de capas y compatibilidad con PhotoIA.
- Adaptadores acotados en Smart, curvas, recorte, recolor y herramientas que reemplazan píxeles, para declarar la operación y su resolución efectiva.
- Interfaz: estado de guardado, recuperación inicial y dimensiones de exportación; caché actualizada para los nuevos módulos.

Cada resultado asíncrono comprobará proyecto y revisión antes de aplicarse. Una acción sobre una foto antigua nunca podrá sobrescribir otra recién abierta.

## Criterios de aceptación y verificación

1. Importar una imagen de 4032×3024 conserva el archivo fuente. Sin operaciones que limiten resolución, exporta esas dimensiones.
2. Exportar con panel abierto/cerrado o después de girar el dispositivo produce el mismo documento, sin recortes ni dependencia de la escala de pantalla.
3. Recolor → mejora automática conserva ambos efectos; deshacer y rehacer recuperan cada estado sin duplicarlos.
4. Recorte y capas mantienen posiciones correctas al exportar y recuperar el proyecto.
5. Recargar recupera original, edición, capas y estado consistente; un guardado interrumpido deja disponible la última revisión completa.
6. Errores de cuota, recursos ausentes, procesamiento cancelado y exportación demasiado grande tienen mensajes accionables y no destruyen el trabajo anterior.
7. Pruebas de unidad para operaciones/coordenadas y pruebas de navegador con Fabric e IndexedDB real. Mantener las regresiones existentes de ropa, Smart y lienzo.
8. Validación visual en retrato, paisaje, transparencia, foto de alta resolución y dispositivos de pantalla pequeña. La verificación en iPhone físico se informará por separado si no está disponible.

## Secuencia propuesta

Primero introducir y probar el modelo de documento y sus adaptadores; después la exportación independiente y finalmente la persistencia/recuperación. No declarar completada la resolución original para herramientas cuyo adaptador todavía no la soporte. Mantener cada entrega verificable y compatible con las herramientas existentes.

## Control de cambios

Diseño y ejecución directa aprobados. No hacer commit ni push sin autorización del usuario.
