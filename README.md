# PHOTO IA 15.35 — Hair Crown Contour Fix

Esta versión parte de PHOTO IA 15.33 y corrige específicamente dos problemas vistos en pruebas reales en iPhone.

## Vestido 👗
Cuando la persona lleva una prenda de una sola pieza, usa **Vestido**. PHOTO IA toma la prenda completa de la máscara de ropa y no la fuerza a dividirse en Top/Pantalón. La opción aparece en Selección IA y en Color de ropa.

## Tono de piel natural
El control Aclarar/Oscurecer ahora es deliberadamente más sutil (±50). Conserva sombras, altas luces y textura, y evita empujar la piel hacia blanco/gris.

## Conservado de 15.33
Face/Busto redundante, OpenCV fallback, estabilidad de Camisa/Pantalón/Zapatos, cabello con textura y Retoque corporal sutil.


## Hair Crown Contour Fix
- Hair selection now repairs small gaps at the crown and upper sides without expanding freely into the background.
- Removed erosive cleanup from the hair-specific path so fine top-of-head strands are less likely to be shaved off.
- The semantic hair class remains the authority; repair is constrained to pixels already classified as part of the person.
