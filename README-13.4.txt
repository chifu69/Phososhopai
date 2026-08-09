PHOTO IA 13.4 — SELECTION IA REPAIR

Correcciones principales:
- Persona completa ahora intenta primero segmentación semántica IA y usa el motor local solo como respaldo.
- Busto / identificación conserva la silueta real de cabeza, cabello/gorra, cuello, hombros y torso superior en lugar de reutilizar una máscara facial.
- Solo rostro crea una región facial independiente y no reutiliza Busto.
- Solo piel detecta piel visible dentro de la persona, incluyendo cuello y brazos, sin convertir todo el busto en piel.
- Objeto por toque intenta el segmentador interactivo y cae a selección por color/bordes si el modelo no está disponible.
- Refinar máscara ahora cierra pequeños huecos y suaviza bordes sin cambiar de objeto.
- La máscara azul representa exactamente el área que recibirá la edición.
- Se conservan Identity Lock, Photo Critic y las mejoras de 13.3.

IMPORTANTE:
Después de subir esta versión, cierra PHOTO IA completamente y vuelve a abrirla para que el service worker 13.4 reemplace el caché anterior.
