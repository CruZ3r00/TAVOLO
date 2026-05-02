package it.posrtservice.mobile.plugins

import android.content.Context
import android.net.wifi.WifiManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.net.NetworkInterface

/**
 * Capacitor plugin: NetworkInfo
 *
 * JS API:
 *   getLocalSubnet() → { ipv4, gateway, netmask, cidr, ssid?, present }
 *
 * Strategia:
 *  1. Wi-Fi DHCP via WifiManager → ip / gateway / netmask
 *  2. Fallback a NetworkInterface (utile se l'app è connessa via Ethernet o
 *     Wi-Fi managed-by-OS dove WifiManager non espone il DHCP).
 *  3. Calcolo CIDR a partire da netmask (popcount dei bit a 1).
 */
@CapacitorPlugin(name = "NetworkInfo")
class NetworkInfoPlugin : Plugin() {

    @PluginMethod
    fun getLocalSubnet(call: PluginCall) {
        val ret = JSObject()
        try {
            val wifi = (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager?)
                ?.dhcpInfo
            if (wifi != null && wifi.ipAddress != 0) {
                val ip = intToIp(wifi.ipAddress)
                val gateway = if (wifi.gateway != 0) intToIp(wifi.gateway) else null
                val netmask = if (wifi.netmask != 0) intToIp(wifi.netmask) else "255.255.255.0"
                val cidr = netmaskToCidr(netmask) ?: 24
                ret.put("ipv4", ip)
                ret.put("gateway", gateway)
                ret.put("netmask", netmask)
                ret.put("cidr", cidr)
                ret.put("source", "wifi")
                ret.put("present", true)
                return call.resolve(ret)
            }

            // Fallback: enumera interfacce attive non-loopback
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return resolveAbsent(call)
            for (iface in interfaces.toList()) {
                if (iface.isLoopback || !iface.isUp) continue
                for (addr in iface.interfaceAddresses) {
                    val a = addr.address ?: continue
                    if (a.address.size != 4) continue
                    val prefix = addr.networkPrefixLength.toInt()
                    if (prefix <= 0 || prefix > 32) continue
                    ret.put("ipv4", a.hostAddress)
                    ret.put("gateway", null)
                    ret.put("netmask", cidrToNetmask(prefix))
                    ret.put("cidr", prefix)
                    ret.put("source", "iface:${iface.name}")
                    ret.put("present", true)
                    return call.resolve(ret)
                }
            }
            resolveAbsent(call)
        } catch (e: Throwable) {
            ret.put("present", false)
            ret.put("error", e.message ?: e.javaClass.simpleName)
            call.resolve(ret)
        }
    }

    private fun resolveAbsent(call: PluginCall) {
        val ret = JSObject()
        ret.put("present", false)
        ret.put("error", "nessuna interfaccia LAN attiva rilevata")
        call.resolve(ret)
    }

    private fun intToIp(addr: Int): String {
        // WifiManager.DhcpInfo restituisce gli ip in little-endian
        return "${addr and 0xFF}.${(addr shr 8) and 0xFF}.${(addr shr 16) and 0xFF}.${(addr shr 24) and 0xFF}"
    }

    private fun netmaskToCidr(mask: String): Int? {
        return try {
            val parts = mask.split(".").map { it.toInt() and 0xFF }
            if (parts.size != 4) return null
            var bits = 0
            for (p in parts) bits += Integer.bitCount(p)
            bits
        } catch (_: Throwable) { null }
    }

    private fun cidrToNetmask(cidr: Int): String {
        val mask = if (cidr == 0) 0 else (-1 shl (32 - cidr))
        return "${(mask shr 24) and 0xFF}.${(mask shr 16) and 0xFF}.${(mask shr 8) and 0xFF}.${mask and 0xFF}"
    }
}
