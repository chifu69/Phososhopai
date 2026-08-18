# PHOTO IA 15.23 — Smooth Neck Transition + Stable Worker

- Ropa y Cabello NO se modificaron.
- Worker/MediaPipe/WASM/modelos permanecen como en 15.22.
- Busto/ID:
  - Cabeza/contorno superior de 15.22 se conserva.
  - Hombros/pecho de 15.21/15.22 se conservan.
  - Solo cambia la transición mandíbula → cuello → hombros.
  - La unión ahora se ensancha gradualmente y mezcla landmarks con Selfie Segmentation.
  - Se elimina el puente rectangular/horizontal y se aplica un blur local muy suave solo en esa banda.
