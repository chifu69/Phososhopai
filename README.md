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
