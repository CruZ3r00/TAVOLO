# Configure-PosRtService.ps1
#
# Post-install / re-config script per pos-rt-service su Windows.
# Applica le configurazioni che il MSI non puo' impostare nativamente con wixl
# (ACL strette su DataDir, env vars REG_MULTI_SZ del servizio, recovery actions).
#
# E' idempotente: puoi eseguirlo piu' volte senza effetti collaterali.
#
# Richiede privilegi di Administrator.
#
# Uso:
#   .\Configure-PosRtService.ps1
#   .\Configure-PosRtService.ps1 -DataDir "D:\posrt-data" -LogLevel debug
#
# Parametri:
#   -DataDir       cartella dati (default: $env:ProgramData\PosRtService)
#   -ServiceName   nome del servizio (default: PosRtService)
#   -LogLevel      LOG_LEVEL env var del servizio (default: info)
#   -RestartService riavvia il servizio dopo la riconfigurazione (default: $true)

[CmdletBinding()]
param(
    [string]$DataDir       = "$env:ProgramData\PosRtService",
    [string]$ServiceName   = "PosRtService",
    [ValidateSet('trace','debug','info','warn','error','fatal','silent')]
    [string]$LogLevel      = 'info',
    [bool]  $RestartService = $true
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Configure-PosRtService.ps1 richiede privilegi di Administrator."
    }
}

function Set-DataDirAcl {
    param([string]$Path)

    Write-Host "==> ACL su $Path"
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
    foreach ($sub in @('db','logs')) {
        $p = Join-Path $Path $sub
        if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
    }

    # SID well-known (no problemi locale italiano/inglese)
    #   S-1-5-32-544 = BUILTIN\Administrators
    #   S-1-5-20     = NT AUTHORITY\NetworkService
    # /inheritance:r  rimuove ereditarieta'  (ACL pulita)
    # (OI)(CI)(F)     Object+Container Inherit, FullControl
    # (OI)(CI)(M)     Object+Container Inherit, Modify
    & icacls.exe $Path /inheritance:r `
        /grant:r "*S-1-5-32-544:(OI)(CI)(F)" `
        /grant:r "*S-1-5-20:(OI)(CI)(M)" | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "icacls fallito (exit $LASTEXITCODE) su $Path"
    }
}

function Set-ServiceEnv {
    param(
        [string]$Service,
        [string]$DataDir,
        [string]$LogLevel
    )
    Write-Host "==> Service Environment ($Service): NODE_ENV=production, LOG_LEVEL=$LogLevel, APP_DATA_DIR=$DataDir"
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$Service"
    if (-not (Test-Path $regPath)) {
        throw "Servizio non registrato: $regPath. Esegui prima msiexec /i pos-rt-service-X.Y.Z.msi"
    }
    Set-ItemProperty -Path $regPath -Name 'Environment' -Type MultiString -Value @(
        "NODE_ENV=production",
        "LOG_LEVEL=$LogLevel",
        "APP_DATA_DIR=$DataDir"
    )
}

function Set-ServiceRecovery {
    param([string]$Service)
    Write-Host "==> Service recovery actions (restart on 1st/2nd failure, delay 60s)"
    # reset=86400  -> reset failure counter dopo 24h
    # restart/60000  -> restart dopo 60s (in ms)
    & sc.exe failure $Service reset= 86400 actions= restart/60000/restart/60000//0 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "sc.exe failure exit $LASTEXITCODE (proseguo: non bloccante)"
    }
}

function Restart-PosRtService {
    param([string]$Service)
    Write-Host "==> Restart $Service"
    Stop-Service -Name $Service -Force -ErrorAction SilentlyContinue
    Start-Service -Name $Service
    Start-Sleep -Seconds 2
    Get-Service -Name $Service | Format-Table -AutoSize Name, Status, StartType
}

# --- main ---
Assert-Admin

Write-Host "Configure-PosRtService"
Write-Host "  DataDir        = $DataDir"
Write-Host "  ServiceName    = $ServiceName"
Write-Host "  LogLevel       = $LogLevel"
Write-Host "  RestartService = $RestartService"
Write-Host ""

Set-DataDirAcl    -Path $DataDir
Set-ServiceEnv    -Service $ServiceName -DataDir $DataDir -LogLevel $LogLevel
Set-ServiceRecovery -Service $ServiceName

if ($RestartService) {
    Restart-PosRtService -Service $ServiceName
}

Write-Host ""
Write-Host "Configurazione completata." -ForegroundColor Green
Write-Host "Pannello pairing locale: http://127.0.0.1:<porta>/ui/pair.html"
Write-Host "  La porta e' allocata dinamicamente al primo avvio. Cerca 'API locale' in:"
Write-Host "    $DataDir\logs\app.log"
