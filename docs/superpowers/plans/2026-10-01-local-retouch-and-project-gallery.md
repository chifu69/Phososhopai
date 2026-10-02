# Local Retouch and Project Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar pincel local de luz/color, corrector/clonar y una galería que conserve varios proyectos editables sin perder el original.

**Architecture:** Extender el documento y renderer existentes con recetas de pincel normalizadas, un controlador de interacción compartido y una galería respaldada por IndexedDB v2. Separar el motor puro de píxeles, los previews temporales y los commits. Mantener las herramientas actuales sobre los mismos contratos públicos.

**Tech Stack:** JavaScript clásico, Canvas 2D, Fabric 5.3.1, IndexedDB, Node y Playwright. Sin dependencias nuevas ni servicios remotos.

**Spec:** `docs/superpowers/specs/2026-10-01-local-retouch-and-project-gallery-design.md`, aprobado por el usuario.

## Global Constraints

- Implementar las tres funciones aprobadas; no añadir perspectiva, desenfoque, lotes ni otros cambios de Smart.
- Original inmutable; historial, capas, máscaras y resolución efectiva conservados.
- Los paneles reservan espacio para ver la fotografía completa.
- Preview/cancelación no producen operaciones ni guardados del proyecto.
- Operaciones nuevas reproducibles sobre la resolución disponible; no limitar silenciosamente el export a 2000 px.
- Galería local, sin eliminación automática de proyectos para liberar espacio.
- Migración y guardado atómicos; un fallo conserva los proyectos íntegros anteriores.
- No hacer commit ni push sin una nueva petición del usuario.
- Versión prevista 15.42.0, referencias y caché coherentes.

## Review Focus

- Cambiar de A a B y volver a A mientras termina una operación antigua: ningún resultado se acepta por coincidir solo ID/revisión (tarea 2).
- Dedo sale del lienzo, pointercancel, cierre de panel o cambio de modo: no quedan trazos activos ni previews guardados (tareas 4–5).
- Foto girada/reflejada y muestreo junto a un borde transparente: coordenadas estables, sin negro añadido ni cambio de alfa (tareas 3–5).
- Dos proyectos comparten recursos históricos; borrar o guardar uno no rompe el otro, incluso si se llena la cuota (tarea 1).
- Filtros pendientes antes del pincel, recorte posterior y reapertura: no se aplican filtros dos veces ni se exporta el overlay (tareas 4–6).

---

## Contratos compartidos

- `ProjectEntry = {id,name,width,height,updatedAt,revisionKey,assetIds,thumbnail:Blob|null}`.
- `Store.save(session,assets,{thumbnail?}):Promise<void>` conserva otros proyectos; `list():Promise<ProjectEntry[]>`; `load(id):Promise<{session,assets}|null>`; `activate(id):Promise<void>`; `rename(id,name):Promise<void>`; `remove(id):Promise<void>`. `loadLatest()` conserva el contrato anterior.
- `PhotoProject.token()` añade `epoch` al token de ID/revisión. `valid(token)` comprueba los tres campos. Epoch cambia al importar/abrir/limpiar, no en cada trazo.
- `PhotoProject.saveNow({strict=false}={}):Promise<boolean>` devuelve false ante fallo del autosave; con strict propaga el error. Navegación exige guardado estricto.
- `PhotoProject.listProjects()`, `openProject(id)`, `renameProject(id,name)`, `deleteProject(id)` delegan persistencia y actualizan la interfaz solamente tras éxito.
- `Stroke = {points:[{x,y}],radius,softness,opacity,erase,offset?:{x,y}}`: posiciones/desplazamientos normalizados por ancho/alto, radio por el lado corto; valores finitos y limitados.
- `Recipe = {kind:'local-adjust'|'local-repair',strokes,params,selection?:{assetId,width,height}}`. Ajustes: exposición EV, temperatura, saturación e intensidad. Reparación: modo clone/heal e intensidad.
- `PhotoLocalRetouchCore.render(imageData,recipe,selectionBytes?):{data:Uint8ClampedArray,width,height}` no modifica el argumento. `mask(width,height,strokes):Float32Array` interpola puntos y admite borrar.
- `PhotoLocalRetouch.open(kind)`, `apply()`, `cancel()` administran una sesión con token, receta y fuente congelada. El overlay temporal lleva `photoRole:'preview-overlay'` y `excludeFromExport:true`; no sustituye la imagen confirmada.

## Task 1: Persistencia de varios proyectos y migración

**Files:** modificar `project-store.js`, ampliar `tests/browser/project-store.cjs`, crear `tests/browser/project-gallery-store.cjs`.
**Interfaces:** producir Store v2 con los contratos anteriores. Mantener `save`, `loadLatest`, `close` compatibles con las llamadas existentes; un guardado no cambia el proyecto activo salvo al crear el primer proyecto.

- [ ] Escribir fixture IndexedDB v1 con sesión, original Blob e historial. Exigir que abrir v2 produzca una entrada y conserve bytes, ID y estados.
- [ ] Añadir tests de guardar A/B, cargar ambos, renombrar A, eliminar A y cargar B; incluir asset compartido entre los dos. Ejecutar el nuevo test y registrar RED por métodos ausentes.
- [ ] Crear store `projects` con índice de fecha en upgrade. Leer metadata.latest/revisions durante la misma transacción de upgrade y registrar el proyecto anterior sin borrar datos.
- [ ] Cambiar save para publicar recursos, sesión y catálogo por proyecto en una transacción. Sustituir solo la revisión publicada del proyecto guardado; conservar su historial completo en la sesión.
- [ ] Implementar list/load/activate/rename/remove. Validar nombres de 1–80 caracteres. Separar nombre de proyecto y nombre del archivo original para que renombrar no cambie la descarga del original.
- [ ] Limpiar recursos únicamente usando la unión de referencias de todos los proyectos. Actualizar el test antiguo que asumía que guardar B eliminaba A.
- [ ] Probar cuota simulada, aborto durante upgrade/guardado y recursos ausentes: comprobar que A/B y metadata.latest conservan sus valores completos anteriores. Ejecutar ambos tests de store hasta GREEN.

## Task 2: Navegación y galería con miniaturas

**Files:** modificar `photo-project.js`, `app.js`, `ui-layout.js`, `styles.css`; crear `project-gallery.js`, `tests/browser/project-gallery.cjs`.
**Interfaces:** consumir Store v2; producir los wrappers PhotoProject y el token con epoch. `PhotoProjectGallery.open()` construye un panel con tarjetas y acciones.

- [ ] Escribir test de importar A/B, reabrir A, recargar y abrir B conservando capas y máscaras distintas. Exigir rechazo de un token capturado en la apertura anterior de A. Registrar RED.
- [ ] Hacer saveNow estricto cuando se cambia de proyecto; mantener el autosave sin rechazo no manejado. Esperar la cola antes de abrir/importar otra foto. Si guardar falla, conservar editor y selección actuales y mostrar Reintentar/Exportar.
- [ ] Añadir epoch y auditar consumidores de tokens. Cargar recursos y preparar el canvas candidato antes de cambiar la sesión visible; activar el proyecto persistido solo cuando la apertura válida termine.
- [ ] Generar miniatura de hasta 320 px desde revisión confirmada, con capas. Guardar null o la miniatura anterior si falla; invalidar resultados atrasados mediante epoch/revisión. Revocar URLs de tarjetas al cerrar el panel.
- [ ] Crear «Mis proyectos» en Inicio y menú de proyecto, tarjetas ordenadas por fecha, estados vacío/cargando/error y acciones Abrir/Renombrar/Eliminar. Eliminar pide confirmación en UI; si es el activo, limpiar el editor sin volver a guardarlo desde una cola pendiente.
- [ ] Probar fallo de guardado al navegar, miniatura tardía, eliminación del activo y nueva importación. Ejecutar store, galería y workflow previo hasta GREEN.

## Task 3: Motor puro de pincel y reparación

**Files:** crear `local-retouch-core.js`, `tests/local-retouch.test.cjs`; ampliar `photo-operation-adapters.js`.
**Interfaces:** producir PhotoLocalRetouchCore y handlers `local-adjust`/`local-repair`. El renderer resuelve `selection.assetId` cuando exista y conserva el tamaño del canvas de entrada.

- [ ] Escribir tests numéricos de píxeles fuera de máscara idénticos, alfa inmutable, exposición cero identidad, borrar máscara y trayectoria interpolada sin huecos. Registrar RED por módulo ausente.
- [ ] Implementar máscara de cobertura suave a partir de trazos; espaciar muestras a como máximo un cuarto del radio. La opacidad se combina de forma definida y no depende de la frecuencia de eventos del dedo.
- [ ] Implementar exposición, temperatura y saturación mezcladas por máscara. Calcular siempre desde la fuente congelada, limitar canales y mantener alfa. Intersectar la selección opcional sin modificarla.
- [ ] Añadir test de clonar una cuadrícula conocida y muestra parcialmente fuera de imagen: copiar solo las muestras válidas. Implementar muestreo bilineal desde la fuente congelada y mezcla por cobertura; no copiar del resultado parcial.
- [ ] Añadir test de corrector: conservar contraste de textura de la muestra y acercar su media RGB al destino. Implementar diferencia de medias locales de fuente/destino más borde suave, con ajuste limitado para evitar recortes de canales.
- [ ] Registrar handlers que usan este motor para preview y export. Ejecutar tests puros y suite Node hasta GREEN; comprobar que render no muta su fuente.

## Task 4: Pincel local y sesión de edición temporal

**Files:** crear `local-retouch.js`; modificar `creative-tools.js`, `photo-project.js`, `ui-layout.js`, `index.html`, `styles.css`; crear `tests/browser/local-adjust.cjs`.
**Interfaces:** consumir el motor puro y `PhotoProject.commitOperation`. Producir controlador PhotoLocalRetouch compartido con reparación.

- [ ] Escribir test browser: pintar, ajustar intensidad, cancelar; exigir revisión/historial iguales al inicio. Después aplicar y exigir una sola operación. Registrar RED.
- [ ] Añadir modo exclusivo `local-retouch` al gestor existente, con ayuda y cursor. Desactivar dibujo/selección de objetos y cerrar modos previos; conservar estado de bloqueo de las capas.
- [ ] Capturar token, filtros, receta y fuente no orientada de la sesión. Convertir eventos con la inversa de calcTransformMatrix del main. Guardar puntos normalizados; dibujar cursor y preview excluidos de exportación.
- [ ] Mostrar panel «Pincel local» con tamaño 1–30% del lado corto, suavidad 0–100%, intensidad 0–100%, exposición −2 a +2 EV, temperatura −100 a +100 y saturación −100 a +100; Pintar/Borrar zona, Mostrar zona y Limitar a selección.
- [ ] Interpolar trazos y recalcular preview con secuencia cancelable. Aplicar retira overlays y confirma receta sobre la base original de la sesión, congelando filtros previos una sola vez mediante el pipeline existente. Cancelar/close/pointercancel liberan estado temporal; pointercancel descarta el trazo en curso.
- [ ] Probar controles reales con mouse/touch simulado, foto girada/reflejada, cambio de viewport, cierre del panel y resultado tardío. Exigir que los controles no cubran la foto. Ejecutar test nuevo y regresiones de lienzo/máscaras.

## Task 5: Corrector y clonar sobre el controlador compartido

**Files:** ampliar `local-retouch.js`, `ui-layout.js`, `styles.css`; crear `tests/browser/local-repair.cjs`.
**Interfaces:** consumir modo local-repair del motor; añadir selección de origen y desplazamiento por trazo sin duplicar el gestor de eventos.

- [ ] Escribir test: elegir origen con botón/tap, pintar destino, aplicar; comparar muestra conocida y verificar que Undo/Redo reconstruyen el resultado. Registrar RED.
- [ ] Añadir acceso «Corrector / Clonar» desde Limpiar. Mostrar modos, botón Elegir origen, cruz de origen y controles compartidos. Impedir pintar sin origen y explicar el siguiente paso.
- [ ] Fijar desplazamiento al comenzar cada trazo y mantener la fuente de sesión inmutable. Permitir borrar trazos de reparación recomponiendo desde la fuente; Cambiar origen afecta solo a trazos posteriores.
- [ ] Probar origen fuera del borde, transparencia, dos trazos solapados, cambio de modo/cancelar y reapertura de otro proyecto. Exigir alfa inmutable, ausencia de negro añadido y ninguna escritura desde una sesión vieja.
- [ ] Ejecutar tests de reparación, ajuste y regresiones de ropa/piel/cabello sin cambiar sus algoritmos.

## Task 6: Integración, exportación, caché y revisión final

**Files:** actualizar `index.html`, `sw.js`, `manifest.webmanifest`, referencias activas de versión y `README.md`; crear `CHANGELOG-15.42.0.md`, `tests/browser/local-retouch-workflow.cjs`.
**Interfaces:** añadir los módulos nuevos al orden de scripts y CORE; usar las suites y contratos de tareas 1–5.

- [ ] Test integrado: ajuste previo → pincel de luz → clonar → Smart → recorte → guardar → recargar → abrir desde galería → exportar. Exigir orden de operaciones, original intacto y capas alineadas.
- [ ] Exportar fixture 4032 × 3024 con las nuevas herramientas y verificar dimensiones nativas, alfa y que no aparezcan overlays. Comparar muestras de preview/export en regiones constantes y continuidad del borde dentro de tolerancia de cuantización.
- [ ] Probar 320 × 740, 390 × 844, 844 × 390 y 1440 × 1000 en claro/oscuro; inspeccionar capturas de galería y ambos paneles. Confirmar controles táctiles y fotografía completa.
- [ ] Actualizar a 15.42.0 todos los recursos activos y cachear módulos nuevos. Documentar límites del corrector local, almacenamiento y ausencia de prueba en iPhone físico cuando corresponda.
- [ ] Ejecutar `node tests/run.cjs`, `node tests/browser/run.cjs`, parseo de JS, validación del manifest y `git diff --check`. Solicitar una revisión independiente del diff completo; resolver hallazgos importantes y repetir pruebas afectadas.
- [ ] Presentar resumen de cambios y resultados. No commit ni push.

## Revisión del plan y ejecución

Cobertura: migración, cuota y recursos compartidos (1); navegación/galería y carreras de apertura (2); precisión de píxeles/alfa y muestreo (3); controles, exclusividad, cancelación y coordenadas (4–5); exportación nativa, regresiones y móvil (6).

Se conserva la ejecución directa elegida en esta conversación: el asistente implementa las tareas en orden y solicita una revisión independiente al final. Este plan escrito requiere revisión antes de comenzar el código de producto.

## Resultado de ejecución — 2026-10-02

Implementadas las seis tareas. Suite Node y 18 escenarios de navegador completados sin fallos; parseo JS, manifest y `git diff --check` correctos. Verificada exportación de 4032 × 3024, gestos táctiles sobre foto girada/reflejada, cancelación, deshacer/rehacer, migración y galería. Inspeccionadas capturas de los paneles y comprobadas cuatro resoluciones en claro/oscuro. La revisión independiente encontró dos carreras de eliminación; ambas se reprodujeron y corrigieron con pruebas de regresión. No se probó en iPhone físico. Cambios conservados sin commit ni push.
