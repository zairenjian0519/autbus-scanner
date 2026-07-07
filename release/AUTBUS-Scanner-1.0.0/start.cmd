@echo off
setlocal
set "APP_DIR=%~dp0app"
set "NODE_EXE=%~dp0runtime\node.exe"

if not exist "%NODE_EXE%" (
  echo Node runtime not found: %NODE_EXE%
  pause
  exit /b 1
)

if not exist "%APP_DIR%\backend\server.js" (
  echo Backend entry not found: %APP_DIR%\backend\server.js
  pause
  exit /b 1
)

start "" "http://localhost:3001"
cd /d "%APP_DIR%\backend"
"%NODE_EXE%" server.js
pause
