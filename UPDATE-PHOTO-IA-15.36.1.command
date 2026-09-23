#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js no está disponible en PATH."
  exit 1
fi
node UPDATE-PHOTO-IA-15.36.1.js
