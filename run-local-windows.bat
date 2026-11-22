@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (start "" "http://localhost:8765/docs/" & py -3 -m http.server 8765) else (where python >nul 2>nul && (start "" "http://localhost:8765/docs/" & python -m http.server 8765) || (echo Python 3 is required. & pause))
