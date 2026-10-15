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
