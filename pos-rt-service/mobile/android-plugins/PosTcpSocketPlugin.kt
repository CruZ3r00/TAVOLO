package it.posrtservice.mobile.plugins

import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Capacitor plugin: PosTcpSocket
 *
 * JS API: sendOnce({ host, port, payloadBase64, timeoutMs, quietMs }) →
 *   { responseBase64 }
 *
 * Apre una connessione TCP, scrive il payload, legge fino a "quiet timeout"
 * (default 200ms di silenzio = fine risposta) o "timeoutMs" totale, chiude.
 * Una sola conversazione per chiamata. Lock globale per prevenire collisioni
 * sullo stesso device hardware.
 */
@CapacitorPlugin(name = "PosTcpSocket")
class PosTcpSocketPlugin : Plugin() {

    private val supervisor: Job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + supervisor)
    private val mutex = Mutex()

    @PluginMethod
    fun sendOnce(call: PluginCall) {
        val host = call.getString("host") ?: return call.reject("host mancante")
        val port = call.getInt("port") ?: return call.reject("port mancante")
        val payloadB64 = call.getString("payloadBase64") ?: return call.reject("payloadBase64 mancante")
        val timeoutMs = (call.getInt("timeoutMs") ?: 30_000).toLong()
        val quietMs = (call.getInt("quietMs") ?: 200).toLong()

        scope.launch {
            try {
                val payload = Base64.decode(payloadB64, Base64.DEFAULT)
                mutex.withLock {
                    val response = sendAndReceive(host, port, payload, timeoutMs, quietMs)
                    val ret = JSObject()
                    ret.put("responseBase64", Base64.encodeToString(response, Base64.NO_WRAP))
                    call.resolve(ret)
                }
            } catch (e: Throwable) {
                call.reject(e.message ?: e.javaClass.simpleName, e)
            }
        }
    }

    private suspend fun sendAndReceive(
        host: String,
        port: Int,
        payload: ByteArray,
        timeoutMs: Long,
        quietMs: Long,
    ): ByteArray {
        val result = withTimeoutOrNull(timeoutMs) {
            Socket().use { sock ->
                sock.connect(InetSocketAddress(host, port), timeoutMs.toInt().coerceAtMost(15_000))
                sock.soTimeout = quietMs.toInt()
                sock.getOutputStream().apply {
                    write(payload)
                    flush()
                }
                val buf = ByteArray(4096)
                val out = mutableListOf<Byte>()
                val input = sock.getInputStream()
                while (true) {
                    val n = try {
                        input.read(buf)
                    } catch (e: java.net.SocketTimeoutException) {
                        break // quiet → finiamo
                    }
                    if (n <= 0) break
                    for (i in 0 until n) out.add(buf[i])
                    if (out.size > 1_048_576) {
                        throw IllegalStateException("Risposta TCP > 1 MB, abort")
                    }
                }
                out.toByteArray()
            }
        } ?: throw java.net.SocketTimeoutException("PosTcpSocket: timeout dopo ${timeoutMs}ms")
        return result
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        supervisor.cancel()
    }
}
