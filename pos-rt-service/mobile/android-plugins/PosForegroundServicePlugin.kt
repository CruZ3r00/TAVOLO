package it.posrtservice.mobile.plugins

import android.content.Intent
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor plugin: PosForegroundService
 *
 * JS API:
 *   - start({}) → avvia il Foreground Service
 *   - stop({})  → lo ferma
 *   - getStatus({}) → { running: bool }
 *
 * Cliente JS in `src/plugins/foregroundService.ts`.
 */
@CapacitorPlugin(name = "PosForegroundService")
class PosForegroundServicePlugin : Plugin() {

    @PluginMethod
    fun start(call: PluginCall) {
        val ctx = context
        val intent = Intent(ctx, PosForegroundService::class.java).apply {
            action = PosForegroundService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
        val ret = JSObject()
        ret.put("running", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val ctx = context
        val intent = Intent(ctx, PosForegroundService::class.java).apply {
            action = PosForegroundService.ACTION_STOP
        }
        ctx.startService(intent) // delivers ACTION_STOP, service handles stopSelf
        val ret = JSObject()
        ret.put("running", false)
        call.resolve(ret)
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        // Nota: Android non offre un'API pubblica robusta per "è running?".
        // L'app può tenere lo stato lato JS oppure usare ActivityManager
        // (deprecated dal 5+). Per ora ritorniamo un best-effort.
        val ret = JSObject()
        ret.put("running", true) // se il plugin risponde, l'app è viva
        call.resolve(ret)
    }
}
