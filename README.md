# PHOTO IA 15.30.2 — Garment Color Apply Fix

Causa encontrada:
La vista previa de color reemplaza internamente la imagen principal de Fabric.
El listener global `object:added` interpretaba ese reemplazo como si el usuario
hubiera abierto otra fotografía y ejecutaba `clearMask()`. Por eso la primera
vista previa borraba la máscara de Camisa/Pantalón/Zapatos y al pulsar Aplicar
aparecía “Selecciona una prenda primero”.

Corrección:
- La máscara se conserva durante la sesión de recoloreado.
- Preview ya no destruye la selección.
- Aplicar usa la misma máscara y luego la limpia al terminar.
- Cancelar restaura la imagen base.
- No se cambiaron Pose Landmarker, Selfie Multiclass, Piel, Cabello ni los modelos.
