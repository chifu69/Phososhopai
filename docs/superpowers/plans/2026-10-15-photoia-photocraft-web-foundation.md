# PHOTO IA + PhotoCraft: base web para iPhone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar un editor de desarrollo navegable que abra una fotografía, la edite mediante PhotoCraft, deshaga/rehaga, guarde y exporte sin sustituir PHOTO IA 15.42.

**Architecture:** Una interfaz HTML/CSS táctil controla una sesión Rust/Wasm PhotoCraft en un Worker. El documento y su historial pertenecen exclusivamente al motor. Un protocolo versionado conecta controles, previsualización y persistencia; ninguna dependencia del frontend egui.

**Tech Stack:** JavaScript ES modules, Canvas 2D, Web Worker, Rust/Wasm, wasm-bindgen, IndexedDB y Playwright. PhotoCraft fijado al commit `4e7a17cd5d5723313f459753663d0d155f047e19`.

**Spec:** `docs/superpowers/specs/2026-10-15-photoia-photocraft-web-design.md`, aprobada el 2026-10-15.

## Global Constraints

- Priorizar iPhone y navegador; mantener marca PHOTO IA, español y edición local.
- No añadir cuentas, suscripciones ni servidor obligatorio.
- Conservar íntegra la app actual y su IndexedDB. Ruta de desarrollo separada `/next/`.
- Una sesión de documento y un historial; no duplicarlos en Fabric.
- Original independiente e inmutable; no reducirlo silenciosamente.
- Áreas táctiles de al menos 44 px y paneles fuera de la fotografía.
- No exigir WebGPU para la base inicial.
- Safari físico es requisito antes de promoverlo como sustituto para iPhone.
- No commit, push ni publicación sin nueva autorización.

## Alcance y continuidad

Este plan implementa la entrega 1 del diseño aprobado. La integración IA completa y la migración de galería son entregas posteriores dependientes de las mediciones de esta base. No presentar la entrega 1 como la fusión completa. Tras medir, planificar las entregas 2 y 3 con el contrato validado; no migrar datos existentes todavía.

## Review Focus

1. Cambiar de foto durante una operación: nunca aplicar resultados a otra sesión (tarea 2).
2. Memoria, dimensiones malformadas y archivos corruptos: conservar documento confirmado y mostrar error (tareas 1 y 3).
3. Cuota o cierre durante guardado: conservar la revisión persistida anterior (tarea 4).
4. Rotación, transparencia y orientación EXIF: preview y exportación coherentes (tareas 1 y 5).
5. Worker caído o Wasm no descargado: UI responde, no promete un guardado inexistente y permite reintentar (tareas 2 y 5).

## Contratos compartidos

`Request = {protocol:1,id,epoch,expectedRevision,action,payload}`; `Response = {protocol:1,id,epoch,revision,ok,result?,error?:{code,message}}`.

`DocumentInfo = {id,revision,width,height,layers:[{id,name,visible,opacity}],canUndo,canRedo}`. Revisiones monotonamente crecientes incluso tras Undo/Redo. La época cambia al abrir, cerrar o reiniciar Worker.

Acciones iniciales: `openImage`, `openProject`, `inspect`, `exposure`, `addLayer`, `setLayerVisibility`, `undo`, `redo`, `renderPreview`, `serialize`, `exportImage`, `close`. Validar parámetros y lista permitida; no exponer comandos arbitrarios del host.

`Preview = {width,height,rgba:ArrayBuffer}` (máximo lado 1200, RGBA no premultiplicado), `Export = {mime,bytes:ArrayBuffer,width,height}`. `ProjectSnapshot = {engineBytes:ArrayBuffer,original:Blob,metadata:DocumentInfo}`. La interfaz no toma snapshots del canvas para serializar el documento.

Errores: `INVALID_INPUT`, `UNSUPPORTED_FORMAT`, `LIMIT_EXCEEDED`, `STALE_RESULT`, `ENGINE_UNAVAILABLE`, `STORAGE_FULL`, `STORAGE_UNAVAILABLE`. Guardar bytes binarios sin base64. Rechazar bytes, dimensiones o longitud RGBA inconsistentes antes de reservar buffers.

### Task 1: Motor mínimo real y compilación reproducible

**Files:** crear `integrations/photocraft/UPSTREAM.md`, `integrations/photocraft/NOTICE`, `integrations/photocraft/licenses/`, `integrations/photocraft/bridge/Cargo.toml`, `integrations/photocraft/bridge/Cargo.lock`, `integrations/photocraft/bridge/src/{lib,document,render,error}.rs`, `scripts/build-photocraft.sh`, `tests/photocraft-bridge/`.

**Interfaces:** producir `Engine::open_image(bytes:&[u8])`, `Engine::execute(action:&str,payload:Value)`, `Engine::render_preview(max_side:u32)`, `Engine::serialize()`, `Engine::export_png()`; resultados `Result` con errores tipados y bytes. Exportaciones wasm-bindgen equivalentes, sin acceso al DOM.

- [ ] Localizar instalación Rust existente antes de instalar. El PATH examinado no expone cargo/rustup. Preparar toolchain compatible con el mínimo Rust 1.95 declarado por upstream, target wasm32-unknown-unknown y wasm-bindgen-cli compatible con Cargo.lock. No cambiar toolchain global de otros proyectos.
- [ ] Añadir fixture RGBA 32×24 con transparencia y tests `open_preserves_pixels`, `adjust_undo_redo`, `project_roundtrip`, `invalid_input_keeps_document`; exigir dimensiones, valores y alfa conocidos y el mismo original tras editar.
- [ ] Ejecutar `cargo test --manifest-path integrations/photocraft/bridge/Cargo.toml`; observar fallo inicial por API ausente antes de implementar.
- [ ] Implementar con crates engine/doc/compose/codecs/format del commit fijado. Utilizar servicios de memoria; no invocar diálogos ni rutas del sistema. Resolver parámetros de comandos mediante registro upstream y fijarlos en pruebas del adaptador.
- [ ] Establecer límite inicial explícito de 24 millones de píxeles, lado máximo 16384 y entrada de 64 MiB para esta base; evaluar presupuesto total, no solo tamaño de un buffer. Es un límite provisional de seguridad, no garantía de soportar esa resolución en iPhone.
- [ ] Compilar Wasm con `bash scripts/build-photocraft.sh`; generar módulos en `next/engine/` con nombres/versiones reproducibles. Medir tamaño. Verificar load/import/render/export desde Worker real. Si exige servicios incompatibles, documentar el bloqueo y ajustar el puente antes de avanzar.
- [ ] Repetir tests Rust y registrar licencias y revisión exacta de dependencias incorporadas. No copiar marcas ArtCraft.

### Task 2: Worker y control de sesiones

**Files:** crear `next/engine-client.js`, `next/engine-worker.js`, `next/protocol.js`, `tests/photocraft-protocol.test.cjs`, `tests/browser/photocraft-worker.cjs`.

**Interfaces:** consumir puente de tarea 1; producir `EngineClient.start()`, `request(action,payload,transfer=[])`, `openImage(file)`, `dispose()`. Cada instancia administra una época y correlaciona respuestas por ID; solo actualiza revisión con confirmación válida.

- [ ] Escribir tests de respuesta fuera de orden, revisión incorrecta, cambio A→B durante render, mensaje inválido y Worker que termina. Ninguna respuesta vieja modifica `DocumentInfo` ni deja promesas pendientes.
- [ ] Ejecutar `node --test tests/photocraft-protocol.test.cjs`; observar RED.
- [ ] Implementar cola serial de mutaciones, agrupación de renders pendientes y buffers transferibles. El cliente conserva el Blob original; no transfiere su única copia de recuperación. Una cancelación descarta previews; no finge interrumpir una mutación ya ejecutada. Terminar Worker exige recuperar desde último snapshot confirmado.
- [ ] Validar contrato y ejecutar una operación real Wasm con Playwright; prueba negativa con recurso Wasm 404. Ejecutar ambos tests hasta GREEN.

### Task 3: Interfaz móvil de una sola foto

**Files:** crear `next/index.html`, `next/editor.css`, `next/editor.js`, `next/viewport.js`, `tests/browser/photocraft-mobile.cjs`.

**Interfaces:** consumir EngineClient; controles Abrir, Luz, Añadir capa vacía, visibilidad de capa, Deshacer, Rehacer y Exportar. Un canvas de preview sin modelo editable Fabric.

- [ ] Escribir pruebas para 320×740, 390×844, 844×390 y 1440×1000: foto entera dentro del viewport, controles de 44 px, ausencia de solapamiento y estado de carga visible.
- [ ] Ejecutar prueba y observar RED por ruta/controles ausentes.
- [ ] Implementar shell táctil, layout con safe-area y panel desplazable. Slider Luz prepara preview descartable; Aplicar confirma una acción y Cancelar conserva revisión e imagen. El puente implementa la transacción temporal necesaria sin acumular undo por evento.
- [ ] Añadir zoom/paneo con Pointer Events sin desplazar accidentalmente controles; transformación de vista independiente del documento y exportación. Al girar pantalla reajustar la vista sin cambiar píxeles.
- [ ] Verificar JPEG orientado, PNG transparente, archivo inválido y nueva apertura durante carga. Los errores conservan foto anterior hasta que el nuevo documento esté preparado.
- [ ] Ejecutar tests móviles y de protocolo hasta GREEN e inspeccionar capturas.

### Task 4: Proyecto recuperable aislado y exportación

**Files:** crear `next/project-store.js`, `next/project-controller.js`, `tests/browser/photocraft-project.cjs`; ampliar `next/editor.js`.

**Interfaces:** `save(snapshot):Promise<void>`, `loadLatest():Promise<ProjectSnapshot|null>` sobre base separada `photo-ia-photocraft-dev`; `downloadOriginal()` y `exportImage('image/png')`. Restaurar estado confirmado; historial solo durante sesión en esta entrega.

- [ ] Escribir tests de bytes originales, serialización/reapertura de capas, cuota simulada con rollback y cancelación sin autosave. Comprobar que `photo-ia-projects` no se modifica.
- [ ] Ejecutar prueba y observar RED.
- [ ] Guardar documento, original y metadatos en una transacción. Serializar solo estados confirmados; invalidar trabajos viejos mediante época y revisión. Mostrar guardado pendiente/completado/fallido con reintento y exportación.
- [ ] Exportar desde motor con tamaño nativo y alfa; descargar original byte por byte. Rechazar exportación que supere presupuesto sin modificar documento. No guardar el preview como foto final.
- [ ] Ejecutar test hasta GREEN; documentar que una recarga conserva edición y capas, no el undo completo.

### Task 5: Validación de viabilidad y cierre de la primera entrega

**Files:** crear `tests/browser/photocraft-foundation.cjs`, `docs/photocraft-web-validation.md`; actualizar README con acceso de desarrollo y build, sin reemplazar scripts, manifest ni caché de la app estable.

**Interfaces:** consumir tareas 1–4; producir informe reproducible con commit/toolchain/dispositivo, tamaño bundle, tiempos y límites observados.

- [ ] Probar fixture 4032×3024: abrir→ajustar→añadir capa→ocultar/mostrar→Undo/Redo→guardar→recargar→exportar; comparar dimensiones, alfa, original y estado de capas.
- [ ] Registrar carga fría/caliente, tiempos p50/p95 de preview y exportación, tamaño de memoria Wasm y señales observables de fallo. No afirmar medir toda la memoria Safari desde `memory.buffer.byteLength`.
- [ ] Probar caída Worker, descarga interrumpida y cierre durante guardado. UI recuperable, sin pérdida de último snapshot y sin estados de éxito falsos.
- [ ] Ejecutar `node tests/run.cjs`, `node tests/browser/run.cjs`, tests Rust y `git diff --check`; adaptar ejecutores para omitir expresamente los escenarios Wasm solo cuando se ejecuta la suite heredada sin artefactos, nunca contarlos como aprobados.
- [ ] Revisar visualmente capturas y solicitar una revisión independiente del cambio completo. Resolver defectos importantes y repetir pruebas afectadas.
- [ ] Registrar Safari físico como pendiente si no está disponible. Entregar ruta de desarrollo y pasos de prueba al usuario, sin promoverla a sustituto de producción.
- [ ] Usar mediciones para preparar siguiente plan: adaptadores IA (entrega 2), luego galería/migración/PWA (entrega 3). Mantener la migración de proyectos antiguos como copia conservadora conforme a la spec.

## Autorrevisión del plan

Contratos compartidos coherentes: Wasm→Worker→cliente→UI/persistencia. Los cinco riesgos tienen pruebas asignadas. La base conserva PHOTO IA actual, permite validar la arquitectura con una app funcional y no promete integración IA ni migración terminadas prematuramente. La ausencia de toolchain en PATH y la prueba Safari física son dependencias explícitas, no resultados asumidos.

## Ejecución

Propuesta: ejecución directa en esta conversación y una revisión independiente al final, siguiendo el método usado anteriormente. Esperar revisión del plan antes de implementar. No solicitar confirmaciones entre tareas autorizadas; comunicar bloqueos reales y resultados.
