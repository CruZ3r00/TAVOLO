/**
 * TcpSocket — JS wrapper sopra il plugin Capacitor nativo `PosTcpSocket`
 * (implementato in `android/app/src/main/java/.../PosTcpSocketPlugin.kt`).
 *
 * Espone un'API minimale request/response:
 *   - sendOnce(host, port, payloadHex, { timeoutMs }) → responseHex
 *   - resolves quando la connessione si chiude o dopo `quietMs` di silenzio
 *
 * Se il plugin nativo non è registrato (es. build web in Vite dev), tutte
 * le call lanciano DRIVER_UNAVAILABLE con istruzioni per buildare nativo.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

interface PosTcpSocketPlugin {
  sendOnce(opts: {
    host: string;
    port: number;
    payloadBase64: string;
    timeoutMs: number;
    quietMs?: number;
  }): Promise<{ responseBase64: string }>;
  probePort(opts: {
    host: string;
    port: number;
    timeoutMs?: number;
  }): Promise<{ open: boolean; latencyMs: number; error?: string }>;
}

const Native = registerPlugin<PosTcpSocketPlugin>('PosTcpSocket');

function isAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PosTcpSocket');
}

export async function sendTcpOnce(
  host: string,
  port: number,
  payload: Uint8Array,
  opts: { timeoutMs: number; quietMs?: number } = { timeoutMs: 30_000 },
): Promise<Uint8Array> {
  if (!isAvailable()) {
    throw new Error(
      'PosTcpSocket plugin non disponibile. Build nativo Android richiesto (cap sync + cap run android).',
    );
  }
  const payloadBase64 = uint8ToBase64(payload);
  const res = await Native.sendOnce({
    host,
    port,
    payloadBase64,
    timeoutMs: opts.timeoutMs,
    quietMs: opts.quietMs,
  });
  return base64ToUint8(res.responseBase64);
}

export function tcpAvailable(): boolean {
  return isAvailable();
}

/**
 * TCP connect-only probe (no IO). Resolve sempre con { open, latencyMs }.
 * Usato dal portScanner della LAN discovery.
 *
 * Su web/dev (plugin non disponibile) ritorna { open: false } senza throw,
 * così la discovery rimane "graceful" anche in modalità dev.
 */
export async function probePort(
  host: string,
  port: number,
  timeoutMs: number = 300,
): Promise<{ open: boolean; latencyMs: number; error?: string }> {
  if (!isAvailable()) {
    return { open: false, latencyMs: 0, error: 'PosTcpSocket non disponibile (build web)' };
  }
  return Native.probePort({ host, port, timeoutMs });
}

function uint8ToBase64(arr: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
