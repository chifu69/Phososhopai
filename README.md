# PHOTO IA 15.27 — Skin Tone Flow Fix

Corrección del botón Aclarar / oscurecer piel:
- Usa la máscara de Piel ya calculada; no vuelve a pintar el overlay celeste.
- El overlay se oculta mientras retocas.
- Slider -100 a +100 con preview local en vivo.
- Cancelar restaura exactamente la imagen previa y conserva la máscara.
- Aplicar crea un solo cambio confirmado, compatible con Undo.
- El ajuste cambia luminancia conservando crominancia/textura para evitar piel lavada.
- No se modificaron Persona, Busto/ID, Rostro, Piel, Cabello, Ropa, Worker, MediaPipe ni WASM.

## Fix 15.27
- Corregido el identificador interno de la máscara: el motor guarda `Piel`, mientras el panel 15.26 esperaba `skin`.
- Aclarar / oscurecer piel ahora reconoce la máscara real, oculta el overlay y abre el panel de retoque.
- No se cambió la segmentación de Persona, Busto/ID, Rostro, Cabello ni Ropa.
