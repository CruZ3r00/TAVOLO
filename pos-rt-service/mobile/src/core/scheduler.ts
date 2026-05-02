/**
 * Scheduler outbound polling — chiede a Strapi se ci sono job pending.
 * Equivalente mobile di pos-rt-service/src/services/scheduler.js +
 * syncService.js.
 *
 * Comportamento:
 *  - tick ogni N secondi (default 10, configurabile in Settings)
 *  - GET /api/pos-devices/me/jobs?since=<cursor>
 *  - per ogni job → enqueue + dispatch handler (payment/print)
 *  - heartbeat ogni 30s (refresh last_seen lato Strapi)
 *  - su iOS in background NON gira: sostituito da APNs silent push wake-up
 *    che fa un ciclo singolo
 */

import { HttpClient } from './httpClient';
import { devicePersistence } from './persistence';
import { jobHandlers, type Job } from './jobHandlers';
import { auditLog } from './auditLog';
import { persistedIdempotencyStore } from './idempotency';
import { startForegroundService, stopForegroundService } from '../plugins/foregroundService';

let _interval: any = null;
let _heartbeatInterval: any = null;
let _running = false;
let _client: HttpClient | null = null;

interface MyJobsResponse {
  data: Array<{
    id: string;
    event_id: string;
    kind: string;
    payload: Record<string, unknown>;
    priority: number;
    created_at?: string;
  }>;
  meta: { next_cursor: string | null; count: number };
}

interface AckBody {
  result: 'success' | 'failure';
  outcome: Record<string, unknown>;
}

async function buildClient(): Promise<HttpClient | null> {
  const device = await devicePersistence.get();
  if (!device) return null;
  const insecure = (await devicePersistence.getPlatform()) === 'web' || /^http:\/\//i.test(device.strapiUrl);
  return new HttpClient({ baseURL: device.strapiUrl, allowInsecure: insecure, timeoutMs: 15_000 });
}

export async function tickOnce(): Promise<{ processed: number; errors: number }> {
  if (!_client) _client = await buildClient();
  if (!_client) return { processed: 0, errors: 0 };

  const cursor = await devicePersistence.getLastCursor();
  let resp: MyJobsResponse;
  try {
    resp = await _client.get<MyJobsResponse>('/api/pos-devices/me/jobs', {
      query: { limit: 50, since: cursor || undefined },
      retries: 1,
    });
  } catch (err: any) {
    await auditLog.append({ kind: 'poll.error', meta: { error: err.message } });
    return { processed: 0, errors: 1 };
  }

  let processed = 0;
  let errors = 0;
  for (const row of resp.data || []) {
    const job: Job = {
      id: row.id,
      event_id: row.event_id,
      kind: row.kind,
      payload: row.payload || {},
      priority: row.priority,
    };
    try {
      const outcome = await jobHandlers.dispatch(job);
      await ack(job.event_id, { result: 'success', outcome });
      await auditLog.append({
        kind: 'job.done',
        eventId: job.event_id,
        payload: { kind: job.kind },
      });
      processed++;
    } catch (err: any) {
      await ack(job.event_id, {
        result: 'failure',
        outcome: { error_code: err.code || 'UNKNOWN', error_message: err.message },
      });
      await auditLog.append({
        kind: 'job.failed',
        eventId: job.event_id,
        payload: { kind: job.kind, error: err.message },
      });
      errors++;
    }
  }

  if (resp.meta?.next_cursor) {
    await devicePersistence.setLastCursor(resp.meta.next_cursor);
  }
  return { processed, errors };
}

async function ack(eventId: string, body: AckBody): Promise<void> {
  if (!_client) return;
  try {
    await _client.post(`/api/pos-devices/me/jobs/${encodeURIComponent(eventId)}/ack`, body, {
      retries: 2,
    });
  } catch (err: any) {
    await auditLog.append({
      kind: 'ack.failed',
      eventId,
      meta: { error: err.message },
    });
  }
}

async function heartbeat(): Promise<void> {
  if (!_client) return;
  try {
    await _client.post('/api/pos-devices/me/heartbeat', {
      version: '1.0.0-mobile',
      uptime: performance.now() / 1000,
      platform: await devicePersistence.getPlatform(),
    }, { retries: 1 });
  } catch (_) {
    /* swallow */
  }
}

export async function start(): Promise<void> {
  if (_running) return;
  _running = true;
  _client = await buildClient();
  if (!_client) {
    _running = false;
    return;
  }
  // Avvia il Foreground Service Android (no-op su iOS/web).
  await startForegroundService();

  // GC dei record di idempotency vecchi (best-effort, non bloccante).
  persistedIdempotencyStore
    .gc()
    .then((removed) => {
      if (removed > 0) auditLog.append({ kind: 'idempotency.gc', meta: { removed } }).catch(() => undefined);
    })
    .catch(() => undefined);

  const intervalSec = await devicePersistence.getPollInterval();
  // Polling
  _interval = setInterval(() => {
    tickOnce().catch(() => {
      /* errors gestiti dentro tickOnce */
    });
  }, intervalSec * 1000);
  // Heartbeat
  _heartbeatInterval = setInterval(() => {
    heartbeat().catch(() => undefined);
  }, 30 * 1000);
  // Tick immediato all'avvio
  tickOnce().catch(() => undefined);
}

export function stop(): void {
  _running = false;
  if (_interval) clearInterval(_interval);
  if (_heartbeatInterval) clearInterval(_heartbeatInterval);
  _interval = null;
  _heartbeatInterval = null;
  _client = null;
  // Ferma il Foreground Service Android (best-effort).
  stopForegroundService().catch(() => undefined);
}

export function isRunning(): boolean {
  return _running;
}

/**
 * Triggered da APNs silent push (iOS) o dall'utente: fa un singolo ciclo
 * di poll outside del setInterval.
 */
export async function wakeAndSyncOnce(): Promise<{ processed: number; errors: number }> {
  if (!_client) _client = await buildClient();
  if (!_client) return { processed: 0, errors: 0 };
  return tickOnce();
}
