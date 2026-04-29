param(
    [string]$ServiceName = "PosRtService",
    [string]$InstallDir = "$env:ProgramFiles\PosRtService"
)

$ErrorActionPreference = 'Stop'

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Richiede Administrator." -ForegroundColor Red
    exit 1
}

Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
sc.exe delete $ServiceName | Out-Null
Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue

Write-Host "Servizio rimosso. I dati in %ProgramData%\PosRtService sono conservati."
