# PHOTO IA 15.37.0 — Studio interface

- Graphite default theme with a violet accent; keep an explicitly saved light theme.
- Consistent inline SVG navigation icons and persistent labels. Mobile uses a scrollable bottom dock with touch-sized controls; desktop uses a wider side rail.
- Refined photo opening screen, typography, panel borders, spacing and main action styling. Add an always-visible file-opening label.
- Align adaptive canvas/panel dimensions with the dock and desktop breakpoint.
- Keep editor control IDs and photo-processing algorithms unchanged.
- Version and service-worker cache bumped to 15.37.0.

Validation: isolated Chromium layout checks at 320, 390 and 1440 px, panel open/close, dock visibility, no horizontal document overflow; existing processing tests and JavaScript syntax checks. Layout checks intentionally skip remote models and editor libraries. Full editing on a physical iPhone remains to be checked.
