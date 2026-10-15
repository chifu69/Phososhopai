# PHOTO IA + PhotoCraft para iPhone y navegador

Estado: propuesta para revisión; no implementada.

## Objetivo confirmado

Rehacer PHOTO IA como una sola aplicación combinada con PhotoCraft, priorizando iPhone y navegador. Una foto, un documento, un historial y una galería, con controles táctiles y las herramientas fotográficas de PHOTO IA.

## Evidencia y supuestos

PHOTO IA actual es una PWA JavaScript/Fabric con proyectos IndexedDB, original independiente y operaciones serializadas. Su base publicada es 15.42.0. PhotoCraft se examinó en el commit `4e7a17cd5d5723313f459753663d0d155f047e19`: tiene motor Rust separado de la interfaz, comandos mediante Session, formato .pcraft y frontend web Wasm/egui. La distribución web existente no proporciona por sí sola la integración JavaScript necesaria para PHOTO IA.

Referencias: https://github.com/storytold/photocraft/tree/4e7a17cd5d5723313f459753663d0d155f047e19/apps/photocraft-web y https://github.com/storytold/photocraft/blob/4e7a17cd5d5723313f459753663d0d155f047e19/NOTICE.

Supuestos propuestos: mantener nombre PHOTO IA, español, edición local, PWA instalable y despliegue estático. No añadir cuentas, suscripciones ni servidor obligatorio. Modelo y versión de iPhone aún no especificados: compatibilidad física y rendimiento pendientes de medir.

## Alternativas

1. **Recomendada: interfaz web táctil PHOTO IA sobre motor PhotoCraft.** Un adaptador Rust/Wasm propio conecta documentos y comandos con la interfaz. Mayor trabajo inicial, pero permite un historial común y reutilización real del motor.
2. Incorporar solo filtros y herramientas aisladas de PhotoCraft al motor actual. Menor migración, pero conserva el modelo Fabric y limita las capacidades profesionales reutilizadas.
3. Adaptar el frontend egui web existente de PhotoCraft. Aprovecha más interfaz de escritorio, pero exige adaptar densidad, gestos y accesibilidad a iPhone y portar la integración de herramientas IA.

## Arquitectura propuesta

- Interfaz HTML/CSS táctil: Inicio/Proyectos, editor y exportación. Barra inferior con Mejorar, Ajustes, Retoque, Capas y Guardar; controles con áreas táctiles de al menos 44 px. Paneles desplazables fuera del área medida de la foto, respetando zonas seguras y teclado.
- Motor: una sesión PhotoCraft por documento activo. Capas, máscaras, operaciones y undo/redo pertenecen a esa sesión; Fabric no mantiene un segundo documento editable dentro del nuevo editor.
- Puente propio: importar imagen/proyecto, consultar metadatos/capas, ejecutar comandos permitidos, producir previsualización, aplicar resultados IA con máscara, undo/redo, serializar proyecto y exportar. Cada petición lleva identificador, documento, época y revisión esperada. No se da por existente este puente en upstream.
- Ejecución: Wasm en Web Worker, comandos en serie y buffers transferibles. Previsualizaciones limitadas y agrupación de eventos táctiles. Si el motor seleccionado no compila o no puede ejecutarse en Worker, se revisa la arquitectura antes de migrar producción.
- Presentación inicial: composición CPU del motor y entrega de preview a canvas; evaluar GPU después de medir. No hacer de WebGPU una condición obligatoria para la primera versión.
- IA: adaptadores para análisis/mejora, ropa, cabello, piel y selección. Reciben una captura de la capa elegida y devuelven un resultado preparado que se confirma como una única acción deshacible. Conservan protección de objetos y cobertura de ropa en selfies recortadas.
- La fuente original permanece almacenada e intacta. Cuando un retoque IA tenga resolución limitada, se informa su resolución efectiva; no se describe un resultado reescalado como detalle nativo.

## Datos, historial y recuperación

Nuevo almacenamiento versionado con catálogo, original, documento .pcraft y metadatos PHOTO IA. Las escrituras se confirman de forma atómica; un fallo de cuota mantiene la última versión válida y ofrece exportar/reintentar. Evitar autosaves de previews, resultados atrasados y resurrección de proyectos eliminados.

La conversión de proyectos 15.42 crea una copia y conserva la base antigua. El primer importador preserva el original y la apariencia mediante una capa rasterizada del resultado confirmado; no promete convertir texto, máscaras o historial Fabric a elementos editables equivalentes. Etiquetar la copia como importada y mantener el proyecto antiguo disponible durante la transición. Conversión editable detallada queda fuera de la primera entrega.

Undo/redo es común a todas las herramientas durante la sesión. La galería restaura el estado confirmado; no prometer persistencia de todo el historial PhotoCraft entre recargas sin verificar y diseñar su serialización. Conservar el historial antiguo dentro del proyecto original sin migrarlo destructivamente.

## Entregas y criterios de aceptación

### 1. Base técnica verificable

Crear una ruta de desarrollo separada sin sustituir la app publicada. Compilar un puente mínimo contra el commit fijado. Abrir JPEG/PNG de 12 MP, mostrar preview, ejecutar un ajuste y una operación de capa, deshacer/rehacer, guardar/cargar y exportar. Registrar tamaño descargado, latencia, memoria Wasm y límites de imagen. Probar navegación móvil, orientación y cancelación. Safari físico es requisito antes de promoverlo como sustituto para iPhone; las pruebas de escritorio/emulación no lo reemplazan.

Objetivos iniciales de experiencia: UI utilizable mientras carga el motor, controles sin solapamiento, interacción de preview sin pausas prolongadas y ninguna pérdida ante cancelación o fallo. Medir latencias p50/p95 con dispositivo identificado y fijar los presupuestos definitivos según esos resultados antes de ampliar la migración. Rechazar dimensiones que superen el presupuesto con opción explícita de copia reducida; nunca reducir el original silenciosamente.

### 2. Editor móvil unificado

Conectar herramientas básicas, capas y máscaras con la misma sesión. Integrar mejora automática y retoques especializados por adaptadores. Cada Aplicar crea una acción, Cancelar no altera el documento, y resultados antiguos no afectan otra foto. Validar tacto, zoom, paneo, orientación, transparencias y alineación de capas.

### 3. Galería, transición y publicación

Añadir persistencia, importación conservadora de proyectos anteriores y actualización PWA coherente. Validar falta de cuota, interrupción, recarga, borrado concurrente, bytes del original y exportación de tamaño completo. Publicar únicamente después de revisión del resultado; commit/push requieren autorización para esta nueva versión.

## Licencias y alcance

Conservar licencia elegida MIT/Apache-2.0, avisos y atribuciones aplicables del código/dependencias incorporados. Mantener identidad PHOTO IA; no reutilizar marcas o logotipos ArtCraft. Fijar código y dependencias para reproducibilidad.

Fuera de la primera entrega: aplicación nativa/App Store, servicios en nube, paridad total con Photoshop/PhotoCraft, compatibilidad PSD completa garantizada, todas las herramientas de escritorio y migración editable perfecta de proyectos Fabric.

## Validación y riesgos abiertos

Tests del contrato JS/Wasm, píxeles/alpha, historial, revisión/época, persistencia y exportación; pruebas browser de interfaz y comparación visual con fixtures. Conservar las regresiones existentes de ropa y cobertura. Riesgos por resolver en la base técnica: compilación del conjunto mínimo de crates, servicios del engine que dependen del host, consumo de memoria al pasar píxeles, coste de composición y serialización, soporte real de Safari y tamaño final del bundle. La existencia del frontend web upstream no demuestra que el puente propuesto esté listo.
