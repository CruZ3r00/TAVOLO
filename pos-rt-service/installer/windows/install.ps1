# Installer PowerShell per pos-rt-service su Windows.
# Esegue come Administrator.
#
# Uso:  .\install.ps1 -BinarySource .\dist\win\pos-rt-service.exe

param(
    [string]$BinarySource = ".\dist\win\pos-rt-service.exe",
    [string]$InstallDir = "$env:ProgramFiles\PosRtService",
    [string]$DataDir = "$env:ProgramData\PosRtService",
    [string]$ServiceName = "PosRtService"
)

$ErrorActionPreference = 'Stop'

function Require-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "Questo script richiede privilegi di Administrator." -ForegroundColor Red
        exit 1
    }
}

Require-Admin

if (-not (Test-Path $BinarySource)) {
    Write-Host "Binario non trovato: $BinarySource" -ForegroundColor Red
    exit 2
}

Write-Host "► Creazione directory..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path "$DataDir\db" | Out-Null
New-Item -ItemType Directory -Force -Path "$DataDir\logs" | Out-Null

# ACL: solo Administrators + NetworkService possono leggere/scrivere
Write-Host "► Impostazione ACL..."
$acl = Get-Acl $DataDir
$acl.SetAccessRuleProtection($true, $false)
$adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$serviceRule = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\NetworkService", "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.AddAccessRule($adminRule)
$acl.AddAccessRule($serviceRule)
Set-Acl -Path $DataDir -AclObject $acl

Write-Host "► Copia binario..."
Copy-Item -Path $BinarySource -Destination "$InstallDir\pos-rt-service.exe" -Force

Write-Host "► Installazione servizio Windows..."
sc.exe delete $ServiceName 2>&1 | Out-Null

New-Service -Name $ServiceName `
    -BinaryPathName "`"$InstallDir\pos-rt-service.exe`"" `
    -DisplayName "POS-RT Service (Strapi bridge)" `
    -Description "Bridge tra Strapi CMS e dispositivi POS/RT fiscali (loopback-only)." `
    -StartupType Automatic | Out-Null

# Service account: NetworkService (least privilege, non SYSTEM)
sc.exe config $ServiceName obj= "NT AUTHORITY\NetworkService" | Out-Null

# Environment (registrati nel servizio)
$envBlock = @(
    "NODE_ENV=production",
    "LOG_LEVEL=info",
    "APP_DATA_DIR=$DataDir"
) -join "`0"
# Registry environment per il servizio
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
Set-ItemProperty -Path $regPath -Name "Environment" -Value @(
    "NODE_ENV=production",
    "LOG_LEVEL=info",
    "APP_DATA_DIR=$DataDir"
) -Type MultiString

Write-Host "► Avvio servizio..."
Start-Service $ServiceName

Start-Sleep -Seconds 2
Get-Service $ServiceName

Write-Host ""
Write-Host "✓ Installazione completata." -ForegroundColor Green
Write-Host "► Log:           $DataDir\logs\app.log"
Write-Host "► UI pairing:    apri http://127.0.0.1:<porta>/ui/pair.html"
Write-Host "  La porta è salvata in $DataDir\db (tabella config -> api.port) o visibile nei log."

# Prova ad aprire il browser sull'URL UI (best effort)
try {
    Start-Sleep -Seconds 3
    # Leggi la porta dal DB SQLite sarebbe complesso in PS puro — lascia all'utente
    Start-Process "http://127.0.0.1"
} catch {}
