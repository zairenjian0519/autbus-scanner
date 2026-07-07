@echo off
setlocal
set "INSTALL_PS1=%~dp0install.ps1"

if not exist "%INSTALL_PS1%" (
  echo Installer script not found: %INSTALL_PS1%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_PS1%"
set "INSTALL_EXIT=%ERRORLEVEL%"

if not "%INSTALL_EXIT%"=="0" (
  echo.
  echo Installation failed with exit code %INSTALL_EXIT%.
  pause
  exit /b %INSTALL_EXIT%
)
