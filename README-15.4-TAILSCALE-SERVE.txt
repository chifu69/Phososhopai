PHOTO IA 15.4 — Tailscale Serve Fallback

Remote secure fallback:
https://desktop-i33j4gg.tail079508.ts.net

Behavior:
1. Try the saved LAN server first.
2. If LAN fails quickly, try the secure Tailscale Serve hostname.
3. Use the first route that answers /health successfully.
4. Send /api/v1/edit through that same route.

Why this change:
Direct HTTPS to the Tailscale 100.x IP caused iOS certificate problems.
Tailscale Serve now provides a valid HTTPS hostname and proxies internally to
PHOTO IA Bridge on localhost:8443 using the working server setup.

The stored LAN address is preserved for home use.
