package it.posrtservice.mobile.plugins

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import it.posrtservice.mobile.MainActivity
import it.posrtservice.mobile.R

/**
 * Foreground Service che tiene vivo il processo e la WebView Capacitor anche
 * quando l'app va in background o lo schermo si spegne. La logica di polling
 * resta nel JS (scheduler.ts) — il service garantisce solo che il processo
 * non venga ucciso dal system reaper.
 *
 * Una notifica permanente è obbligatoria su Android 8+ per i Foreground Service.
 *
 * Avvio: il plugin `PosForegroundService` chiama startForegroundService(intent).
 * Stop:  stopService(intent) o stopSelf().
 */
class PosForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "pos_rt_service_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "it.posrtservice.mobile.START_FG"
        const val ACTION_STOP = "it.posrtservice.mobile.STOP_FG"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                val notification = buildNotification()
                startForeground(NOTIFICATION_ID, notification)
            }
        }
        // START_STICKY: se il processo viene ucciso, l'OS prova a ricrearlo.
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            this,
            0,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("pos-rt-service attivo")
            .setContentText("Polling jobs cassa fiscale e POS in corso.")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val chan = NotificationChannel(
            CHANNEL_ID,
            "pos-rt-service",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Notifica permanente che mantiene il servizio attivo in background."
            setShowBadge(false)
        }
        nm.createNotificationChannel(chan)
    }
}
