PHOTO IA 15.5 — Profile Compatibility Fix

Problem found in PHOTO IA 15.4:
- Wardrobe Engine had already been corrected to send profile=smart_edit.
- AI Studio generic/background/scene edits were still sending profile=<task>, e.g. general_edit, background_only, scene_and_wardrobe.
- The current Alienware Bridge registers smart_edit, so those requests returned “Perfil desconocido” for almost every AI Studio operation.

Fix:
- All AI Studio /api/v1/edit requests now send profile=smart_edit.
- task remains unchanged so the server still knows the requested operation.
- Wardrobe Engine behavior remains unchanged.
- PWA/service-worker/cache versions bumped to 15.5 so iPhone does not keep the broken 15.4 ai-studio.js in cache.
- No ComfyUI model reinstall is required for this client-side profile mismatch.
