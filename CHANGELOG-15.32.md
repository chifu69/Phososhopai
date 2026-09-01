# PHOTO IA 15.32 — Core Stabilization Changelog

## Critical fixes
- Fixed hair/clothing palette luminance logic.
- Fixed stale preview winning after Cancel.
- Prevented Alienware/processed images from clearing creative layers.
- Fixed low-resolution viewport-based export behavior.
- Prevented crop from silently flattening an editable layered project.
- Fixed layer registration after viewport rotation/resize.

## Editing/history
- Centralized object-modification snapshots.
- Deduplicated identical history states.
- Added branch-aware history restoration.
- Rehydrated photo-adjustment sliders after Undo/Redo/history restore.
- Preserved global photo filters when applying localized skin/hair/clothing edits.
- Made Before/After non-destructive.

## Alienware
- Sends photo-only image data.
- Corrected Test Connection button binding.
- Corrected connection badge state.
- Added unexpected-error handling and progress timer cleanup.
- Returned AI results replace only the photo layer.

## Mobile/PWA
- Lighter 900 px localized previews with 140 ms debounce.
- Increased first model-load timeout.
- Aligned service-worker/build version to 15.32.
- Safer cache cleanup and error responses.
- Updated manifest/icons.

## Smart tools
- Natural, Portrait, Night, Document and Vivid buttons now perform real local edits instead of being dead controls.
