# PHOTO IA 15.30.1 — Garment Menu Wiring Fix

Corrección:
- 15.30 exportaba segmentGarmentUpper / segmentGarmentLower / segmentGarmentShoes sin haber creado esas funciones.
- Eso generaba un ReferenceError al cargar segmentation.js y dejaba sin inicializar window.PhotoSegmentation.
- 15.30.1 define correctamente los tres wrappers antes de exportarlos.
- Camisa/Top, Pantalón/Shorts y Zapatos vuelven a apuntar al Worker con los modos garment-upper / garment-lower / garment-shoes.
- No se modificaron los modelos, Piel, Cabello, Ropa, Persona, Busto/ID ni el pipeline del Worker.
