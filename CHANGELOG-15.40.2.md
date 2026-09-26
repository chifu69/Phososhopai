# PHOTO IA 15.40.2 — Visible photo and panel layout fix

- Match Fabric canvas dimensions to the visible wrapper instead of calculating a separate photo-ratio height that could be clipped by CSS.
- Observe wrapper size changes so opening panels, resizing, rotating and browser chrome changes refit the photo and keep layers registered.
- Measure actual sheet/dock boundaries including safe areas. Reserve space for the complete photograph instead of subtracting an approximate fraction of panel height.
- Use a side panel on short landscape screens. Remove legacy canvas min/max-height constraints and sheet animations that made layout measurements stale.
- Bump app and service-worker cache to 15.40.2.

Validation: regression test initially reproduced a 608px internal canvas in a 180px visible area; now verifies matching dimensions, portrait and rotated-image containment, stable repeated fits. Browser geometry checks cover 320px, 390px, desktop and landscape, including no panel/photo intersection. Existing garment and smart enhancement tests retained.

Loaded-image verification: Chromium with the app's Fabric 5.3.1 engine and a 600×1200 test image passed in 390×844, 320×740, 1440×1000 and 844×390 viewports, with panels open and closed. All photo bounds fit within the visible canvas, whose dimensions matched its wrapper. AI engines were excluded from this layout-only browser check. Physical iPhone validation remains outstanding.
