"""Local development preview, including the MIME type required by Wasm."""
import http.server
import os
from pathlib import Path
import sys

os.chdir(str(Path(__file__).resolve().parent.parent))
handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map.update({'.wasm': 'application/wasm', '.js': 'text/javascript'})
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8776
server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
print('PHOTO IA preview: http://127.0.0.1:{}/next/'.format(port), flush=True)
server.serve_forever()
