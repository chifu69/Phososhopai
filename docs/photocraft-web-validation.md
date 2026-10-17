# Validación de la base PhotoCraft web — 2026-10-15

Estado: base de desarrollo funcional; no sustituye PHOTO IA 15.42. Ruta `/next/`.

## Implementado y comprobado

Motor Rust PhotoCraft real, compilado a Wasm y ejecutado dentro de Worker. Apertura JPEG/PNG, exposición con preview cancelable, selección/visibilidad de capas, capa vacía, deshacer/rehacer, guardado y recuperación de un proyecto aislado y exportación PNG nativa. La fuente original se conserva separada. Los proyectos antiguos no se modifican. Undo/redo es de sesión; la recuperación conserva documento/capas, no el historial completo.

Pruebas: 4 tests Rust del puente, 3 del protocolo y 6 escenarios browser nuevos. Casos: imagen inválida, Wasm ausente, fallo simulado del Worker, época antigua, selección de capa, cancelación, cuota con rollback, recuperación, bytes originales y exportación con transparencia. Los tests móviles comprueban 320×740, 390×844, 844×390 y 1440×1000; captura 390×844 inspeccionada.

La suite Node heredada y los 18 escenarios browser de PHOTO IA 15.42 también terminaron sin fallos. La primera ejecución browser encontró un fixture Fabric temporal ausente; tras restaurar la dependencia de prueba, se ejecutó la suite completa.

## Mediciones de laboratorio

Chrome headless en Mac ARM64; fixture sintética PNG 4032×3024 (color constante con columna transparente). No representa una fotografía compleja, una descarga móvil ni un iPhone. Boot usa servidor local y puede aprovechar caché de compilación; no es una medición de carga fría móvil.

| Medida | Resultado |
|---|---:|
| Wasm sin comprimir | 27.29 MiB |
| Wasm gzip calculado | 7.64 MiB |
| Inicialización local | 34.3 ms |
| Abrir fixture | 77.4 ms |
| Preview p50, 5 muestras | 95.7 ms |
| Preview p95 estimado, 5 muestras | 153.4 ms |
| Exportar PNG nativo | 388.6 ms |
| Memoria lineal Wasm observada antes de exportar | 384.44 MiB |

Cinco muestras solo orientan; no permiten un presupuesto p95 de producción. Memoria lineal Wasm no equivale al uso total del navegador ni mide el pico durante exportación. El tamaño y la memoria requieren optimización/medición física antes de una sustitución móvil.

## Límites explícitos

24 millones de píxeles, 16384 por lado y archivo de entrada de 64 MiB son topes iniciales, no garantía de caber en memoria de iPhone. Historial limitado a 15 estados/128 MiB de presupuesto upstream. Proyectos cargados tienen límite de descompresión de 256 MiB. Se informa el rechazo sin reducir silenciosamente el original.

No incorporadas todavía: herramientas IA de PHOTO IA, migración de la galería anterior, PSD como función de interfaz, distribución PWA del nuevo editor y optimización de carga móvil. Artefactos JS/Wasm están generados localmente, ignorados por Git; la publicación necesita ejecutar el build y empaquetar licencias/dependencias.

## Revisión

La revisión independiente detectó que Luz actuaba sobre una capa vacía sin efecto visible. Se reprodujo y corrigió con selección explícita, capa activa visible, bloqueo del ajuste sobre capa vacía y prueba de igualdad preview/aplicación. La revisión independiente se interrumpió por un límite del servicio y no se presenta como una revisión completa terminada. Se completaron pruebas propias adicionales.

## Pendiente para promover a iPhone

Probar Safari en dispositivo físico identificado: instalación/carga fría, fotografías reales 12 MP, presión de memoria, orientación/gestos, cierre/reapertura y exportación al carrete. Medir presupuesto real y optimizar composición/descarga antes de migrar todas las herramientas. No se dispone de esa evidencia en esta sesión.

## Estudio 0.2 — montaje, 17 de octubre de 2026

Montaje manual de fotos propias: máscara ovalada o poligonal, suavizado y trazos ocultar/recuperar; posición, escala, rotación, reflejo, opacidad, exposición y temperatura. La inserción se confirma en un paso nativo de historial. Las capas son objetos inteligentes PhotoCraft con una fuente `.pcraft` incrustada: conserva el raster original y la máscara, y permite regenerar el montaje sin remuestreo acumulativo. Los parámetros de edición se guardan en un bloque de capa preservado por el formato nativo. La composición, selección, máscaras, transformaciones, filtros, historial y formato pertenecen a PhotoCraft; JavaScript aporta la interfaz y los gestos.

La interfaz usa superficies planas carbón y acento azul, menús funcionales, miniaturas de capas, visibilidad, orden y eliminación. Los paneles reservan espacio y se desplazan internamente en iPhone; no flotan sobre la foto. Los módulos y Wasm de `/next/` llevan versión `0.2.0`. El service worker de PHOTO IA excluye ese directorio para no contaminar el shell estable/offline; la versión de la app estable continúa siendo 15.42.0.

Verificación realizada:

- Rust: 9 pruebas (4 existentes + 5 de montaje), incluyendo píxeles ajenos al recorte, máscara oval/polígono, feather, ocultar/recuperar, ajuste/alfa, transformación sin degradación acumulativa, preview/export, cancelación, undo/redo, fuente editable tras recarga, orden/borrado y rechazo de presupuesto agregado.
- Navegador real con Wasm: 8 escenarios completos; flujo de montaje, máscara al recuperar el mismo punto, escala/giro/reflejo, arrastre en coordenadas del documento, cancelación, guardado/reapertura, fuente editable, cuatro tamaños de ventana, errores de entrada/motor/cuota y aislamiento de IndexedDB.
- Protocolo: 3 pruebas; caché: nueva prueba que reproduce y evita la interceptación de `/next/` por el worker antiguo.
- Regresiones PHOTO IA: suite Node y 18 escenarios de navegador aprobados (ropa, Smart, retoques, galería, historial y persistencia).
- Revisión independiente del cambio: encontró restauración omitida en el mismo punto y falta de presupuesto agregado; ambos reproducidos en pruebas fallidas y corregidos.

Memoria del montaje: fixture base 1200×1000 + fuente 1000×1000; 12 previews con máscara y giro distintos. Antes de la corrección, la memoria lineal Wasm creció 85.56 MiB entre la segunda y última muestra. Después: máximo observado **59.25 MiB**, crecimiento **0 MiB**, tiempo por preview aproximadamente **408–495 ms** en Chrome headless/Mac ARM64. Se evita el caché global de variantes del motor de escritorio usando directamente sus mismas funciones nativas de composición, transformación y filtros para el candidato temporal. No es una medida de memoria total del navegador, pico de exportación, fotografías reales ni Safari.

El adaptador rechaza antes de decodificar cuando la estimación de fuentes/capas existentes y buffers de trabajo supera 16 millones de píxeles equivalentes; vuelve a validar la colocación transformada y comprueba memoria de documento/historial. El límite es conservador: dos fotos grandes pueden requerir copias de trabajo más pequeñas. No se reduce silenciosamente ningún original. La publicación del código no publica automáticamente los binarios: ejecutar `scripts/build-photocraft.sh` e incluir `next/engine/` y sus avisos/licencias en el despliegue. Safari físico sigue pendiente antes de sustituir la app estable.
