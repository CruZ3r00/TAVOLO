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
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Capacitor plugin: PosTcpStream
 *
 * Sessione TCP persistente. Rispetto a PosTcpSocket.sendOnce, qui open/send/recv
 * sono primitive separate — necessario per protocolli con risposta differita
 * (es. Protocollo 17 / ECR17 di Nexi: ACK immediato + risposta dopo PIN entry).
 *
 * JS API:
 *   open({host, port, timeoutMs}) → {sessionId}
 *   send({sessionId, payloadBase64}) → {bytesWritten}
 *   recv({sessionId, timeoutMs, maxBytes?}) → {responseBase64, bytes, eof}
 *   close({sessionId}) → {}
 *
 * Sessioni separate per dispositivo: ogni session ha mutex per evitare
 * race se più chiamate concorrenti. La mappa è ConcurrentHashMap.
 *
 * Sicurezza: nessun bind, nessun listen — siamo SEMPRE client. La sessione
 * vive il tempo del job; la `close()` è sempre chiamata in `try/finally` da JS.
 */
@CapacitorPlugin(name = "PosTcpStream")
class PosTcpStreamPlugin : Plugin() {

    private val supervisor: Job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + supervisor)

    private data class Session(val socket: Socket, val mutex: Mutex)

    private val sessions = ConcurrentHashMap<Int, Session>()
    private val nextId = AtomicInteger(1)

    @PluginMethod
    fun open(call: PluginCall) {
        val host = call.getString("host") ?: return call.reject("host mancante")
        val port = call.getInt("port") ?: return call.reject("port mancante")
        val timeoutMs = (call.getInt("timeoutMs") ?: 15_000).coerceIn(500, 60_000)

        scope.launch {
            try {
                val sock = Socket()
                sock.tcpNoDelay = true
                sock.connect(InetSocketAddress(host, port), timeoutMs)
                val id = nextId.getAndIncrement()
                sessions[id] = Session(sock, Mutex())
                val ret = JSObject()
                ret.put("sessionId", id)
                ret.put("localPort", sock.localPort)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: e.javaClass.simpleName, e)
            }
        }
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val sid = call.getInt("sessionId") ?: return call.reject("sessionId mancante")
        val payloadB64 = call.getString("payloadBase64") ?: return call.reject("payloadBase64 mancante")
        val s = sessions[sid] ?: return call.reject("sessione $sid non aperta")

        scope.launch {
            try {
                val bytes = Base64.decode(payloadB64, Base64.DEFAULT)
                s.mutex.withLock {
                    val out = s.socket.getOutputStream()
                    out.write(bytes)
                    out.flush()
                }
                val ret = JSObject()
                ret.put("bytesWritten", bytes.size)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: e.javaClass.simpleName, e)
            }
        }
    }

    /**
     * Legge fino a `maxBytes` (default 65536) o fino al timeout `timeoutMs`.
     * Comportamento: se `maxBytes==1`, ritorna appena 1 byte è disponibile (utile per ACK/NAK).
     * Se `maxBytes>1`, fa una read singola — se la rete spezza il pacchetto, JS deve loopare.
     * `eof=true` se l'input stream ha restituito -1 (peer ha chiuso).
     */
    @PluginMethod
    fun recv(call: PluginCall) {
        val sid = call.getInt("sessionId") ?: return call.reject("sessionId mancante")
        val timeoutMs = (call.getInt("timeoutMs") ?: 30_000).coerceIn(50, 300_000)
        val maxBytes = (call.getInt("maxBytes") ?: 65536).coerceIn(1, 1_048_576)
        val s = sessions[sid] ?: return call.reject("sessione $sid non aperta")

        scope.launch {
            try {
                val (data, eof) = s.mutex.withLock {
                    s.socket.soTimeout = timeoutMs
                    val buf = ByteArray(maxBytes)
                    try {
                        val n = s.socket.getInputStream().read(buf)
                        when {
                            n < 0 -> Pair(ByteArray(0), true)
                            n == 0 -> Pair(ByteArray(0), false)
                            else -> Pair(buf.copyOf(n), false)
                        }
                    } catch (e: java.net.SocketTimeoutException) {
                        Pair(ByteArray(0), false)
                    }
                }
                val ret = JSObject()
                ret.put("responseBase64", Base64.encodeToString(data, Base64.NO_WRAP))
                ret.put("bytes", data.size)
                ret.put("eof", eof)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: e.javaClass.simpleName, e)
            }
        }
    }

    @PluginMethod
    fun close(call: PluginCall) {
        val sid = call.getInt("sessionId") ?: return call.reject("sessionId mancante")
        val s = sessions.remove(sid)
        if (s != null) {
            try { s.socket.close() } catch (_: Throwable) { /* swallow */ }
        }
        call.resolve()
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        sessions.values.forEach { try { it.socket.close() } catch (_: Throwable) { /* swallow */ } }
        sessions.clear()
        supervisor.cancel()
    }
}
