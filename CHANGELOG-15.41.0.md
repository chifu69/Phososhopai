# PHOTO IA 15.41.0 — Base de edición recuperable

- Original conservado como archivo Blob, con dimensiones y orientación propias.
- Exportación independiente de la pantalla: PNG con transparencia, JPG sobre blanco y WebP cuando el navegador lo admite. Se puede guardar el original separado.
- Ajustes, curvas, mejora automática, recorte y geometría reversibles. Smart conserva los retoques previos y sustituye su última receta al volver a aplicarlo.
- La mejora automática usa la receta local compatible tanto en la vista previa como en exportación; no depende de que OpenCV termine de cargar. Los retoques regionales de OpenCV siguen disponibles.
- Retoques de ropa, pelo, piel, cuerpo y resultados de IA conservados como recursos raster. Su resolución efectiva se muestra; no se presentan como ediciones nativas de más resolución ni se repiten peticiones al servidor al exportar.
- Último proyecto e historial guardados en IndexedDB mediante una transacción. Recuperación explícita al abrir la app. Un error de guardado conserva el último proyecto completo.
- Recursos de capas y selecciones compartidos en el historial. Las selecciones se invalidan al cambiar la base o geometría, y deshacer recupera las pertinentes.
- Caché y referencias de scripts actualizadas a 15.41.0.

## Límites

Los retoques raster locales trabajan con la vista previa (hasta 2000 px); los externos usan la resolución recibida. Una exportación grande puede requerir elegir 2000 o 1200 px por memoria. El almacenamiento del navegador no sustituye una copia de seguridad y puede ser borrado por el sistema. No se migran sesiones anteriores que existían únicamente en memoria.

## Verificación

Pruebas unitarias: `node tests/run.cjs`.
Pruebas de navegador: `node tests/browser/run.cjs`, con Playwright instalado. Variables opcionales: `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `FABRIC_TEST_PATH` (Fabric 5.3.1 local para pruebas sin red).

La comprobación automatizada de Chrome no sustituye una prueba en iPhone físico.
