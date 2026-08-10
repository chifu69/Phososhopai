PHOTO IA 14.0 — Semantic Face & Skin Engine

Objetivo principal:
- Detectar rostro, piel, cabello y ropa como regiones independientes antes de generar.
- La máscara facial parte de un ancla facial y geometría del rostro, no del busto completo.
- La piel aprende el color de la propia cara en YCbCr y lo combina con priors anatómicos para reducir falsos positivos en ropa/fondo.
- Cabello se mantiene como región separada alrededor del rostro.
- Ropa se deriva de Persona - Rostro - Piel - Cabello.
- En cambios de ropa, PHOTO IA acepta píxeles generados solamente dentro de la máscara de ropa cuando está disponible.
- Rostro y piel se restauran desde la imagen original con adaptación de luz mínima.
- Nuevos controles visibles: Rostro preciso, Piel anatómica, Cabello y Ropa.

Nota: este motor mejora la separación semántica local sin depender de copiar código de Photoshop. La precisión final todavía depende de la claridad, resolución y pose de la foto.
