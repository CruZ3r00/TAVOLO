/**
 * APNs registration wrapper.
 *
 * Espone una API minimal sopra `@capacitor/push-notifications`:
 *   - requestPermissionAndRegister() → richiede permesso, registra token APNs,
 *     persiste in Preferences, fa PATCH /pos-devices/me/push-token
 *   - onPushReceived(cb) → callback chiamata su silent push (content-available)
 *
 * Solo iOS. Su Android/web ritorna no-op.
 *
 * NOTE iOS:
 *   - Il token che riceviamo è in formato hex (es. "abc123...64chars-256chars").
 *   - APNs production vs sandbox endpoint è deciso dal flag `aps-environment`
 *     in App.entitlements + dal flag `APNS_PRODUCTION` lato Strapi.
 *   - Il permesso può essere richiesto solo una volta. Se l'utente nega
 *     diventa permanente fino a revoca manuale dalle Settings iOS.
 */

import { Capacitor } from '@capacitor/core';
import { devicePersistence } from '../core/persistence';
import { HttpClient } from '../core/httpClient';

export type PushReceivedHandler = (data: Record<string, unknown>) => void | Promise<void>;

const handlers = new Set<PushReceivedHandler>();
let listenersWired = false;

function isApnsCapable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

async function getPushPlugin(): Promise<typeof import('@capacitor/push-notifications').PushNotifications | null> {
  if (!isApnsCapable()) return null;
  try {
    const mod = await import('@capacitor/push-notifications');
    return mod.PushNotifications;
  } catch (err) {
    console.warn('[apns] @capacitor/push-notifications non disponibile:', err);
    return null;
  }
}

export async function requestPermissionAndRegister(): Promise<{ ok: boolean; reason?: string; token?: string | null }> {
  const PN = await getPushPlugin();
  if (!PN) {
    return { ok: false, reason: 'platform-not-ios' };
  }

  // 1. Richiede il permesso (modale di sistema)
  const perm = await PN.requestPermissions();
  if (perm.receive !== 'granted') {
    return { ok: false, reason: `permission-${perm.receive}` };
  }

  // 2. Wire listeners e registra
  await wireListeners(PN);

  return new Promise((resolve) => {
    let resolved = false;
    const onReg = async (token: { value: string }) => {
      if (resolved) return;
      resolved = true;
      const cleaned = token.value.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
      await devicePersistence.saveApnsToken(cleaned);
      try {
        await syncPushTokenWithStrapi(cleaned);
      } catch (err: any) {
        console.warn('[apns] sync token to Strapi fallita:', err?.message || err);
      }
      resolve({ ok: true, token: cleaned });
    };
    const onErr = (err: { error: string }) => {
      if (resolved) return;
      resolved = true;
      console.warn('[apns] registrationError:', err);
      resolve({ ok: false, reason: err.error });
    };
    PN.addListener('registration', onReg);
    PN.addListener('registrationError', onErr);
    PN.register().catch((err) => {
      if (resolved) return;
      resolved = true;
      resolve({ ok: false, reason: err?.message || 'register-failed' });
    });
  });
}

export async function syncPushTokenWithStrapi(token?: string | null): Promise<void> {
  const device = await devicePersistence.get();
  if (!device) return;
  const apnsToken = token ?? (await devicePersistence.getApnsToken());
  const platform = await devicePersistence.getPlatform();
  const client = new HttpClient({ baseURL: device.strapiUrl, allowInsecure: !/^https:/i.test(device.strapiUrl) });
  await client.patch('/api/pos-devices/me/push-token', {
    apns_token: apnsToken,
    platform,
  }, { retries: 1 });
}

export function onPushReceived(cb: PushReceivedHandler): () => void {
  handlers.add(cb);
  return () => handlers.delete(cb);
}

async function wireListeners(PN: NonNullable<Awaited<ReturnType<typeof getPushPlugin>>>): Promise<void> {
  if (listenersWired) return;
  listenersWired = true;
  await PN.addListener('pushNotificationReceived', async (notification) => {
    const data = (notification?.data as Record<string, unknown>) || {};
    for (const h of handlers) {
      try { await h(data); } catch (err) { console.warn('[apns] handler error:', err); }
    }
  });
  // Click su notifica — non rilevante per silent push, ma meglio
  // wirarlo per evitare warning "no listener" in futuro.
  await PN.addListener('pushNotificationActionPerformed', () => {
    /* no-op v1 */
  });
}

/**
 * Da chiamare in main.ts all'avvio dell'app per wirare i listener anche se
 * l'utente non ha ancora chiesto la registrazione (es. silent push arriva
 * dopo che il permesso è già stato dato in una sessione precedente).
 */
export async function bootstrapListeners(): Promise<void> {
  const PN = await getPushPlugin();
  if (!PN) return;
  await wireListeners(PN);
  // Se l'app aveva già il permesso, register() è idempotente: rinfresca il token.
  try {
    const perm = await PN.checkPermissions();
    if (perm.receive === 'granted') {
      await PN.register();
    }
  } catch (err) {
    console.warn('[apns] bootstrap listeners:', err);
  }
}

export function isApnsAvailable(): boolean {
  return isApnsCapable();
}
