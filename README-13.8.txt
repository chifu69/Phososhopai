PHOTO IA 13.8 — Multi-Pass Selection Engine

Selección IA mejorada para iPhone sin depender del Alienware.

Busto / identificación ahora usa una arquitectura multipaso inspirada en flujos profesionales de selección:
- ancla facial
- prior anatómico de cabeza/cuello/hombros
- separación sujeto/fondo
- OpenCV GrabCut cuando está disponible
- comparación y puntuación de candidatos
- fusión de máscaras
- refinamiento sensible a bordes
- recuperación automática en vez de mostrar error cuando una máscara falla validación

No copia código propietario de Adobe. Implementa técnicas equivalentes con componentes web/OpenCV disponibles para PHOTO IA.
