# AppDelegate.swift — modifiche per APNs silent push

`cap add ios` genera `ios/App/App/AppDelegate.swift`. Per gestire correttamente
il silent push wake-up, l'AppDelegate deve forwardare `didReceiveRemoteNotification`
al BridgeViewController di Capacitor — il plugin `@capacitor/push-notifications`
NON lo fa automaticamente per i silent push (solo per quelli con alert UI).

## File generato di default

Capacitor genera qualcosa tipo:

```swift
import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    return true
  }

  func application(_ application: UIApplication,
                   didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
  }

  func application(_ application: UIApplication,
                   didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
  }
  // ...
}
```

## Patch — aggiungi questo metodo

```swift
// Silent push: chiamato quando arriva un push con content-available=1.
// Il completion handler DEVE essere chiamato entro ~30s, altrimenti iOS
// considera la chiamata "non riuscita" e penalizza il delivery futuro.
func application(_ application: UIApplication,
                 didReceiveRemoteNotification userInfo: [AnyHashable : Any],
                 fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    // Notifica il plugin Capacitor che dispatcha verso JS via 'pushNotificationReceived'
    NotificationCenter.default.post(
        name: Notification.Name("CAPNotificationsBackgroundReceived"),
        object: nil,
        userInfo: userInfo
    )
    // Diamo ~25s al JS per fare il sync. In pratica `wakeAndSyncOnce()`
    // ci mette 1-3s, quindi backgrounding completo.
    DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
        completionHandler(.newData)
    }
}
```

## Nota importante sul plugin push-notifications

Il plugin Capacitor ufficiale, di default, **non emette `pushNotificationReceived`
per i silent push** (solo per push con alert/badge). Se vedi che l'evento JS
non arriva, può essere necessario:

1. Verificare la versione del plugin (`npm ls @capacitor/push-notifications`).
   Versioni 5.0+ supportano silent push tramite `didReceiveRemoteNotification`.
2. Confermare che `aps-environment` in App.entitlements corrisponda a
   `APNS_PRODUCTION` lato Strapi.
3. Verificare che il payload del push contenga `aps.content-available: 1`
   (è quello che Strapi `services/apns/index.js` fa già).

In caso di problemi persistenti, alternativa: scrivere un plugin Capacitor
custom in Swift che intercetta `didReceiveRemoteNotification` e chiama
direttamente il bridge JS — più affidabile ma ~1 giorno di lavoro extra.
