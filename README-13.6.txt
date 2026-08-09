PHOTO IA 13.6 — Smart Selection Engine

Selection IA rebuilt from the stable 13.5 base.

- Hybrid local foreground engine: border-background analysis + portrait priors + connected components.
- Busto/identificación follows the detected subject instead of painting a rectangular face region.
- Solo rostro uses an adaptive head/face region constrained by the subject mask.
- Solo piel uses combined RGB + YCbCr skin detection and remains inside the person mask.
- Objeto por toque uses adaptive seeded region growing and stops oversized selections.
- Refinar máscara now closes small holes, removes isolated noise and feathers edges.
- iPhone-safe: no required model download and no blocking dependency for these core selection modes.
- Unified 13.6 cache/version labels to make testing on GitHub Pages unambiguous.

Important: no automatic selector can guarantee 100% accuracy on every possible photo. 13.6 is designed to fail safely and remain refinable rather than freeze or silently select unrelated background.
