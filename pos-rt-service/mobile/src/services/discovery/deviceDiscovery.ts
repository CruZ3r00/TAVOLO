/**
 * Device discovery orchestrator.
 *
 * Pipeline:
 *   1. detectSubnet() → CIDR locale (Wi-Fi DHCP o iface fallback)
 *   2. enumerateHosts() → 254 host /24 (skip self)
 *   3. scanHosts() su porte canoniche → restituisce open ports
 *   4. probeDriver() su ogni open port → ranked candidates
 *   5. emette risultati incrementali via callback (UX live update)
 *
 * Ottimizzato per UX accettabile su rete consumer:
 *   - timeout connect 300ms
 *   - concurrency 50
 *   - probe attiva solo su match porte canoniche
 *
 * 254 host × 9 porte × 300ms = ~14 min sequenziali → con conc=50 si scende
 * a ~10s totali sul 99% dei router consumer testati. Cap massimo `maxHosts`
 * (default 254) per evitare /16 ipotetici.
 */

import { detectSubnet, enumerateHosts, type SubnetInfo } from './networkInfo';
import { scanHosts, type PortProbeResult } from './portScanner';
import { DEFAULT_SCAN_PORTS, probeDriver, type DriverCandidate, type ProbeResult } from './driverProbes';

export interface DiscoveredDevice {
  host: string;
  port: number;
  latencyMs: number;
  bestCandidate: DriverCandidate | null;
  candidates: DriverCandidate[];
  hint?: string;
  /** ISO ts del momento in cui è stato scoperto. */
  foundAt: string;
}

export interface DiscoveryOptions {
  /** Sovrascrive le porte da scannare. */
  ports?: number[];
  /** Sovrascrive la subnet rilevata. Es: '192.168.0.0/24'. */
  subnetOverride?: string;
  /** Cap host scannati. Default 254 (uno /24). */
  maxHosts?: number;
  /** Connect timeout. Default 300ms. */
  scanTimeoutMs?: number;
  /** Concurrency. Default 50. */
  concurrency?: number;
  /** Cancel signal. */
  signal?: AbortSignal;
  /** Notifica per risultato singolo (UI live update). */
  onDevice?: (d: DiscoveredDevice) => void;
  onPortResult?: (r: PortProbeResult) => void;
  onProgress?: (done: number, total: number) => void;
  onPhase?: (phase: 'detect' | 'scan' | 'probe' | 'done', meta?: any) => void;
}

export interface DiscoveryReport {
  subnet: SubnetInfo | null;
  devices: DiscoveredDevice[];
  scannedHosts: number;
  scannedPorts: number;
  durationMs: number;
}

export async function discoverDevices(opts: DiscoveryOptions = {}): Promise<DiscoveryReport> {
  const start = Date.now();
  opts.onPhase?.('detect');
  let subnet: SubnetInfo | null = null;
  let hosts: string[] = [];

  if (opts.subnetOverride) {
    const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec(opts.subnetOverride);
    if (m) {
      hosts = enumerateHosts(m[1], Number(m[2]), false);
      subnet = { ipv4: m[1], cidr: Number(m[2]), present: true, source: 'override', hosts };
    }
  }
  if (!subnet) {
    subnet = await detectSubnet();
    hosts = subnet?.hosts ?? [];
  }

  if (!subnet?.present || hosts.length === 0) {
    opts.onPhase?.('done', { reason: 'no_subnet' });
    return { subnet, devices: [], scannedHosts: 0, scannedPorts: 0, durationMs: Date.now() - start };
  }

  const cap = Math.max(0, Math.min(opts.maxHosts ?? 254, hosts.length));
  const scanHostsList = hosts.slice(0, cap);
  const ports = (opts.ports ?? DEFAULT_SCAN_PORTS).filter((p, i, a) => a.indexOf(p) === i);

  opts.onPhase?.('scan', { hosts: scanHostsList.length, ports: ports.length });
  const open = await scanHosts({
    hosts: scanHostsList,
    ports,
    timeoutMs: opts.scanTimeoutMs ?? 300,
    concurrency: opts.concurrency ?? 50,
    signal: opts.signal,
    onResult: opts.onPortResult,
    onProgress: opts.onProgress,
  });

  opts.onPhase?.('probe', { open: open.length });
  const devices: DiscoveredDevice[] = [];
  // Probe in parallelo limitato (16 paralleli max — se ci sono 100 porte aperte
  // serializzare aiuta a non saturare il device).
  const PROBE_CONCURRENCY = 16;
  let cursor = 0;
  async function probeWorker(): Promise<void> {
    while (cursor < open.length) {
      if (opts.signal?.aborted) return;
      const idx = cursor++;
      const o = open[idx];
      let probed: ProbeResult;
      try {
        probed = await probeDriver(o.host, o.port);
      } catch (_) {
        probed = { host: o.host, port: o.port, candidates: [] };
      }
      const best = probed.candidates[0] ?? null;
      const dev: DiscoveredDevice = {
        host: o.host,
        port: o.port,
        latencyMs: o.latencyMs,
        bestCandidate: best,
        candidates: probed.candidates,
        hint: probed.rawSnippet,
        foundAt: new Date().toISOString(),
      };
      devices.push(dev);
      opts.onDevice?.(dev);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, open.length) }, probeWorker),
  );

  opts.onPhase?.('done');
  return {
    subnet,
    devices,
    scannedHosts: scanHostsList.length,
    scannedPorts: ports.length,
    durationMs: Date.now() - start,
  };
}
