# PHOTO IA 15.18 — Natural Bust ID + Stable Worker

Cambios principales:
- Mantiene intacta la arquitectura estable de 15.16/15.17.1.
- Busto/ID usa Face Landmarker para posicionar la cabeza y el rostro.
- La parte superior es más conservadora para no incluir gorra/fondo innecesariamente.
- Cuello, hombros y pecho superior se recortan usando la máscara real de Selfie Segmentation.
- El borde inferior deja de ser una línea recta y se estrecha/feather de forma natural.
- Selfie Segmentation ayuda a dar forma; Face Landmarker sigue siendo la autoridad para localizar el ID.
