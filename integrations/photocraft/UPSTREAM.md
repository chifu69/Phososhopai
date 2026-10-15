# PhotoCraft integration

Source: https://github.com/storytold/photocraft
Pinned commit: `4e7a17cd5d5723313f459753663d0d155f047e19` (workspace 0.9.0).
The bridge uses real PhotoCraft engine, document, composition, IO and format crates through Cargo. It does not embed the upstream desktop UI. Its source is MIT OR Apache-2.0; copies of those licenses and upstream NOTICE accompany this integration. Branding remains PHOTO IA.

Build tested with Rust 1.98.1, target wasm32-unknown-unknown, wasm-bindgen-cli 0.2.129. Cargo.lock pins resolved dependencies, including upstream craft-libs revisions. The build script checks wasm-bindgen against that lock. No product npm dependencies are required.

Commands:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
WASM_BINDGEN="$(command -v wasm-bindgen)" bash scripts/build-photocraft.sh
cargo test --locked --manifest-path integrations/photocraft/bridge/Cargo.toml
```

Generated JS/Wasm stays in `next/engine/` (git-ignored); deployment requires generating and including it. Serve `.wasm` as `application/wasm` and compress transport. The production PHOTO IA service worker does not precache this development editor. No automatic production switch is included.

The current Wasm module is intentionally a feasibility baseline, not a final mobile download budget. Do not advertise physical-iPhone compatibility until measured on Safari. No upstream trademarks or sample artwork are copied. The text engine embeds upstream fonts/dictionary even though this initial interface does not expose text tools; their OFL/SCOWL notices accompany the bundle. dependency-licenses.json records licenses reported by the locked Cargo graph; it is an inventory, not a substitute for dependency notices when distributing binaries.
