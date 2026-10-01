# Professional Editor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this tightly coupled migration) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conservar el original, aplicar ediciones reversibles y recuperar el último proyecto sin depender del tamaño del editor.

**Architecture:** Un documento versionado será la fuente de verdad; Fabric será su representación interactiva. Un renderer separado reproducirá operaciones y compondrá capas, mientras IndexedDB guardará revisiones y recursos Blob de forma atómica. Los módulos existentes se integrarán mediante adaptadores, sin reemplazar el framework.

**Tech Stack:** JavaScript sin compilación, Fabric 5.3.1 existente, Canvas, IndexedDB, pruebas Node y Playwright con navegador real.

**Spec:** `docs/superpowers/specs/2026-10-01-professional-editor-foundation-design.md` (aprobado por el usuario).

## Global Constraints

- Se mantienen las herramientas existentes y la interfaz Studio. Esta fase no añade herramientas fotográficas ni servicios remotos.
- Guardar el Blob original inmutable, tipo MIME, nombre, dimensiones orientadas y una revisión del proyecto.
- No persistir previews temporales.
- Una acción sobre una foto antigua nunca podrá sobrescribir otra recién abierta.
- No se volverá a llamar al servicio al exportar.
- No hacer commit ni push sin autorización del usuario.
- Mantener las interfaces actuales usadas por herramientas internas; migrar descarga y compartir a una exportación asíncrona del documento.
- No declarar completada la resolución original para herramientas cuyo adaptador todavía no la soporte.

## Review Focus

- Orientación EXIF y transparencia: importar y recuperar sin doble giro ni pérdida de alfa (tareas 2 y 5).
- Paneles, zoom y giro del dispositivo: exportación idéntica y capas alineadas (tareas 2 y 5).
- Dos operaciones asíncronas o cambio de foto: descartar resultados obsoletos y no persistir previews (tareas 1, 3 y 7).
- Cuota llena, recursos ausentes y cierre durante guardado: conservar la última revisión completa (tareas 6 y 7).
- Retoques raster/IA de resolución limitada: informar dimensiones efectivas y no repetir llamadas externas (tareas 4 y 5).

## Archivos y contratos compartidos

Nuevos módulos IIFE con exportación global, como los módulos existentes. Pruebas Node cargan funciones puras mediante `vm`; los tests de navegador usan Fabric e IndexedDB reales.

- `photo-document.js` → `window.PhotoDocument`: estado, historial, operaciones y coordenadas.
- `photo-renderer.js` → `window.PhotoRenderer`: decodificación, replay y exportación.
- `project-store.js` → `window.PhotoProjectStore`: recursos y revisiones persistentes.
- `photo-operation-adapters.js` → registro de handlers para las herramientas existentes.
- `tests/run.cjs`: ejecuta todos los tests unitarios `.test.cjs`, propaga fallos.
- `tests/browser/project-workflow.cjs`: servidor local temporal, fixtures, pruebas con Playwright; rutas de Node/Chrome configurables, sin rutas personales fijas.

Tipos JS documentados con JSDoc:

`Document = {schemaVersion:1,id,revision,name,source:{assetId,mime,width,height},operations:Operation[],layers:Layer[],selection:null|Selection}`.
`Operation = {id,kind,inputRevision,enabled,params,assetId:null|string,effectiveSize:null|{width,height}}`.
`Asset = {id,blob:Blob,mime,width,height}`; recursos inmutables, referenciados por ID.
`Layer = {id,fabric:JSON}` con transforms en coordenadas del documento, sin URLs temporales ni recursos base64 duplicados.
`Selection = {assetId,documentRevision}`; máscara raster normalizada a las dimensiones del documento, inválida tras cambios de geometría salvo transformación explícita.
`Token = {documentId,revision}` para validar trabajos asíncronos.
Historial en un `Session = {current:Document,past:Document[],future:Document[]}`; máximo 40 estados, compartiendo recursos por ID.
`RenderResult = {blob,width,height,effectiveSize,limitedBy:string[]}`. Errores tipados: `STALE_RESULT`, `MISSING_ASSET`, `UNSUPPORTED_OPERATION`, `EXPORT_TOO_LARGE`, `STORAGE_UNAVAILABLE`, `STORAGE_FULL`.

### Task 1: Documento, operaciones e historial

**Files:** crear `photo-document.js`, `tests/photo-document.test.cjs`, `tests/run.cjs`.
**Interfaces:** `create(source,name):Session`; `token(session):Token`; `commit(session,token,change):Session`; `undo(session):Session`; `redo(session):Session`. `change` contiene un documento actualizado o una operación nueva, nunca estado de UI. `upsertLastOperation(document,operation):Document` sustituye solo el mismo tipo al final; en otro caso añade. Revisiones siempre monotónicas, incluso al deshacer.

- [ ] Escribir tests de commits, fuente inmutable, deshacer/rehacer, límite de 40 estados y token obsoleto; comprobar `assert.throws(()=>commit(session,oldToken,change), /STALE_RESULT/)`.
- [ ] Ejecutar `node tests/photo-document.test.cjs`: debe fallar por la ausencia del contrato.
- [ ] Implementar estado inmutable y validación de tipos/esquema, sin dependencias DOM. Añadir conversores `toDocumentTransform(transform,viewport)` y `toViewportTransform(transform,viewport)` para matriz afín de Fabric.
- [ ] Probar ida/vuelta de capas con matrices de escala, traslación y giro; tolerancia `1e-6`. Probar `recolor → smart → undo → redo` como operaciones sin pérdida del recolor.
- [ ] Ejecutar `node tests/run.cjs`; todos los tests existentes y nuevos deben pasar. Revisar diff; no commit sin permiso.

### Task 2: Importación con original y preview independientes

**Files:** modificar `app.js`, `index.html`; crear base de `photo-renderer.js`, `tests/browser/import-document.cjs`.
**Interfaces:** `PhotoRenderer.decodeSource(blob):Promise<{image,width,height,dispose}>`; `renderPreview(document,resolveAsset,{maxDimension:2000,signal}):Promise<RenderResult>`; `resolveAsset(id):Promise<Asset>`. Inicialmente renderer soporta documentos sin operaciones. `PhotoIA.getDocument():Document`, `getDocumentToken():Token`, `resolveAsset(id)` dan acceso al documento activo.

- [ ] Test de navegador: importar fixture 4032×3024 y exigir source 4032×3024, Blob original idéntico en bytes y preview con lado mayor ≤2000. Fixtures con EXIF girado y PNG alfa deben conservar orientación visual y transparencia.
- [ ] Ejecutar `node tests/browser/import-document.cjs`: registrar el fallo por reducción irreversible actual.
- [ ] Mantener recursos en memoria mediante Map de IDs; crear documento antes de representar el preview. Cambiar `loadFile` y `setMainImage` para distinguir nueva importación de cambio de representación. No resetear el proyecto al reemplazar un preview.
- [ ] Adaptar `snapshot`/restoreJSON para usar transforms en coordenadas del documento y restaurar controles, layers y revisión desde Session. Mantener los wrappers públicos de historial existentes.
- [ ] Ejecutar test de importación, test de capas tras resize y `node tests/run.cjs`. Mantener el original disponible tras recortar/deshacer. Liberar ImageBitmap/ObjectURL cuando no se use, nunca un Blob referenciado.

### Task 3: Ajustes y mejora automática reproducibles

**Files:** crear `photo-operation-adapters.js`; modificar `app.js`, `smart-core.js`, `curves-tool.js`, `photo-renderer.js`; crear `tests/operation-replay.test.cjs` y `tests/browser/adjustment-chain.cjs`.
**Interfaces:** `PhotoRenderer.register(kind,{render,effectiveSize})`; `render(canvas,operation,{resolveAsset,signal}):Promise<HTMLCanvasElement>`; `effectiveSize(size,operation):{width,height}`. Handlers iniciales: `adjustments`, `curves`, `smart`, `crop`, `rotate`, `flip`. API de integración: `PhotoIA.commitOperation(operation,token):Promise<boolean>` y `previewOperation(operation,token):Promise<RenderResult>`.

- [ ] Escribir tests: repetir la última mejora sustituye su receta; un ajuste posterior permanece al volver a mejorar; cancelación no cambia revisión ni historial. Una operación sobre otra foto debe descartarse.
- [ ] Registrar el fallo antes de implementar; ejecutar `node tests/operation-replay.test.cjs` y `node tests/browser/adjustment-chain.cjs`.
- [ ] Extraer funciones de píxeles usadas por Smart a handlers compartidos, sin cambiar el algoritmo. Capturar en la operación el motor empleado: no cambiarlo silenciosamente al exportar. Si el motor falta, dar error recuperable.
- [ ] Convertir sliders/curvas/presets en operaciones con parámetros; evitar doble aplicación de filtros tanto en Fabric como en replay. Encadenar análisis/Smart sobre el resultado de entrada correcto, conservando idempotencia de la última operación.
- [ ] Registrar recorte/giro/reflejo como operaciones geométricas, sin sobrescribir la fuente. Transformar capas al cambiar coordenadas; invalidar o transformar selección explícitamente.
- [ ] Ejecutar tests de cadena y suite. Verificar visualmente que preview y replay del mismo motor coinciden, con tolerancia de cuantización máxima de 2 niveles por canal en fixtures deterministas.

### Task 4: Recolor, retoques y resultados de IA compatibles

**Files:** modificar `segmentation.js`, `opencv-engine.js`, `body-retouch.js`, `creative-tools.js`, `mask-tool.js`, `ai-studio.js`, `content-aware-ai.js`, `onnx-lab-recolor.js` cuando sus llamadas afecten al editor; ampliar `photo-operation-adapters.js` y `app.js`; crear `tests/browser/raster-chain.cjs`.
**Interfaces:** handler `raster-result` usa `assetId` y `effectiveSize`; `commitRasterResult(blob,{token,width,height,label}):Promise<boolean>`. Extender `applyProcessedImageDataUrl` con opción de operación/token, conservando firmas existentes. Llamadas antiguas sin receta se registran como `raster-result`, nunca como resultado de resolución original.

- [ ] Test `recolor → smart → undo/redo → renderPreview` preserva ambos efectos; cancelar preview no crea asset persistente ni operación. Registrar el fallo primero.
- [ ] Auditar todos los consumidores de `applyProcessedImageDataUrl` y `setMainImage`: cada resultado confirmado debe registrar una operación o un recurso intermedio. Adaptar recolor con máscara/receta reproducible cuando sea determinista; almacenar resultados raster en los otros casos.
- [ ] Guardar selecciones necesarias como assets vinculados a revisión; comprobar stale tokens tras carga/recorte. La API de preview no registra resultados confirmados.
- [ ] Mostrar la limitación de resolución antes de confirmar una operación raster. Si una herramienta no puede reproducirse a mayor resolución, `effectiveSize` restringe exportación y el usuario puede conservar su original por separado.
- [ ] Test externo IA: exportar no invoca el servicio y un asset ausente produce `MISSING_ASSET`, sin saltar silenciosamente el efecto. Ejecutar suite y test raster.

### Task 5: Exportación asíncrona del documento

**Files:** ampliar `photo-renderer.js`; modificar `app.js`, `ui-layout.js`, `index.html`; crear `tests/browser/export-document.cjs`.
**Interfaces:** `renderExport(document,resolveAsset,{format,quality,size,background,signal}):Promise<RenderResult>`; size es `'original'` o `{width,height}` conservando proporción. `PhotoIA.exportDocument(options):Promise<RenderResult>` para descargar/compartir; conservar exportDataUrl síncrono solo para consumidores internos de preview hasta migrarlos explícitamente.

- [ ] Escribir y ejecutar tests fallidos: exportar 4032×3024 sin operaciones limitantes mantiene dimensiones; abrir panel/rotar viewport no cambia dimensiones ni píxeles; la selección activa del editor queda intacta.
- [ ] Renderizar replay en canvas independiente y componer las capas con Fabric StaticCanvas separado. Excluir overlays y máscaras de diagnóstico, no las capas del usuario. No usar la escala visual ni su multiplicador máximo de 6.
- [ ] Exportar PNG con alfa, JPEG con fondo blanco configurable y formatos existentes solo si el navegador realmente los produce. Liberar recursos en `finally`; usar Blob/ObjectURL para descarga y compartir.
- [ ] Estimar memoria antes del render usando dimensiones y buffers simultáneos; ante límite o fallo de asignación producir `EXPORT_TOO_LARGE` y ofrecer tamaño menor explícito. Nunca descargar un canvas vacío como éxito.
- [ ] Añadir UI de dimensiones solicitadas/efectivas y original separado cuando haya un resultado limitado. Test PNG transparente, recorte+texto+giro, recursos limitados y error de memoria. Ejecutar todos los tests.

### Task 6: Persistencia transaccional en IndexedDB

**Files:** crear `project-store.js`, `tests/browser/project-store.cjs`; integrar carga del módulo en `index.html`.
**Interfaces:** `open():Promise<Store>`; `Store.save(session,assets):Promise<void>`; `Store.loadLatest():Promise<{session,assets}|null>`; `Store.close()`. Base `photo-ia-projects`, versión 1, stores `assets`, `revisions`, `metadata`. `metadata.latest` apunta a la última revisión íntegra.

- [ ] Tests de IndexedDB real: guardar, cerrar y recuperar conserva Blob original/Session; aborto a mitad no mueve latest; `MISSING_ASSET` no sobrescribe revisiones. Ejecutar y registrar fallo por módulo ausente.
- [ ] Guardar recursos nuevos, revisión y puntero latest en una transacción; resolver save en `transaction.oncomplete`, no en request. IDs compartidos evitan duplicar blobs entre revisiones.
- [ ] Implementar validación de esquema, rechazo seguro de versión futura y errores normalizados de cuota/acceso. Recolectar assets huérfanos solo después de un guardado válido y preservando referencias del historial retenido.
- [ ] Añadir tests de transacción abortada, cuota simulada mediante aborto controlado, esquema incompatible y limpieza sin pérdida de recursos referenciados. Ejecutar suite de store y unitarios.

### Task 7: Autosave, recuperación y entrega integrada

**Files:** modificar `app.js`, `ui-layout.js`, `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest` y referencias de versión activas; crear `tests/browser/project-workflow.cjs` y notas de versión.
**Interfaces:** controlador de guardado consume `Session` y assets tras commit/undo/redo; debounce 500 ms con una cola serial, capturando documento y revisión. Estados de UI: «Guardando», «Guardado en este dispositivo», «No se pudo guardar»; no prometer guardado antes de completar la transacción.

- [ ] Test fallido: editar, esperar estado guardado, recargar y continuar recupera foto, capas y operaciones. Verificar que previews cancelados no se recuperan y que una escritura antigua no suplanta otra foto.
- [ ] Conectar autosave a operaciones confirmadas y cambios reales de capas; nunca a resize o preview. Al cambiar de proyecto, vaciar o cancelar la cola de forma segura. No depender de que beforeunload permita terminar tareas asíncronas.
- [ ] Mostrar recuperación al arrancar sin sustituir automáticamente una foto nueva. «Abrir otra» no elimina la revisión anterior hasta completar una nueva importación/guardado; errores dejan intacto el proyecto recuperable.
- [ ] Añadir módulos al orden de carga y caché, sin descargas remotas nuevas. Elegir siguiente versión después de verificar versión local/remota disponible; documentar límites y migración de sesiones antiguas en memoria.
- [ ] Ejecutar `node tests/run.cjs` y los seis scripts browser de tareas 2–7. Comprobar pantallas 320×740, 390×844, 844×390 y 1440×1000, tema claro/oscuro y fotos reales además de fixtures.
- [ ] Pedir revisión independiente del diff completo, resolver hallazgos importantes, repetir verificaciones afectadas y presentar resumen al usuario. Informar por separado si no hubo acceso a iPhone físico. No commit/push sin autorización.

## Revisión del plan

Cobertura: original y orientación (2); operaciones, historial y resultados asíncronos (1,3,4); recorte/capas/máscaras (2–5); exportación y memoria (5); persistencia/errores (6,7); compatibilidad/versionado/pruebas (7). Los contratos anteriores son compartidos y no requieren reemplazar Fabric. El original de alta resolución no garantiza detalle adicional para operaciones limitadas: esas rutas deben informar su limitación.

## Ejecución

Recomendación: ejecución directa en esta sesión, por la dependencia estrecha entre el estado del documento y los adaptadores. Revisión independiente al final. Alternativa: subagente implementador y revisor por tarea, con más revisiones y coste de coordinación. Pendiente elección del usuario y aprobación del plan escrito; el diseño ya fue aprobado.

## Implementation notes

The user approved the plan and chose direct execution. Implementation lives on `codex/professional-editor`, without commits or push.

- `photo-project.js` bridges the document and existing Fabric tools. `view.objects` holds canonical layer geometry, without duplicating it in `layers`. Pending filters/curves live in the view and become operations before the next enhancement. Rotation/flip remain Fabric parameters until an oriented crop is committed.
- Smart replays the existing compatible local recipe in both preview and export. OpenCV remains available for regional retouching. Export never silently switches the recorded engine.
- Raster tools, including recolor, retain exact results with effective-resolution disclosure. Selection alpha masks are shared Blob assets for history and recovery; native recolor replay is not claimed.
- Operation tests live in `photo-document.test.cjs` and browser chains rather than duplicating the same cases in another test file. Dedicated layer/mask geometry and responsive tests were added.
- Chrome tests use real Fabric and IndexedDB, with external models/services blocked. No images were sent to a service. No physical iPhone was available.
