PHOTO IA 15.2 — LAN + Tailscale Auto Connection

- Preserves the saved local Alienware Bridge address as the primary route.
- Adds automatic fallback to the Alienware Tailscale address: https://100.79.114.52:8443.
- Uses the route that actually passes /health for the edit and interrupt requests.
- Connection timeout increased to 10 seconds to avoid false failures on cellular/Tailscale.
- UI reports whether the connection is using the local network or Tailscale.
- Wardrobe Engine logic from 15.1 is unchanged.

Important: Safari must trust the HTTPS certificate presented by the Bridge for the Tailscale address. If Safari rejects the certificate, use a Tailscale HTTPS hostname/Serve configuration rather than disabling TLS verification.
