# PHOTO IA 15.38.0 — Local AI Fill

## Nuevo
- AI Fill / Content-Aware completamente local durante la inferencia.
- Motor MI-GAN ONNX (ICCV 2023) mediante ONNX Runtime Web.
- Máscara independiente de la máscara normal de capas: rojo = zona que se reconstruirá.
- Pincel para marcar y restaurar selección.
- Expansión de máscara y suavizado de unión configurables.
- Recorte automático alrededor de la selección para reducir memoria y tiempo en iPhone/Safari.
- Inferencia limitada a un recorte de hasta 768 px por lado largo; el resultado se vuelve a integrar en la fotografía a resolución original.
- El resultado entra en el historial normal de PHOTO IA y puede revertirse con Undo.
- MI-GAN se guarda localmente después de instalarse/descargarse la primera vez.

## Privacidad
La foto y la máscara no se envían a Alienware ni a un servicio de inferencia. El modelo ONNX corre en el navegador con WASM. La primera instalación del modelo puede descargar aproximadamente 28 MB desde la fuente oficial; después queda en caché local.

## Compatibilidad
- Conserva Curvas, Máscara de capa, Wardrobe Engine, Smart Enhance, Garment Recolor, cabello, piel, Body Retouch, Vision Engine y Estudio IA.
- AI Fill usa WASM de un solo hilo por estabilidad en Safari/iPhone.
- Se corrigió además la salida de modos Dibujar/Máscara/AI Fill al cambiar de pestaña de Creative Studio.

## Pruebas
- `node tests/content-aware-math.test.cjs`
- `node tests/local-ai-fill-integration.test.cjs`
- Pruebas existentes de Smart Enhance y Garment Recolor.
