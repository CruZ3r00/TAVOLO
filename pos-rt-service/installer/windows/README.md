# pos-rt-service — Windows installer

Pacchetto installer per Windows. Output finale: **`pos-rt-service-<version>.msi`** in `dist/win/`.

## Architettura

```
installer/windows/
├── wix/                       # sorgenti WiX (.wxs) — modulari, una responsabilita' per file
│   ├── Variables.wxi          # costanti (UpgradeCode, GUID Component, nomi)
│   ├── Directories.wxs        # alberatura: ProgramFiles\PosRtService, ProgramData\PosRtService\{db,logs}, Start Menu
│   ├── Components.wxs         # data dirs (ACL applicate post-install) + shortcut
│   ├── Service.wxs            # binario .exe + Windows Service (NetworkService, auto, recovery via PS1)
│   ├── Product.wxs            # Product top-level + Package + MajorUpgrade + Feature
│   ├── License.rtf            # licenza
│   └── AppIcon.ico            # icona multi-resolution
├── build-msi.sh               # build script (wixl/Linux o WiX/Windows)
├── install.ps1                # orchestratore: msiexec + Configure-PosRtService.ps1
├── uninstall.ps1              # uninstaller (msiexec /x)
└── Configure-PosRtService.ps1 # post-install: ACL stretta + env vars REG_MULTI_SZ + service recovery
```

L'MSI vive **standalone** (per SCCM/Intune/distribuzione enterprise): `msiexec /i pos-rt-service-X.Y.Z.msi` registra binario + servizio. La configurazione "fine" (ACL DataDir + REG_MULTI_SZ Environment + recovery) e' in `Configure-PosRtService.ps1`, eseguita automaticamente da `install.ps1` o invocabile separatamente.

Il motivo della separazione: il toolchain `wixl` (msitools, Linux) non supporta `util:PermissionEx`, `MultiStringValue`, `util:ServiceConfig`. Su Windows con WiX Toolset 3+ si possono nativizzare, vedi sezione "Migrazione a WiX nativo".

## Build dell'MSI

### Da Linux (wixl)

Pre-requisiti:
```bash
sudo apt install wixl msitools          # Debian / Ubuntu
```

Build:
```bash
cd pos-rt-service
npm run pack:win                        # produce dist/win/pos-rt-service.exe
./installer/windows/build-msi.sh        # produce dist/win/pos-rt-service-<version>.msi
```

Override delle variabili build:
```bash
PRODUCT_VERSION=1.2.0 BINARY_SOURCE=/path/to/pos-rt-service.exe ./installer/windows/build-msi.sh
```

### Da Windows (WiX Toolset 3, alternativa)

Pre-requisiti:
- [WiX Toolset 3.x](https://wixtoolset.org/releases/) — `candle.exe`, `light.exe`
- Estensioni: `WixUtilExtension.dll`, opzionale `WixUIExtension.dll`

Comandi:
```cmd
candle -arch x64 -ext WixUtilExtension -dProductVersion=1.0.0 -dProductCode={NEW-GUID} ^
       -dBinarySource=..\..\dist\win\pos-rt-service.exe -dLicenseRtf=License.rtf ^
       -dIconFile=AppIcon.ico ^
       wix\Product.wxs wix\Directories.wxs wix\Components.wxs wix\Service.wxs

light -ext WixUtilExtension -o ..\..\dist\win\pos-rt-service-1.0.0.msi ^
      Product.wixobj Directories.wixobj Components.wixobj Service.wixobj
```

WiX nativo permette di reintegrare `util:PermissionEx`, `MultiStringValue`, `util:ServiceConfig` direttamente nel MSI (vedi commenti TODO nei `.wxs`), eliminando il bisogno del PowerShell post-install.

## Installazione (lato utente)

**Flusso raccomandato (UI / single-click)**:
```powershell
.\installer\windows\install.ps1
```
Lo script si auto-eleva a Administrator se non lo e' gia', poi esegue:
1. `msiexec /i pos-rt-service-X.Y.Z.msi /qb`
2. `Configure-PosRtService.ps1` (ACL + env + recovery + restart)

**Flusso enterprise (silent / script-driven)**:
```cmd
msiexec /i pos-rt-service-1.0.0.msi /quiet /norestart /l*v install.log
powershell -NoProfile -ExecutionPolicy Bypass -File Configure-PosRtService.ps1
```

## Disinstallazione

```powershell
.\installer\windows\uninstall.ps1                    # mantiene DataDir
.\installer\windows\uninstall.ps1 -PurgeData         # rimuove anche DB e audit
```

oppure direttamente:
```cmd
msiexec /x {ProductCode} /qb
```

Il `ProductCode` lo trovi in `Programs and Features` o con:
```powershell
Get-CimInstance Win32_Product -Filter "Name LIKE 'POS-RT Service%'" | Select IdentifyingNumber
```

## Versioning & upgrade

- **`UpgradeCode`** (`818E55EA-C9B8-4CB6-ACE0-06CED459709B`) — FISSO PER SEMPRE. Non toccarlo: cambiarlo significa "questa e' un'app diversa", e MSI non riconosce piu' gli upgrade.
- **`ProductCode`** — generato nuovo ad ogni build dal `build-msi.sh` (passato via `-D ProductCode=`). MSI usa `ProductCode + UpgradeCode + ProductVersion` per gestire MajorUpgrade.
- **`ProductVersion`** — letto da `package.json` (override via env `PRODUCT_VERSION`).

Bump della versione:
```bash
npm version patch        # nel root pos-rt-service
npm run pack:win
./installer/windows/build-msi.sh
```

## Authenticode signing (raccomandato)

Senza firma Authenticode, Windows SmartScreen mostra un warning "Editor sconosciuto". **Per produzione serve un certificato EV** (Extended Validation) emesso da una CA Microsoft-trusted (DigiCert, Sectigo, ecc.).

Firma su Windows con `signtool`:
```cmd
signtool sign /f cert.pfx /p <password> ^
        /tr http://timestamp.digicert.com /td sha256 /fd sha256 ^
        dist\win\pos-rt-service.exe
signtool sign /f cert.pfx /p <password> ^
        /tr http://timestamp.digicert.com /td sha256 /fd sha256 ^
        dist\win\pos-rt-service-1.0.0.msi
```

Verifica:
```cmd
signtool verify /pa /v dist\win\pos-rt-service-1.0.0.msi
```

Firmare **prima** l'EXE, **poi** l'MSI (l'MSI contiene l'EXE; il digest cambia se ri-firmi l'EXE dopo).

## Verifica struttura MSI (debug)

```bash
msiinfo suminfo dist/win/pos-rt-service-1.0.0.msi
msiinfo tables  dist/win/pos-rt-service-1.0.0.msi
msiinfo export  dist/win/pos-rt-service-1.0.0.msi ServiceInstall
msiinfo export  dist/win/pos-rt-service-1.0.0.msi Component
```

## Troubleshooting

**MSI install fallisce con error 1618** — un'altra installazione MSI e' in corso. Riprova dopo 30s.

**MSI install ok ma servizio non parte**:
1. Controlla log MSI: `%TEMP%\pos-rt-service-install.log`
2. Controlla event log Windows: `Get-EventLog -LogName Application -Source PosRtService -Newest 20`
3. Manuale: `Start-Service PosRtService`; vedi `%ProgramData%\PosRtService\logs\app.log`

**`Configure-PosRtService.ps1` errore "icacls fallito"**: probabile path non esistente o lock su file. Verifica che la DataDir esista e nessun processo la stia usando.

**Upgrade non funziona** (l'installer dice "gia' installato"): controlla che `UpgradeCode` sia rimasto identico tra le build e che `ProductVersion` sia stato incrementato.

## Sicurezza

- **Servizio gira come `NetworkService`** (least privilege, NOT `SYSTEM`).
- **API HTTP locale bindata su 127.0.0.1**: nessuna esposizione LAN. Verifica via `netstat -ano | findstr :PORT`.
- **DataDir ACL**: `Configure-PosRtService.ps1` rimuove l'ereditarieta' default e applica `Administrators FullControl + NetworkService Modify`. Verifica con `icacls "%ProgramData%\PosRtService"`.
- **Master key cifratura DB**: priorita' Windows DPAPI (via `keytar`). Vedi `src/utils/keystore.js`.
