@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js no esta disponible en PATH.
  echo Instala/activa Node.js o ejecuta manualmente: node UPDATE-PHOTO-IA-15.36.1.js
  pause
  exit /b 1
)
node UPDATE-PHOTO-IA-15.36.1.js
set ERR=%ERRORLEVEL%
pause
exit /b %ERR%
