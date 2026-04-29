param(
  [switch]$SkipOllama,
  [switch]$NoWindows
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$OcrDir = Join-Path $Root "ocr-service"
$StrapiDir = Join-Path $Root "strapi"
$FrontendDir = Join-Path $Root "vuejs\frontend"
$RuntimeDir = Join-Path $Root ".runtime"
$XdgConfigDir = Join-Path $RuntimeDir "xdg-config"

function Assert-PathExists {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label non trovato: $Path"
  }
}

function Test-PortInUse {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -in @("Listen", "Established") } |
    Select-Object -First 1

  return $null -ne $connection
}

function Start-TavoloWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  Assert-PathExists $WorkingDirectory $Title

  if ($NoWindows) {
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
    Push-Location $WorkingDirectory
    try {
      Invoke-Expression $Command
    } finally {
      Pop-Location
    }
    return
  }

  $escapedTitle = $Title.Replace("'", "''")
  $escapedDir = $WorkingDirectory.Replace("'", "''")
  $escapedXdgConfigDir = $XdgConfigDir.Replace("'", "''")
  $script = @"
`$Host.UI.RawUI.WindowTitle = '$escapedTitle'
Set-Location -LiteralPath '$escapedDir'
`$env:XDG_CONFIG_HOME = '$escapedXdgConfigDir'
`$env:STRAPI_TELEMETRY_DISABLED = 'true'
Write-Host '=== $escapedTitle ===' -ForegroundColor Cyan
Write-Host 'Directory: $escapedDir'
Write-Host 'Command: $Command'
Write-Host ''
$Command
if (`$LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'Processo terminato con codice:' `$LASTEXITCODE -ForegroundColor Red
}
Read-Host 'Premi Invio per chiudere questa finestra'
"@

  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $script
  )
}

Assert-PathExists $OcrDir "ocr-service"
Assert-PathExists $StrapiDir "strapi"
Assert-PathExists $FrontendDir "frontend"
New-Item -ItemType Directory -Force -Path $XdgConfigDir | Out-Null

$env:XDG_CONFIG_HOME = $XdgConfigDir
$env:STRAPI_TELEMETRY_DISABLED = "true"

$nodeVersion = (& node -v 2>$null)
if ($nodeVersion -match '^v(\d+)\.') {
  $nodeMajor = [int]$matches[1]
  if ($nodeMajor -gt 22) {
    Write-Host "Attenzione: Strapi supporta Node <=22, ma ora stai usando $nodeVersion." -ForegroundColor Yellow
    Write-Host "Se Strapi si comporta male, avvia con Node 22 LTS." -ForegroundColor Yellow
    Write-Host ""
  }
}

Write-Host "Avvio TAVOLO locale..." -ForegroundColor Green
Write-Host "Root: $Root"
Write-Host ""

if (-not $SkipOllama) {
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if (Test-PortInUse 11434) {
    Write-Host "Ollama sembra gia attivo su 11434: salto." -ForegroundColor Yellow
  } elseif ($ollama) {
    Start-TavoloWindow `
      -Title "TAVOLO - Ollama" `
      -WorkingDirectory $Root `
      -Command "ollama serve"
  } else {
    Write-Host "Ollama non trovato nel PATH: salto avvio Ollama." -ForegroundColor Yellow
  }
}

Start-Sleep -Seconds 2

if (Test-PortInUse 8001) {
  Write-Host "OCR service sembra gia attivo su 8001: salto." -ForegroundColor Yellow
} else {
  Start-TavoloWindow `
    -Title "TAVOLO - OCR service" `
    -WorkingDirectory $OcrDir `
    -Command "python -m uvicorn app.main:app --host 127.0.0.1 --port 8001"
}

Start-Sleep -Seconds 2

if (Test-PortInUse 1337) {
  Write-Host "Strapi sembra gia attivo su 1337: salto." -ForegroundColor Yellow
} else {
  Start-TavoloWindow `
    -Title "TAVOLO - Strapi" `
    -WorkingDirectory $StrapiDir `
    -Command "npm run develop"
}

Start-Sleep -Seconds 2

if (Test-PortInUse 5174) {
  Write-Host "Vue frontend sembra gia attivo su 5174: salto." -ForegroundColor Yellow
} else {
  Start-TavoloWindow `
    -Title "TAVOLO - Vue frontend" `
    -WorkingDirectory $FrontendDir `
    -Command "npm run dev -- --host 0.0.0.0 --port 5174"
}

Write-Host ""
Write-Host "Finito. URL utili:" -ForegroundColor Green
Write-Host "Frontend: http://192.168.1.63:5174"
Write-Host "Strapi:   http://192.168.1.63:1337"
Write-Host "OCR:      http://127.0.0.1:8001/health"
Write-Host ""
Write-Host "Per saltare Ollama: .\start-tavolo.ps1 -SkipOllama"
