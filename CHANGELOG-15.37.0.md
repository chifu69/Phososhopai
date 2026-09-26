PHOTO IA 15.37.0 — Curvas de tono y máscara manual (Creative Studio)

NUEVO
=====
1. **Curvas de tono** (panel "CURVAS", debajo de Ajustes)
   - Editor de curva estilo Photoshop: canal RGB (maestro) + R, G, B por separado.
   - Toca la línea para agregar un punto, arrástralo para moverlo, doble toque
     para quitarlo (los dos extremos no se pueden borrar).
   - Interpolación monótona cubierta por Hermite (Fritsch–Carlson): sin
     "rebotes" ni inversión de tonos entre puntos. Verificado con
     tests/curves-math.test.cjs (identidad, extremos exactos, linealidad,
     monotonía, ausencia de hundimientos, composición maestro+canal).
   - Se aplica como filtro adicional de Fabric.js (fabric.Image.filters.Curves),
     conviviendo con Brillo/Contraste/Saturación/Temperatura/Nitidez/Desenfoque
     sin pisarlos (usa el mismo sistema de filtros con clave __key='curves').
   - Los puntos de control se guardan en photoAdjustments.curves y viajan con
     el resto del estado (deshacer/rehacer, exportar/reabrir). El filtro real
     se reconstruye siempre desde esos puntos —nunca depende de que el filtro
     de Fabric se serialice correctamente— así que un ciclo de deshacer/rehacer
     nunca deja la curva "fantasma" (visible en el editor pero no aplicada).

2. **Máscara manual** (herramienta 🩹 en la barra del lienzo + pestaña "Máscara")
   - Pincel para ocultar/revelar cualquier capa (la fotografía u objetos
     creados) sin destruir píxeles: usa un clipPath de Fabric respaldado por
     un canvas de máscara pintable.
   - Controles: tamaño de pincel, pluma (suavizado del borde), opacidad,
     modo Ocultar/Revelar, Invertir máscara, Restablecer, Quitar máscara.
   - Selecciona la capa en modo Mover (o deja ninguna para usar la foto),
     pulsa 🩹 Máscara y pinta directamente sobre el lienzo.
   - La máscara sobrevive a deshacer/rehacer y a recargar el proyecto: si el
     canvas de pintura interno no sobrevive la serialización, se reconstruye
     leyendo los píxeles ya guardados del clipPath existente en vez de
     empezar en blanco.

ARCHIVOS NUEVOS
================
 - curves-tool.js  (motor + UI de curvas; la parte matemática es aislada y
   corre también en Node sin navegador — ver tests/curves-math.test.cjs)
 - mask-tool.js    (pincel de máscara manual)
 - tests/curves-math.test.cjs

ARCHIVOS TOCADOS
==================
 - index.html: nuevo botón de modo "Máscara", panel "Curvas", pestaña
   "Máscara" en Creative Studio, y las dos etiquetas <script> nuevas.
 - app.js: expone replaceFilter/getFilters en window.PhotoIA (para que
   curves-tool.js reutilice el mismo sistema de filtros en vez de duplicarlo);
   dispara photoia:photo-replaced tanto en applyProcessedImageDataUrl como en
   restoreJSON para que las herramientas con estado propio (curvas) puedan
   resincronizarse cuando el objeto de la foto se reemplaza por dentro
   (recortar, restablecer, deshacer/rehacer).
 - creative-tools.js: nuevo modo de lienzo "mask" integrado al sistema
   existente de modos (move/draw/erase/sticker/text/shape); ya NO se llama
   canvas.discardActiveObject() al entrar en modo máscara, para que
   mask-tool.js pueda leer qué capa estaba seleccionada; se agregó el
   evento photoia:canvas-mode-changed.
 - sw.js / manifest.webmanifest: versión subida a 15.37.0 en cache, CORE y
   query strings; curves-tool.js y mask-tool.js agregados a CORE.

NO TOCADO
=========
 - connection-router.js: sin cambios (verificado por checksum MD5 antes y
   después de todo este trabajo: 850f725e21b04d94e241317342e0b212).

LIMITACIÓN CONOCIDA
=====================
 - Si el usuario deshace/rehace MIENTRAS está pintando activamente una
   máscara (poco común), la referencia interna a la capa objetivo puede
   quedar desactualizada hasta volver a entrar al modo Máscara. No afecta
   máscaras ya guardadas.
 - El editor de curvas y el pincel de máscara no se probaron en un navegador
   real (este entorno no tiene uno disponible); sí se verificó: sintaxis de
   los 22 archivos .js, la matemática de curvas con tests automatizados, y
   que las 4 suites de test existentes del proyecto siguen pasando. Conviene
   probar en un iPhone real antes de dar por cerrada esta versión.
