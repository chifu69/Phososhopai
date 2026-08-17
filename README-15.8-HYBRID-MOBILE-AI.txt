PHOTO IA 15.8 — HYBRID MOBILE AI

Objetivo
- Hacer que Selección IA funcione principalmente en el teléfono.
- Usar MediaPipe real antes de heurísticas locales.
- Instalar ONNX Runtime Web como segundo motor local para futuros modelos ONNX.

Cambios principales
1. MediaPipe SelfieMulticlass es ahora el motor principal de:
   - Cabello (clase 1)
   - Piel corporal + facial (clases 2 + 3)
   - Rostro preciso (clase 3)
   - Ropa (clase 4)
   - Persona completa (clases de persona)
2. Persona completa usa primero MediaPipe Selfie Segmenter.
3. Objeto por toque usa primero MediaPipe Interactive Segmenter v2 con un punto positivo.
4. Los métodos anteriores se conservan únicamente como fallback si MediaPipe no está disponible.
5. Photo ID/Busto continúa usando foto completa + restricciones en AI Studio, sin máscara obligatoria.
6. ONNX Runtime Web 1.23.0 queda integrado como motor WASM, 1 hilo en iPhone para estabilidad.
7. Service Worker puede descargar y cachear MediaPipe, modelo multiclass (~16 MB), Interactive Segmenter y ONNX Runtime para uso posterior.
8. Si el Service Worker aún no controla la página, MediaPipe y los modelos tienen fallback directo a las fuentes oficiales/CDN.

Primera prueba recomendada
- Con internet, abrir una foto clara de una persona.
- Probar en orden: Cabello, Piel, Rostro preciso, Ropa, Persona completa, Objeto por toque.
- Cada selección debe verse claramente distinta.
- La primera vez puede tardar más mientras descarga el modelo multiclase.

Notas
- El modelo SelfieMulticlass oficial de MediaPipe produce: 0 fondo, 1 cabello, 2 piel corporal, 3 piel facial, 4 ropa, 5 accesorios.
- ONNX Runtime está instalado e integrado, pero esta versión no fuerza un modelo ONNX adicional si MediaPipe ya resuelve la tarea; queda disponible para próximos modelos especializados.
