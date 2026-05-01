# uninstall.ps1
#
# Disinstalla pos-rt-service tramite msiexec /x.
# Conserva la DataDir (%ProgramData%\PosRtService) per non perdere DB cifrato + audit log.
#
# Uso:
#   .\uninstall.ps1                # rileva l'installazione e disinstalla
#   .\uninstall.ps1 -PurgeData     # rimuove anche la DataDir (irreversibile)

[CmdletBinding()]
param(
    [string]$ServiceName = "PosRtService",
    [string]$DataDir     = "$env:ProgramData\PosRtService",
    [switch]$PurgeData
)

$ErrorActionPreference = 'Stop'

# UpgradeCode FISSO del prodotto — vedi installer/windows/wix/Variables.wxi
$UpgradeCode = '{818E55EA-C9B8-4CB6-ACE0-06CED459709B}'

function Assert-Admin {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "uninstall.ps1 richiede privilegi di Administrator."
    }
}

function Get-InstalledProductCode {
    param([string]$UpgradeCode)
    # Cerca il ProductCode corrente sotto Installer\UpgradeCodes registry.
    # Fonte: Microsoft "Searching for an Installed Application by UpgradeCode".
    $packed = ([guid]$UpgradeCode).ToByteArray() -as [System.Collections.Generic.List[byte]]
    # Trasformazione "packed GUID" — non semplice in pure PowerShell.
    # Fallback piu' robusto: enumera tutti i prodotti installati e cerca per nome.
    Get-CimInstance -ClassName Win32_Product -Filter "Name LIKE 'POS-RT Service%'" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty IdentifyingNumber
}

Assert-Admin

Write-Host "==> Uninstall pos-rt-service" -ForegroundColor Cyan

$productCode = Get-InstalledProductCode -UpgradeCode $UpgradeCode
if (-not $productCode) {
    Write-Warning "Prodotto non trovato nel registro Windows. Provo cleanup manuale del servizio."
    Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
    & sc.exe delete $ServiceName | Out-Null
} else {
    Write-Host "  ProductCode: $productCode"
    $args = @('/x', $productCode, '/qb', '/norestart', '/l*v', "$env:TEMP\pos-rt-service-uninstall.log")
    $proc = Start-Process -FilePath msiexec.exe -ArgumentList $args -Wait -PassThru
    if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 1605) {
        Write-Host "msiexec uninstall exit $($proc.ExitCode). Log: $env:TEMP\pos-rt-service-uninstall.log" -ForegroundColor Red
        exit $proc.ExitCode
    }
}

if ($PurgeData) {
    if (Test-Path $DataDir) {
        Write-Warning "Rimozione DataDir: $DataDir (DB cifrato + audit log persi)"
        Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
    }
} else {
    Write-Host ""
    Write-Host "Dati conservati in: $DataDir" -ForegroundColor Yellow
    Write-Host "  Per rimuoverli: .\uninstall.ps1 -PurgeData"
}

Write-Host ""
Write-Host "Disinstallazione completata." -ForegroundColor Green
