# PhotoCraft montage implementation plan

> **For agentic workers:** Use superpowers:executing-plans, inline execution.

**Goal:** Combine own head/body photographs in the PhotoCraft web editor with editable source masks and a professional responsive interface.
**Architecture:** Rust maintains a temporary source session, builds native masked smart layers and commits each confirmed candidate with Session.edit. JavaScript provides source selection, placement and controls; the Worker remains the only engine boundary.
**Tech Stack:** pinned PhotoCraft Rust/Wasm, ES modules, IndexedDB, Playwright.
**Spec:** ../specs/2026-10-16-photocraft-montage-and-interface-design.md

## Constraints
- Keep root PHOTO IA, clothing coverage, hair/skin/wardrobe and old storage untouched.
- Original source pixels embedded in native smart-object contents. Always regenerate from source.
- Preview/cancel cannot alter committed history. Save/export only confirmed state.
- Cap images before decode and cap simultaneous/placed pixels; no silent reduction.
- Touch targets 44px, panels reserve canvas space. Physical Safari validation remains pending.
- User explicitly approved implementation and final commit/push; no further approval gate.

## Review focus
- Reloaded smart sources must remain editable without accumulated resampling.
- Invalid or huge geometry must not allocate unbounded surfaces.
- Rapid previews/cancel/open must not display stale pixels.
- Tall/mobile/landscape panels must leave usable canvas space.
- Failure and storage quota must preserve confirmed documents.

### Task 1: Native montage
Files: bridge/src/montage.rs, bridge/src/lib.rs, bridge/tests/montage.rs, Cargo.toml/lock.
Interface: begin_montage(bytes), edit_montage(), montage_source(), preview_montage(params), commit_montage(params), cancel_montage(). JSON parameters use source pixel crop/points/strokes and destination center/scale/angle.
- [x] Add tests for masks, feather, transforms, cancellation, atomic undo/redo, saved-source re-edit and invalid geometry; observe RED.
- [x] Implement via native selection, masks, smart objects, compositor, filters and session history.
- [x] Run cargo tests; expect all PASS.

### Task 2: Worker and UI
Files: next/protocol.js, engine-worker.js, project-controller.js, montage.js, editor.js/html/css, viewport.js; tests/photocraft-browser/montage.test.cjs.
Interface: protocol actions beginMontage/editMontage/montageSource/previewMontage/commitMontage/cancelMontage; packed RGBA preview consistent with renderPreview.
- [x] Write browser workflow and cancel/reload/layout tests; observe missing controls RED.
- [x] Build source oval/polygon/refinement and placement controls with debounced latest previews, editable layers, thumbnails, delete/reorder, flat charcoal blue UI.
- [x] Build Wasm, run protocol and browser suites; expect PASS.

### Task 3: Release verification
Files: docs/photocraft-web-validation.md, next asset version references.
- [x] Inspect responsive screenshots; run native/protocol/browser/legacy suites and diff checks.
- [x] Fresh whole-change review; fix consequential findings with regression coverage.
- [ ] Summarize diff, commit changes, fast-forward main and push origin/main as authorized.
