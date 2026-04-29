# Plugin nativi Android — istruzioni di integrazione

I file `.kt` in questa cartella sono i plugin Capacitor custom del servizio
mobile. **Non sono ancora attivi**: vanno copiati nel progetto Android dopo
averlo scaffoldato con `cap add android`.

## Setup completo (one-shot)

```bash
cd pos-rt-service/mobile
npm install
npm run build
npx cap add android      # genera la cartella android/
```

Dopo `cap add android` la cartella `android/` esiste, con un package come
`it.posrtservice.mobile`. Procedi:

```bash
mkdir -p android/app/src/main/java/it/posrtservice/mobile/plugins
cp android-plugins/*.kt android/app/src/main/java/it/posrtservice/mobile/plugins/
```

Verifica che la prima riga di ogni `.kt` sia:

```kotlin
package it.posrtservice.mobile.plugins
```

Se hai cambiato l'`appId` in `capacitor.config.json`, aggiorna i package
corrispondenti.

## Registra i plugin in MainActivity

Modifica `android/app/src/main/java/it/posrtservice/mobile/MainActivity.java`
(o `.kt`) per registrarli all'avvio:

```java
// MainActivity.java
package it.posrtservice.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import it.posrtservice.mobile.plugins.PosForegroundServicePlugin;
import it.posrtservice.mobile.plugins.PosTcpSocketPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PosForegroundServicePlugin.class);
    registerPlugin(PosTcpSocketPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
```

## Aggiungi al `AndroidManifest.xml`

Apri `android/app/src/main/AndroidManifest.xml` e aggiungi DENTRO `<manifest>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<!-- Android 14+ richiede un sub-type esplicito -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<!-- Android 13+: notifiche runtime -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<!-- Bluetooth (per future implementazioni POS BT) -->
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT"
                 tools:targetApi="31" />
```

E DENTRO `<application>` (sotto a `<activity>` di `MainActivity`):

```xml
<service
  android:name="it.posrtservice.mobile.plugins.PosForegroundService"
  android:enabled="true"
  android:exported="false"
  android:foregroundServiceType="dataSync" />
```

Aggiungi anche `xmlns:tools="http://schemas.android.com/tools"` al tag `<manifest>`
se non c'è.

## Build e run

```bash
npm run build
npx cap sync android
npx cap run android        # debug build su device/emulatore
```

Per APK release:

```bash
cd android
./gradlew assembleRelease
# APK in android/app/build/outputs/apk/release/
```

Nota: la build release richiede un keystore. Vedi
https://capacitorjs.com/docs/android/deploying-to-google-play

## Cosa fa cosa

| File | Ruolo |
|------|-------|
| `PosForegroundService.kt` | Servizio Android con notifica permanente che impedisce all'OS di killare il processo |
| `PosForegroundServicePlugin.kt` | Bridge Capacitor JS → start/stop del Foreground Service |
| `PosTcpSocketPlugin.kt` | Bridge Capacitor JS → API `sendOnce(host, port, payload, timeoutMs)`. Necessario per i driver TCP (custom-xon, escpos-fiscal, generic-ecr, jpos) |

I wrapper JS sono in:
- `src/plugins/foregroundService.ts`
- `src/plugins/tcpSocket.ts`

Loro non usano il plugin direttamente: lo fanno via `Capacitor.registerPlugin()`,
quindi se il plugin non è registrato (es. build web), tutte le chiamate
falliscono in modo controllato (`DRIVER_UNAVAILABLE` per TCP, no-op per FG).
