@echo off
setlocal

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%" || goto :failed

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install Node.js LTS from https://nodejs.org/ and try again.
  goto :failed
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm is missing. Reinstall Node.js LTS and try again.
  goto :failed
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)"
if errorlevel 1 (
  echo Labellab requires Node.js 20.9 or newer. Install the current Node.js LTS.
  goto :failed
)

if not exist "node_modules\.bin\next.cmd" (
  echo Installing project dependencies for this computer. This may take a few minutes...
  call npm.cmd ci
  if errorlevel 1 (
    echo Dependency installation failed. Check the npm error above and your Internet connection.
    goto :failed
  )
)

echo Starting Labellab at http://127.0.0.1:3005/
start "Labellab Dev Server" /D "%PROJECT_DIR%" cmd /d /k "npm.cmd run dev"

echo Waiting for the website to be ready...
powershell.exe -NoProfile -Command "$ProgressPreference = 'SilentlyContinue'; $deadline = (Get-Date).AddSeconds(180); do { try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3005/' -UseBasicParsing -TimeoutSec 5; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo The website did not become ready. Check the Labellab Dev Server window for errors.
  goto :failed
)
start "" "http://127.0.0.1:3005/"

endlocal
exit /b 0

:failed
echo.
pause
endlocal
exit /b 1
