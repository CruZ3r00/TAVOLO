@echo off
setlocal

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "XDG_CONFIG_HOME=%ROOT%\.runtime\xdg-config"
set "STRAPI_TELEMETRY_DISABLED=true"

if not exist "%XDG_CONFIG_HOME%" mkdir "%XDG_CONFIG_HOME%"

echo Avvio TAVOLO locale...
echo Root: %ROOT%
echo.
echo URL:
echo   Frontend: http://192.168.1.63:5174
echo   Strapi:   http://192.168.1.63:1337
echo   OCR:      http://127.0.0.1:8001/health
echo.

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
echo Node: %NODE_VERSION%
echo Se Strapi non parte e Node e' v23/v24, installa/usa Node 22 LTS.
echo.

where ollama >nul 2>nul
if %errorlevel%==0 (
  start "TAVOLO - Ollama" /D "%ROOT%" cmd /k ollama serve
) else (
  echo Ollama non trovato nel PATH: salto.
)

timeout /t 2 /nobreak >nul

start "TAVOLO - OCR service" /D "%ROOT%\ocr-service" cmd /k python -m uvicorn app.main:app --host 127.0.0.1 --port 8001

timeout /t 2 /nobreak >nul

start "TAVOLO - Strapi" /D "%ROOT%\strapi" cmd /k "set XDG_CONFIG_HOME=%XDG_CONFIG_HOME%&& set STRAPI_TELEMETRY_DISABLED=true&& npm run develop"

timeout /t 2 /nobreak >nul

start "TAVOLO - Vue frontend" /D "%ROOT%\vuejs\frontend" cmd /k npm run dev -- --host 0.0.0.0 --port 5174

echo.
echo Finito. Controlla le finestre aperte per eventuali errori.
pause
