/**
 * Network info service — espone helper TS sul CIDR locale.
 * Riusa il plugin nativo `NetworkInfo` ma aggiunge enumeration degli host della
 * subnet (skippando broadcast e l'IP locale).
 */

import { getLocalSubnet, type LocalSubnet } from '../../plugins/networkInfo';

export interface SubnetInfo extends LocalSubnet {
  /** Lista IP host validi /24 (escluso .0 broadcast e .255 broadcast). */
  hosts?: string[];
}

/** Ritorna i 254 host della /24 a cui appartiene `ipv4`. Per /N diversi calcola la window. */
export function enumerateHosts(ipv4: string, cidr: number = 24, skipSelf: boolean = true): string[] {
  if (cidr < 16 || cidr > 30) {
    // Limite: /16..30. Per /16 è 65k host: troppi → ce ne fermiamo a /24.
    cidr = 24;
  }
  const ipNum = ipToInt(ipv4);
  if (ipNum === null) return [];
  const mask = cidr === 32 ? 0xffffffff : (0xffffffff << (32 - cidr)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const out: string[] = [];
  for (let n = network + 1; n < broadcast; n++) {
    if (skipSelf && n === ipNum) continue;
    out.push(intToIp(n));
  }
  return out;
}

export async function detectSubnet(): Promise<SubnetInfo> {
  const info = await getLocalSubnet();
  if (!info.present || !info.ipv4) return info;
  const hosts = enumerateHosts(info.ipv4, info.cidr ?? 24, true);
  return { ...info, hosts };
}

export function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isFinite(v) || v < 0 || v > 255) return null;
    n = ((n << 8) | v) >>> 0;
  }
  return n;
}

export function intToIp(n: number): string {
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}
