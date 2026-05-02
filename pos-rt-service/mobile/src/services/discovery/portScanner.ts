/**
 * Port scanner — TCP connect-only probe parallelizzato (concurrency-limited).
 *
 * Strategia conservativa:
 *  - Solo TCP connect: nessun byte inviato (zero rischio di interferire con
 *    dispositivi sensibili come stampanti fiscali).
 *  - Concurrency cap (default 50, override per host robusti).
 *  - AbortController per cancel pulito.
 *  - Zero allocazioni inutili: il risultato è streamed via callback `onResult`.
 *
 * Utilizzato da `deviceDiscovery.ts`. NON ha logica di interpretazione della
 * porta aperta: quello tocca a `driverProbes.ts`.
 */

import { probePort } from '../../plugins/tcpSocket';

export interface PortProbeResult {
  host: string;
  port: number;
  open: boolean;
  latencyMs: number;
  error?: string;
}

export interface ScanOptions {
  hosts: string[];
  ports: number[];
  /** Connect timeout per probe in ms. Default 300ms (router consumer ok). */
  timeoutMs?: number;
  /** Concurrency totale (host × port). Default 50. */
  concurrency?: number;
  signal?: AbortSignal;
  /** Notificato per ogni risultato (sia open=true che open=false). */
  onResult?: (r: PortProbeResult) => void;
  /** Notificato a ogni completed con il count progressivo. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Esegue lo scan e ritorna SOLO i risultati con `open=true` (gli `open=false`
 * sono comunque emessi via `onResult` se interessa al chiamante).
 */
export async function scanHosts(opts: ScanOptions): Promise<PortProbeResult[]> {
  const timeoutMs = opts.timeoutMs ?? 300;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 50, 256));
  const total = opts.hosts.length * opts.ports.length;
  if (total === 0) return [];

  const queue: Array<{ host: string; port: number }> = [];
  for (const host of opts.hosts) {
    for (const port of opts.ports) queue.push({ host, port });
  }

  const found: PortProbeResult[] = [];
  let done = 0;
  let cursor = 0;
  let aborted = false;
  if (opts.signal) {
    if (opts.signal.aborted) return [];
    opts.signal.addEventListener('abort', () => { aborted = true; });
  }

  async function worker(): Promise<void> {
    while (!aborted) {
      const idx = cursor++;
      if (idx >= queue.length) return;
      const job = queue[idx];
      let r: PortProbeResult;
      try {
        const out = await probePort(job.host, job.port, timeoutMs);
        r = { host: job.host, port: job.port, ...out };
      } catch (err: any) {
        r = {
          host: job.host,
          port: job.port,
          open: false,
          latencyMs: 0,
          error: err?.message || 'probe error',
        };
      }
      if (r.open) found.push(r);
      opts.onResult?.(r);
      done++;
      opts.onProgress?.(done, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return found;
}
