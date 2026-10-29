@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT=%~dp0"
set "DSH=D:\deepseek\DeepSeek Harness.exe"
set "FIX=%ROOT%dsh-host-shims.js"

rem Optional local overrides (copy config.example.cmd to config.cmd).
if exist "%ROOT%config.cmd" call "%ROOT%config.cmd"

for %%I in ("%DSH%") do set "DSH_DIR=%%~dpI"
if not defined DSH_ASAR set "DSH_ASAR=%DSH_DIR%resources\app.asar\dsh\node_modules"
if not defined DSH_PROFILE set "DSH_PROFILE=%USERPROFILE%\.dsh\profiles\desktop\node_modules"

rem If DSH is already running, just bring it up; do not touch node_modules.
tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if not errorlevel 1 (
  start "" "%DSH%"
  exit /b 0
)

echo [DSH] Generating host-package shims...
set "ELECTRON_RUN_AS_NODE=1"
"%DSH%" "%FIX%" --apply
set "ELECTRON_RUN_AS_NODE="

if errorlevel 1 (
  echo [DSH] Shim generation failed. See the output above.
  pause
  exit /b 1
)

start "" "%DSH%"
exit /b 0
