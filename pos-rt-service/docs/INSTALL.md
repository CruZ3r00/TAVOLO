# Guida installazione pos-rt-service

Questa guida è rivolta al ristoratore che installa il servizio sulla propria
macchina. Per lo sviluppo vedi `README.md`.

## Requisiti

- Una macchina Windows 10+, Linux (Ubuntu/Debian/Fedora), o macOS 12+
- Connessione Internet stabile (solo in uscita)
- Credenziali Strapi del proprietario del ristorante
- **Facoltativo**: stampante termica USB compatibile ESC/POS, RT fiscale
  certificato AE, terminale POS. In v1 il servizio usa driver "stub" di
  default (simula stampa e pagamento).

## Cosa NON serve

- Non serve aprire porte sul router
- Non serve configurare port-forwarding
- Non serve DNS dinamico o VPN
- Non serve un IP pubblico statico

Il servizio comunica sempre **in uscita** verso Strapi (HTTPS + WSS).

## Windows

1. Scarica `pos-rt-service.exe` (rilascio ufficiale firmato Authenticode EV)
2. Apri PowerShell come **Administrator**
3. Esegui:
   ```powershell
   .\installer\windows\install.ps1 -BinarySource .\pos-rt-service.exe
   ```
4. L'installer registra un servizio Windows (`PosRtService`) e lo avvia.
5. Apri il browser su `http://127.0.0.1:<PORT>/ui/pair.html` (la porta è
   indicata nei log: `C:\ProgramData\PosRtService\logs\app.log`).
6. Completa il form di pairing.
7. **Annota il PIN mostrato** — ti servirà per il pannello di amministrazione.

## Linux

1. Scarica `pos-rt-service` (binario Linux x64)
2. Apri un terminale
3. Esegui:
   ```bash
   sudo ./installer/linux/install.sh ./pos-rt-service
   ```
4. L'installer crea un utente di servizio `posrt`, registra il daemon systemd
   e lo avvia.
5. Log: `journalctl -u pos-rt-service -f`
6. Apri il browser su `http://127.0.0.1:<PORT>/ui/pair.html`.
7. Completa il pairing e annota il PIN.

## macOS

1. Scarica `pos-rt-service` (notarized)
2. Apri Terminale
3. Esegui:
   ```bash
   sudo ./installer/macos/install.sh ./pos-rt-service
   ```
4. L'installer registra un `launchd` daemon.
5. Log: `/Library/Application Support/PosRtService/logs/stdout.log`
6. Apri il browser su `http://127.0.0.1:<PORT>/ui/pair.html`.
7. Completa il pairing.

## Come trovare la porta dell'API

Per default la porta è allocata dinamicamente al primo avvio e salvata in DB.

- **Windows**: `C:\ProgramData\PosRtService\logs\app.log` (cerca "API locale")
- **Linux**: `journalctl -u pos-rt-service | grep "API locale"`
- **macOS**: `cat "/Library/Application Support/PosRtService/logs/stdout.log" | grep "API locale"`

Per bloccare una porta specifica all'installazione, imposta la variabile
d'ambiente `LOCAL_API_PORT=18080` nel file di servizio prima dell'avvio.

## Verifica funzionamento

Dopo il pairing:

1. Vai su `http://127.0.0.1:<PORT>/ui/dashboard.html`
2. Inserisci il PIN
3. Verifica che mostri:
   - Paired: **yes**
   - WebSocket: **connected** (dopo qualche secondo)
   - Driver printer/payment: **online** (stub di default)
4. Click su "Stampa di test" — deve apparire un log di stampa fittizia.

## Disinstallazione

### Windows
```powershell
.\installer\windows\uninstall.ps1
```

### Linux
```bash
sudo ./installer/linux/uninstall.sh
```

### macOS
```bash
sudo ./installer/macos/uninstall.sh
```

I dati (DB, log, audit) restano conservati nelle rispettive cartelle dati.
Rimuovili manualmente se desiderato.

## Troubleshooting

Vedi `docs/TROUBLESHOOTING.md` (in arrivo) per problemi comuni:

- pairing fallisce → controlla URL Strapi (HTTPS obbligatorio), credenziali,
  connessione internet
- "Strapi unavailable" → il servizio continua a ritentare; verifica che il
  backend sia online
- WebSocket non si connette ma HTTP polling funziona → probabile proxy che
  chiude le connessioni lunghe; funzionalità garantita via polling
- PIN perso → disinstalla e reinstalla (serve rifare il pairing)
