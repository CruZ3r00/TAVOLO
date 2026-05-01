# install.ps1
#
# Orchestratore di installazione per pos-rt-service su Windows.
# Esegue il flusso completo:
#   1. msiexec /i pos-rt-service-X.Y.Z.msi          (registra binario + servizio)
#   2. Configure-PosRtService.ps1                   (ACL + env vars + recovery)
#   3. apre il browser sul pannello di pairing      (best effort)
#
# Richiede privilegi di Administrator. Se eseguito senza, si re-elava in automatico.
#
# Uso:
#   .\install.ps1                                          # default: cerca .msi sotto dist/win/
#   .\install.ps1 -MsiPath C:\path\to\pos-rt-service.msi   # MSI esplicito
#   .\install.ps1 -DataDir D:\posrt-data                   # data dir custom
#   .\install.ps1 -LogLevel debug                          # log verbose

[CmdletBinding()]
param(
    [string]$MsiPath,
    [string]$DataDir     = "$env:ProgramData\PosRtService",
    [string]$ServiceName = "PosRtService",
    [ValidateSet('trace','debug','info','warn','error','fatal','silent')]
    [string]$LogLevel    = 'info',
    [string]$LogFile     = "$env:TEMP\pos-rt-service-install.log"
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# --- Self-elevate se non admin ---
function Test-Admin {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Admin)) {
    Write-Host "Richiesti privilegi di Administrator. Re-lancio elevato..." -ForegroundColor Yellow
    $argList = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$($MyInvocation.MyCommand.Definition)`"")
    foreach ($k in $PSBoundParameters.Keys) {
        $v = $PSBoundParameters[$k]
        $argList += "-$k"
        $argList += "`"$v`""
    }
    Start-Process -FilePath powershell.exe -ArgumentList $argList -Verb RunAs
    exit 0
}

# --- Localizza l'MSI ---
if (-not $MsiPath) {
    $candidates = @(
        Join-Path $scriptDir '..\..\dist\win'      # repo layout
        $scriptDir                                  # MSI affianco allo script
        $env:TEMP
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $found = Get-ChildItem -Path $c -Filter 'pos-rt-service-*.msi' -ErrorAction SilentlyContinue |
                     Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($found) { $MsiPath = $found.FullName; break }
        }
    }
}
if (-not $MsiPath -or -not (Test-Path $MsiPath)) {
    throw "MSI non trovato. Specifica -MsiPath, oppure costruiscilo con: bash installer/windows/build-msi.sh"
}

Write-Host "==> Installazione pos-rt-service" -ForegroundColor Cyan
Write-Host "  MSI:         $MsiPath"
Write-Host "  DataDir:     $DataDir"
Write-Host "  ServiceName: $ServiceName"
Write-Host "  LogLevel:    $LogLevel"
Write-Host "  Install log: $LogFile"
Write-Host ""

# --- Step 1: msiexec ---
Write-Host "==> [1/3] msiexec /i $(Split-Path -Leaf $MsiPath) /qb"
$msiArgs = @('/i', "`"$MsiPath`"", '/qb', '/norestart', '/l*v', "`"$LogFile`"")
$proc = Start-Process -FilePath msiexec.exe -ArgumentList $msiArgs -Wait -PassThru
if ($proc.ExitCode -ne 0) {
    Write-Host "msiexec fallito (exit $($proc.ExitCode)). Vedi log: $LogFile" -ForegroundColor Red
    exit $proc.ExitCode
}

# --- Step 2: Configure (ACL + env + recovery) ---
$configureScript = Join-Path $scriptDir 'Configure-PosRtService.ps1'
if (-not (Test-Path $configureScript)) {
    throw "Configure-PosRtService.ps1 non trovato accanto a install.ps1: $configureScript"
}
Write-Host ""
Write-Host "==> [2/3] $configureScript"
& $configureScript -DataDir $DataDir -ServiceName $ServiceName -LogLevel $LogLevel -RestartService:$true

# --- Step 3: open browser (best effort, port unknown finche' il servizio non logga) ---
Write-Host ""
Write-Host "==> [3/3] Pannello pairing"
Write-Host "  Il servizio alloca dinamicamente la porta API. Trovala in:"
Write-Host "    $DataDir\logs\app.log  (cerca 'API locale')"
Write-Host "  Poi apri http://127.0.0.1:<porta>/ui/pair.html"
Write-Host ""
Write-Host "Installazione completata." -ForegroundColor Green
