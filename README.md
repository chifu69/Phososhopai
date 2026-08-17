# PHOTO IA 15.11 — iPhone Stable Local AI

Esta versión prioriza estabilidad en iPhone/Safari.

## Selección IA local
- Busto / identificación: motor local + recuperación anatómica.
- Rostro preciso: motor semántico local en iPhone.
- Piel: motor semántico local en iPhone.
- Cabello: motor semántico local en iPhone.
- Ropa: motor semántico local en iPhone.
- Persona completa: motor local en iPhone.
- Objeto por toque: mantiene Interactive Segmenter/fallback donde aplique.

## Estabilidad
En iPhone las funciones anteriores ya no intentan ejecutar primero MediaPipe multiclase en el hilo principal de Safari, evitando los congelamientos observados. MediaPipe sigue disponible para otros navegadores/equipos y ONNX Runtime Web permanece integrado para futuros modelos.

## Alienware
El Alienware sigue siendo opcional para tareas generativas pesadas. Las selecciones indicadas arriba están diseñadas para funcionar en el teléfono.
