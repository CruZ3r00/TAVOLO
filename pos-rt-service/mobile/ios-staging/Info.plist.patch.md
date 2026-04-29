# Info.plist patches per iOS

`cap add ios` genera `ios/App/App/Info.plist`. Applica questi patch DOPO la
generazione, oppure copia/incolla le sezioni nel plist esistente.

## 1. Background Modes — abilita silent push wake-up

Dentro il root `<dict>` aggiungi (o estendi se già presente):

```xml
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
</array>
```

`remote-notification` autorizza l'app a ricevere silent push (`content-available: 1`)
in background. Senza questo, le push arrivano solo se l'app è in foreground.

## 2. Privacy descriptions

iOS 14+ richiede descrizioni esplicite. Aggiungi:

```xml
<!-- Necessario per parlare con POS/RT in LAN (mDNS / IP locale) -->
<key>NSLocalNetworkUsageDescription</key>
<string>L'app comunica con la cassa fiscale e il terminale POS sulla tua rete locale.</string>

<!-- Per scoperta automatica del POS via Bonjour/mDNS (futuro) -->
<key>NSBonjourServices</key>
<array>
  <string>_http._tcp</string>
  <string>_pos._tcp</string>
</array>

<!-- Bluetooth (per future implementazioni POS BT) -->
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Connessione a terminali POS Bluetooth.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>Connessione a terminali POS Bluetooth.</string>
```

## 3. Esempio di Info.plist completo (sezioni rilevanti)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>pos-rt-mobile</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>

  <!-- ↓↓↓ Sezioni da aggiungere/verificare ↓↓↓ -->

  <key>UIBackgroundModes</key>
  <array>
    <string>remote-notification</string>
  </array>

  <key>NSLocalNetworkUsageDescription</key>
  <string>L'app comunica con la cassa fiscale e il terminale POS sulla tua rete locale.</string>

  <key>NSBonjourServices</key>
  <array>
    <string>_http._tcp</string>
    <string>_pos._tcp</string>
  </array>

  <key>NSBluetoothAlwaysUsageDescription</key>
  <string>Connessione a terminali POS Bluetooth.</string>

  <!-- ↑↑↑ Sezioni da aggiungere/verificare ↑↑↑ -->

  <!-- altre chiavi standard generate da Capacitor/Xcode ... -->
</dict>
</plist>
```
