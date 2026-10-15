# PHOTO IA 15.42.0 — Proyectos recuperables

Conserva el archivo original, exporta independientemente del tamaño de pantalla y recupera el último proyecto guardado en este dispositivo. Las mejoras y el historial mantienen los retoques anteriores. Consulta `CHANGELOG-15.42.0.md`.

## Antecedentes: PHOTO IA 15.40.0 — Advanced Selection

Esta versión sube la pestaña de selección a un nivel más avanzado.

## Novedades
- botón **🧠 Sujeto HD** para una selección de sujeto con refinado inicial
- afinado avanzado de máscara con **expandir, encoger, suavizar, invertir y solo principal**
- estadísticas rápidas de la selección actual
- integración directa con **AI Fill** y recorte
- nuevas utilidades expuestas por `PhotoSegmentation` para edición de máscara

Consulta `CHANGELOG-15.40.0.md`.

### PHOTO IA 15.42.0 — retoques locales y proyectos

- **Pincel de luz y color** en Ajustes: pinta una zona, cambia luz, temperatura y saturación, ajusta suavidad e intensidad y aplica. Puedes borrar parte de la zona o limitarla a una selección IA.
- **Corrector / Clonar** en Limpiar: pulsa Elegir origen, toca una zona limpia y pinta el detalle. Clonar copia la muestra; Corrector adapta su tono al destino. Está pensado para detalles pequeños, no para reconstruir objetos grandes.
- **Mis proyectos** en Inicio y Limpiar: abre, renombra o elimina proyectos guardados en este dispositivo. La migración conserva el proyecto anterior y su original. Descarga copias importantes: borrar los datos del navegador también elimina esta galería.
- Los trazos se guardan como operaciones y se reproducen a resolución nativa. Cancelar no confirma el retoque; Aplicar permite deshacer/rehacer. No se envían fotos a servidores para estas herramientas.

La validación automatizada usa Chrome con tamaños de teléfono, paisaje y escritorio. No sustituye una prueba en Safari de un iPhone físico.

## Nuevo estudio PhotoCraft — base de desarrollo

El diseño aprobado para iPhone/navegador tiene una primera base separada en `/next/`. Usa el motor **real PhotoCraft** compilado a WebAssembly en un Worker: JPEG/PNG, luz, capas vacías y visibilidad, undo/redo, recuperación de un proyecto, original independiente y exportación PNG. Las herramientas IA y la galería antigua todavía no están migradas. La app 15.42 y sus datos siguen intactos.

Compila siguiendo `integrations/photocraft/UPSTREAM.md`, sirve la raíz con `python3 scripts/serve-photocraft.py` y abre `http://localhost:8776/next/`. Los artefactos Wasm se generan y no están incluidos en Git. La instalación Rust debe satisfacer el mínimo 1.95 de PhotoCraft.

Pruebas: `node --test tests/photocraft-protocol.test.cjs`, `cargo test --locked --manifest-path integrations/photocraft/bridge/Cargo.toml` y, tras compilar, `node tests/photocraft-browser/run.cjs` (requiere Playwright/Chrome; admite `PLAYWRIGHT_MODULE` y `CHROME_PATH`). La suite nueva está separada de las regresiones de la app estable y falla explícitamente si faltan artefactos. Consulta `docs/photocraft-web-validation.md` para límites y resultados. Safari en iPhone físico aún pendiente.
