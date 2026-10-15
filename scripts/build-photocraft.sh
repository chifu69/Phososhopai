#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
manifest=integrations/photocraft/bridge/Cargo.toml
cargo build --manifest-path "$manifest" --target wasm32-unknown-unknown --release --locked
bindgen="${WASM_BINDGEN:-.tools/wasm-bindgen/wasm-bindgen}"
if [ ! -x "$bindgen" ]; then bindgen=wasm-bindgen; fi
version=$(awk '/name = "wasm-bindgen"/{getline;gsub(/"/,"",$3);print $3;exit}' integrations/photocraft/bridge/Cargo.lock)
if [ "$("$bindgen" --version)" != "wasm-bindgen $version" ]; then
 echo "Install wasm-bindgen-cli $version or set WASM_BINDGEN to that binary." >&2
 exit 1
fi
mkdir -p next/engine
"$bindgen" integrations/photocraft/bridge/target/wasm32-unknown-unknown/release/photoia_photocraft_bridge.wasm --target web --out-dir next/engine
cp -R integrations/photocraft/licenses next/engine/
cp integrations/photocraft/NOTICE integrations/photocraft/ATTRIBUTION.md integrations/photocraft/dependency-licenses.json next/engine/
