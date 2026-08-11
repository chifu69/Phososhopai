PHOTO IA 15.3 — Connection Router Fix

Objetivo
--------
Que "Probar conexión" y las generaciones usen EXACTAMENTE la misma lógica:
1) probar LAN rápidamente
2) si LAN falla, probar Tailscale
3) usar la ruta que realmente respondió

Rutas
-----
Primaria: la dirección guardada por el usuario, normalmente LAN
Tailscale: https://100.79.114.52:8443

Timeouts
--------
LAN: 1.8 s
Tailscale: 5.5 s

Importante
----------
La IP Tailscale NO reemplaza la dirección LAN guardada.
Se conserva como fallback automático.

"Probar conexión" ahora informa:
- Conectado por red local
- Conectado por Tailscale
- No respondió por red local ni por Tailscale

Las generaciones vuelven a resolver la ruta antes de enviar /api/v1/edit,
por lo que no dependen de un test anterior ni de estar en el mismo Wi-Fi.
