@echo off
setlocal

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo Starting Labellab at http://127.0.0.1:3005/
start "Labellab Dev Server" /D "%PROJECT_DIR%" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:3005/"

endlocal
