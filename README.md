# PHOTO IA 15.33 — Selection Stability + Body Retouch

Base: PHOTO IA 15.32 Core Stabilization.

## Correcciones principales
- **Camisa / Top, Pantalón / Shorts y Zapatos:** el motor ya no confía ciegamente en una sola postura. Usa una imagen de mayor resolución para Pose Landmarker, valida el tamaño/posición de la máscara y, si la postura sale inestable, reconstruye la prenda desde la máscara completa de ropa con una región determinista. Esto evita el fallo intermitente donde solo se seleccionaba un parche pequeño.
- **Rostro preciso y Busto / ID:** Face Landmarker ahora trabaja con una entrada móvil de mayor resolución y permanece caliente en el Worker. Si aun así no detecta la cara, PHOTO IA usa una segunda ruta local basada en persona + ancla facial/tono de piel; Busto / ID usa además el constructor anatómico redundante.
- **Worker MediaPipe:** Selfie Segmenter, Multiclass, Face Landmarker y Pose Landmarker se reutilizan en vez de crearse/cerrarse en cada toque. Esto reduce descargas, carreras e inconsistencias entre intentos.
- **Smart → Analizar fotografía:** espera a que OpenCV termine de iniciar. Si OpenCV no está disponible después del tiempo razonable, el análisis continúa con un motor Canvas local compatible en lugar de fallar con “OpenCV no está listo”. Aplicar recomendación también tiene ruta local compatible.
- **Color de cabello:** nuevo colorizador que conserva la luminancia de mechones/sombras como autoridad y aplica crominancia + aclarado/oscurecido limitado. Se reduce el aspecto de “pintura sólida”.
- **Retoque corporal sutil:** nueva opción **Abdomen** o **Cintura + abdomen**, intensidad 0–40%, con Vista previa, Aplicar, Cancelar y Undo. Usa Pose Landmarker y un warp local limitado para evitar cambios exagerados.

## Diseño de seguridad visual
- La herramienta corporal está limitada deliberadamente: incluso 40% en el control equivale a una contracción local moderada, no a una deformación extrema.
- Rostro/hombros quedan fuera de la zona principal del warp.
- Las selecciones de prenda se validan antes de mostrarse; una máscara pequeña o anatómicamente fuera de lugar se descarta y se reconstruye.

## Limitaciones conocidas
- El master móvil sigue limitado aproximadamente a 2000 px, igual que 15.32.
- OpenCV y modelos MediaPipe pesados siguen siendo opcionales/cacheables y no están físicamente incluidos en este ZIP pequeño; cuando OpenCV no está disponible, Smart Analysis tiene fallback local.
- El retoque corporal es un warp 2D sutil. En fondos con líneas geométricas pegadas al cuerpo, intensidades altas pueden producir una pequeña curvatura; por eso el valor predeterminado es 15%.
