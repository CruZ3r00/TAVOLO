# Setup iOS — istruzioni di integrazione

L'app iOS è pronta lato JS/Vue. Servono alcuni step manuali su macOS+Xcode
per arrivare al primo run su device fisico (TestFlight) e poi App Store.

## Prerequisiti

- macOS con Xcode 15+
- Account Apple Developer ($99/anno)
- Cocoapods installato (`sudo gem install cocoapods`)
- Bundle Id riservato sull'Apple Developer console (es. `it.tuodominio.posrt`).
  Deve coincidere con `appId` in `capacitor.config.json` e con `APNS_BUNDLE_ID`
  nelle env Strapi.

## 1. Scaffolding iniziale

Dalla cartella `pos-rt-service/mobile/`:

```bash
npm install
npm run build
npx cap add ios
npx cap sync ios
```

Capacitor crea `ios/App/`. Apri:

```bash
npx cap open ios
```

Xcode si apre sul workspace `App.xcworkspace`.

## 2. Imposta il Bundle Identifier

In Xcode:
- Click sul progetto `App` nel sidebar
- Tab "Signing & Capabilities"
- Imposta "Bundle Identifier" = il bundle id riservato (es. `it.tuodominio.posrt`)
- Imposta "Team" sul tuo Apple Developer Team
- Lascia "Automatically manage signing" attivo (per ora; per release può servire manual signing)

## 3. Aggiungi le Capabilities

Sempre nel tab "Signing & Capabilities":

1. Click `+ Capability` → cerca **Push Notifications** → aggiungi.
2. Click `+ Capability` → cerca **Background Modes** → aggiungi.
   - Spunta "Remote notifications".

Xcode aggiorna automaticamente `App.entitlements` e `Info.plist`.

## 4. Verifica le entitlements

Apri `ios/App/App/App.entitlements` (Xcode lo crea durante step 3) e confronta
con `ios-staging/App.entitlements`. Deve esserci almeno:

```xml
<key>aps-environment</key>
<string>development</string>
```

Per build TestFlight/App Store cambia in `production`.

## 5. Patch Info.plist

Apri `ios/App/App/Info.plist` (puoi farlo come testo via Right-click → Open As
→ Source Code) e applica le patch in `ios-staging/Info.plist.patch.md`.

Le sezioni chiave:
- `UIBackgroundModes` con `remote-notification` (Xcode lo aggiunge se hai fatto
  step 3, ma verifica)
- `NSLocalNetworkUsageDescription` (necessario per parlare con POS/RT in LAN)
- `NSBluetoothAlwaysUsageDescription` (futuro)

## 6. Patch AppDelegate

Apri `ios/App/App/AppDelegate.swift` e applica il patch in
`ios-staging/AppDelegate.swift.patch.md` per gestire correttamente i silent
push in background.

## 7. Run su device fisico

Le notifiche push **NON funzionano sul Simulator** (è una limitazione iOS).
Servono:
- iPhone fisico
- Cavo USB
- Selezionato come destinazione in Xcode (top toolbar)

Click "Play" (▶) → l'app installa e parte. Ti chiede il permesso notifiche
durante il pairing. Se accordi, l'app registra il token APNs e lo invia
al tuo Strapi (visibile nel log: `apns: provider inizializzato` /
`pos-bridge: APNs push exception (ignorata)`).

## 8. Test silent push end-to-end

Sul device:
1. Completa il pairing con Strapi.
2. Concedi le notifiche quando richiesto.
3. Manda l'app in background (home button / swipe up).

Su Strapi:
1. Verifica le env APNs:
   ```bash
   grep APNS strapi/.env
   ```
   `APNS_PRODUCTION=false` per build dev (sandbox endpoint).
2. Crea un ordine + chiusura → `dispatchJob` produce un pos-job →
   `services/apns/pushWakeup` manda silent push.
3. Sul device: l'app si "sveglia" silenziosamente, fa il polling, processa
   il job. Visibile nei log Xcode (Console → device).

Se non funziona, troubleshoot:
- `APNS_PRODUCTION` lato Strapi DEVE coincidere con `aps-environment` in
  entitlements (development ↔ false; production ↔ true).
- Il bundle id deve essere identico in 4 posti: Xcode, capacitor.config.json,
  Apple Developer console, `APNS_BUNDLE_ID` in Strapi `.env`.
- Il file `.p8` su Strapi deve corrispondere al Team ID e Key ID di Apple.

## 9. Build TestFlight

```bash
# In Xcode:
# Product → Archive
# Aspetta che archive sia completo
# Click "Distribute App" → "App Store Connect" → "Upload"
```

Su App Store Connect:
1. Crea l'app (se non esiste già) con il bundle id.
2. Quando l'archive arriva (tipicamente 5-30 min), va in "TestFlight".
3. Aggiungi tester interni.

Per la release App Store:
- Cambia `aps-environment` a `production` in `App.entitlements`
- `APNS_PRODUCTION=true` in Strapi `.env`
- Riarchive + carica
- "Submit for Review" — Apple Review tipicamente 24-72h

## 10. Note finali

Il polling continuo in background sull'iOS NON è possibile (Apple lo blocca).
La strategia ufficiale è:
- App in foreground: polling 10s come su Android/desktop.
- App in background: APNs silent push wake-up, l'app fa **un singolo ciclo**
  di sync, poi torna a dormire. Latency tipica < 5s dal create job.
- App killed dall'utente: non c'è wake-up. Il job rimane pending finché
  l'utente non riapre l'app.

Vuoi un comportamento sempre-on stile Android? Servirebbero workaround
fragili (VoIP push abuse) che rischiano la rejection App Store. Sconsigliato.
