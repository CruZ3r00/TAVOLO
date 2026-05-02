/**
 * NetworkInfo — wrapper JS sul plugin Capacitor `NetworkInfo`.
 * Ritorna il CIDR della LAN su cui è connesso il device.
 *
 * Su web/dev (plugin non disponibile) ritorna `{ present: false }` — la
 * discovery è degraded ma l'app funziona lo stesso.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export interface LocalSubnet {
  ipv4?: string;
  gateway?: string | null;
  netmask?: string;
  cidr?: number;
  source?: string;
  present: boolean;
  error?: string;
}

interface NetworkInfoPlugin {
  getLocalSubnet(): Promise<LocalSubnet>;
}

const Native = registerPlugin<NetworkInfoPlugin>('NetworkInfo');

function isAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NetworkInfo');
}

export async function getLocalSubnet(): Promise<LocalSubnet> {
  if (!isAvailable()) {
    return { present: false, error: 'NetworkInfo plugin non disponibile (build web)' };
  }
  return Native.getLocalSubnet();
}

export function networkInfoAvailable(): boolean {
  return isAvailable();
}
