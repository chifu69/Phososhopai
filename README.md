# PHOTO IA 8.2 — AI Bridge + Windows Server

Esta entrega conecta la interfaz del teléfono con un servidor local para **ComfyUI + FLUX.2 Klein 4B Distilled**.

## Teléfono
- Foto principal y referencia.
- Instrucciones naturales y acciones rápidas.
- Prueba de conexión, estado real del workflow, progreso y cancelación.
- Envío multipart y recepción automática del resultado.
- Historial local y colocación del resultado en el lienzo.

## Alienware (`windows-server`)
- FastAPI con `GET /health`, `GET /api/v1/setup`, `POST /api/v1/edit` y `POST /api/v1/interrupt`.
- Token privado, CORS para GitHub Pages, subida a ComfyUI, ejecución de workflow, espera del resultado y descarga.
- Instalador, regla de firewall, inicio, datos de conexión, diagnóstico de nodos y registros.

## Paso pendiente en casa
Exportar desde ComfyUI el workflow instalado usando **Export Workflow (API)** y colocar sus IDs en `windows-server/config.json`. Las instrucciones completas están en `windows-server/README-SERVER.txt`.
