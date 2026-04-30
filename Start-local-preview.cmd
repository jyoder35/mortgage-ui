@echo off
REM Double-click this file to build dist, start the local site, and open the three calculators in your browser.
REM Keep the window titled "AZM preview server" open — closing it stops the site.

cd /d "%~dp0"

echo.
echo Building and starting local preview (same layout as Netlify dist)...
echo.

start "AZM preview server" cmd /k "npm run preview:dist"

REM Give Node time to build and bind the port (adjust if your PC is slower).
timeout /t 6 /nobreak >nul

start "" "http://127.0.0.1:4179/"
start "" "http://127.0.0.1:4179/afford/"
start "" "http://127.0.0.1:4179/live/"

echo.
echo If a tab shows an error, wait a few seconds and refresh, or use the shortcuts in the local-preview folder.
echo.
