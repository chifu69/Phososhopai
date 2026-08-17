PHOTO IA 15.10 — FAST LOCAL ID + MOBILE WATCHDOG

Fix principal:
- Busto / identificación NO espera MediaPipe en iPhone.
- Usa un motor local rápido para separar persona y una máscara anatómica para cabeza/cuello/hombros.
- La foto de análisis se reduce temporalmente a 256 px en el lado mayor para evitar bloqueos/memoria.
- Watchdog global: ningún selector local puede dejar el spinner infinito.
- En iPhone, MediaPipe para Rostro/Piel/Cabello/Ropa recibe ~7 s; si no responde, PHOTO IA cambia automáticamente al fallback local.
- Persona completa recibe ~6.5 s para MediaPipe y luego fallback local.
- Los errores/timeout siempre liberan el overlay y los controles.
- Alienware sigue reservado para tareas generativas pesadas.
- ONNX Runtime Web permanece disponible como segundo runtime para modelos futuros.

Nota:
Las carpetas locales de MediaPipe/ONNX se conservan, pero esta versión no depende de ellas para Busto/ID.
