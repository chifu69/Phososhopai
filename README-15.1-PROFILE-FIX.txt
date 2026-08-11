PHOTO IA 15.1 — Wardrobe Profile Fix

Problem:
PHOTO IA 15.0 sent:
  profile=wardrobe_only

The current Alienware Bridge only has the registered profile:
  smart_edit

That caused:
  Perfil desconocido: wardrobe_only

Fix:
- Wardrobe Engine now sends profile=smart_edit
- It still sends mode=change_clothes
- It still sends task=wardrobe_only
- It still sends the original photo without local masks
- No Alienware/ComfyUI model reinstall is required
- Cache/version bumped to 15.1 so Safari/PWA loads the corrected engine

Expected result:
The request should pass the profile validation and proceed to the existing
Alienware wardrobe ROI / semantic parser flow.
