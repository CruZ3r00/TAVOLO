/**
 * Modulo pairing — equivalente mobile di pos-rt-service/src/modules/pairing/index.js
 *
 * Flow:
 *   1. POST /api/auth/local con email/password → JWT utente
 *   2. POST /api/pos-devices/register con name+fingerprint → device_token
 *   3. Persiste device + token in @capacitor/preferences (cifrato a livello OS)
 *   4. (best-effort) Registra apns_token + platform via PATCH /me/push-token
 *
 * Niente claim-code: il claim-code (C-3 nel daemon) protegge la modalità
 * loopback locale. L'app mobile non espone API loopback al di fuori di sé,
 * quindi quel vector non si applica. La sicurezza qui sta nelle credenziali
 * Strapi e nel device_token cifrato.
 */

import { HttpClient, HttpError } from './httpClient';
import { devicePersistence, type DeviceRecord } from './persistence';

export interface PairInput {
  strapiUrl: string;
  email: string;
  password: string;
  deviceName?: string;
  allowInsecure?: boolean;
}

export interface PairByTokenInput {
  strapiUrl: string;
  pairingToken: string;
  deviceName?: string;
  allowInsecure?: boolean;
}

export interface PairResult {
  device: DeviceRecord;
  localPin?: string | null;
}

export async function pair(input: PairInput): Promise<PairResult> {
  const url = input.strapiUrl.replace(/\/+$/, '');
  if (!input.allowInsecure && !/^https:\/\//i.test(url)) {
    throw new HttpError('INVALID_URL', 'Solo HTTPS è accettato. Imposta dev mode per testare http://.');
  }
  const baseClient = new HttpClient({ baseURL: url, allowInsecure: !!input.allowInsecure });

  // 1. Login
  type LoginRes = { jwt: string; user: { id: number; email: string } };
  const login = await baseClient.post<LoginRes>('/api/auth/local', {
    identifier: input.email,
    password: input.password,
  }, { authed: false, retries: 0 });
  if (!login?.jwt) throw new HttpError('PAIRING_FAILED', 'Login fallito');

  // 2. Register device
  const fingerprint = await deriveFingerprint();
  const name = input.deviceName?.trim() || (await defaultDeviceName());

  type RegRes = {
    data: {
      documentId: string;
      name: string;
      device_token: string;
      strapi_url: string;
      ws_url: string;
    };
  };
  const reg = await baseClient.post<RegRes>(
    '/api/pos-devices/register',
    { name, fingerprint },
    {
      authed: false,
      headers: { Authorization: `Bearer ${login.jwt}` },
      retries: 0,
    },
  );
  if (!reg?.data?.device_token) throw new HttpError('PAIRING_FAILED', 'Server non ha restituito device_token');

  const device: DeviceRecord = {
    documentId: reg.data.documentId,
    name: reg.data.name,
    strapiUrl: reg.data.strapi_url || url,
    wsUrl: reg.data.ws_url || null,
    pairedAt: new Date().toISOString(),
  };
  await devicePersistence.save(device, reg.data.device_token);

  // 3. Best-effort: registra platform (e apns_token se già disponibile)
  try {
    const platform = await devicePersistence.getPlatform();
    const authed = new HttpClient({ baseURL: device.strapiUrl, allowInsecure: !!input.allowInsecure });
    const apnsToken = await devicePersistence.getApnsToken();
    await authed.patch('/api/pos-devices/me/push-token', {
      platform,
      ...(apnsToken ? { apns_token: apnsToken } : {}),
    }, { retries: 1 });
  } catch (err) {
    // Non bloccante: il pairing è riuscito, l'app può fare push-token PATCH dopo.
    console.warn('[pair] push-token PATCH fallita (non bloccante):', err);
  }

  return { device };
}

/**
 * Pairing tramite token single-use generato dalla pagina profilo Vue.
 * Niente credenziali Strapi nell'app, niente login JWT separato.
 */
export async function pairByToken(input: PairByTokenInput): Promise<PairResult> {
  const url = input.strapiUrl.replace(/\/+$/, '');
  if (!input.allowInsecure && !/^https:\/\//i.test(url)) {
    throw new HttpError('INVALID_URL', 'Solo HTTPS è accettato. Imposta dev mode per testare http://.');
  }
  if (!/^[a-f0-9]{64}$/i.test(input.pairingToken)) {
    throw new HttpError('INVALID_PAYLOAD', 'Token formato invalido (64 hex)');
  }

  const baseClient = new HttpClient({ baseURL: url, allowInsecure: !!input.allowInsecure });
  const fingerprint = await deriveFingerprint();
  const platform = await devicePersistence.getPlatform();
  const name = input.deviceName?.trim() || (await defaultDeviceName());

  type RegRes = {
    data: {
      documentId: string;
      name: string;
      device_token: string;
      strapi_url: string;
      ws_url: string;
    };
  };
  const reg = await baseClient.post<RegRes>(
    '/api/pos-devices/register-by-token',
    { token: input.pairingToken, name, fingerprint, platform },
    { authed: false, retries: 0 },
  );
  if (!reg?.data?.device_token) throw new HttpError('PAIRING_FAILED', 'Server non ha restituito device_token');

  const device: DeviceRecord = {
    documentId: reg.data.documentId,
    name: reg.data.name,
    strapiUrl: reg.data.strapi_url || url,
    wsUrl: reg.data.ws_url || null,
    pairedAt: new Date().toISOString(),
  };
  await devicePersistence.save(device, reg.data.device_token);

  // Best-effort PATCH push-token (idempotent: aggiorna platform; se ho già l'apns_token lo sincronizza).
  try {
    const authed = new HttpClient({ baseURL: device.strapiUrl, allowInsecure: !!input.allowInsecure });
    const apnsToken = await devicePersistence.getApnsToken();
    await authed.patch('/api/pos-devices/me/push-token', {
      platform,
      ...(apnsToken ? { apns_token: apnsToken } : {}),
    }, { retries: 1 });
  } catch (err) {
    console.warn('[pairByToken] push-token PATCH fallita (non bloccante):', err);
  }

  return { device };
}

export async function unpair(): Promise<void> {
  await devicePersistence.clear();
}

/**
 * Fingerprint: id stabile della macchina/device. Su mobile usiamo un UUID
 * generato la prima volta e persistito in Preferences (analogo a Android
 * ANDROID_ID o iOS identifierForVendor, ma evitiamo le API native per
 * non bloccarci dietro permessi e changeover OS).
 */
async function deriveFingerprint(): Promise<string> {
  const KEY = 'pos.fingerprint';
  const { Preferences } = await import('@capacitor/preferences');
  const existing = await Preferences.get({ key: KEY });
  if (existing.value) return existing.value;
  const fp = randomHex(32);
  await Preferences.set({ key: KEY, value: fp });
  return fp;
}

async function defaultDeviceName(): Promise<string> {
  const platform = await devicePersistence.getPlatform();
  return `${platform}-mobile-${randomHex(3)}`;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}
