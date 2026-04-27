/**
 * Foreground Service wrapper.
 * Espone start/stop sopra il plugin Capacitor nativo Android `PosForegroundService`.
 * Su iOS non c'è equivalente: l'OS non permette servizi sempre-on. Su web fa no-op.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

interface PosForegroundServicePlugin {
  start(opts?: Record<string, unknown>): Promise<{ running: boolean }>;
  stop(opts?: Record<string, unknown>): Promise<{ running: boolean }>;
  getStatus(): Promise<{ running: boolean }>;
}

const Native = registerPlugin<PosForegroundServicePlugin>('PosForegroundService');

function available(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PosForegroundService');
}

export async function startForegroundService(): Promise<boolean> {
  if (!available()) return false;
  try {
    const r = await Native.start({});
    return r.running;
  } catch (err) {
    console.warn('[foregroundService] start fallita:', err);
    return false;
  }
}

export async function stopForegroundService(): Promise<void> {
  if (!available()) return;
  try {
    await Native.stop({});
  } catch (err) {
    console.warn('[foregroundService] stop fallita:', err);
  }
}

export function isForegroundServiceAvailable(): boolean {
  return available();
}
