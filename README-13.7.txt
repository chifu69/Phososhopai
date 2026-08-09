PHOTO IA 13.7 — Bust Anchor Engine

Built from the working 13.6 Smart Selection Engine.

Selection IA improvements:
- Busto / identificación no longer reuses the skin/contrast mask as its main decision.
- Adds a face anchor: native FaceDetector when available, then a local skin anchor, then person-bounds fallback.
- Builds a continuous anatomical bust matte around head, hair/accessories, neck, shoulders and upper torso.
- Adds validation that rejects patchy face-only masks and masks that take too much background.
- Adds an automatic second-pass fallback when the first bust result is invalid.
- Keeps the stable local engine and avoids model-loading freezes on iPhone.
- New cache/version 13.7 prevents stale 13.6 scripts on GitHub Pages.

No folders are required in the ZIP; files stay flat for manual GitHub upload.
