# CHANGELOG — PHOTO IA 15.33

## Selection Stability
- Task-specific segmentation resolution: Face/Bust/Pose 640 px on mobile, Garment 512 px, semantic masks 320 px.
- Persistent MediaPipe worker models; no close/recreate on every inference.
- Face/Bust local redundant fallbacks.
- Garment result quality checks + deterministic clothing-region fallback.
- Pose API exported for local body retouch.

## Smart / OpenCV
- OpenCV readiness promise with polling and late-load detection.
- Smart Analyze waits for OpenCV and falls back to Canvas analysis rather than erroring.
- Smart Apply can use the existing local pixel recipe when OpenCV is unavailable.

## Hair
- Replaced full HSL hue/luminance replacement with luminance-preserving chroma tint and limited lift/darken.

## Body Retouch
- Added Abdomen / Waist+Abdomen local warp.
- Preview / Apply / Cancel with sequence guards and preserved photo filter stack.
- Conservative max effect and bilinear sampling.
