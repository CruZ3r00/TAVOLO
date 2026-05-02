/**
 * Probe per identificare il driver corretto a partire da host:port aperto.
 *
 * Mappatura tra "porta tipica" e "candidati driver":
 *   - 80, 443  → epson-fpmate (HTTP/SOAP /cgi-bin/fpmate.cgi)
 *   - 9100     → italretail (XON), custom-xon, escpos-fiscal
 *   - 9101     → italretail (variante)
 *   - 6000     → generic-ecr (OPI XML)
 *   - 9000     → jpos (ISO-8583 lite)
 *   - 9999     → nexi-p17 (Protocollo 17 / ECR17)
 *   - 10001    → nexi-p17 (variante JSONPOS, riservata)
 *   - 8080/8443 → epson-fpmate (HTTP non-standard)
 *
 * Per ognuna, una probe **leggera**: per HTTP fa un GET; per i protocolli TCP
 * binari, chiede uno status command. Il fallback è `unknown` (mostra IP+porta
 * e l'utente sceglie a mano).
 */

import { sendTcpOnce } from '../../plugins/tcpSocket';

export interface DriverCandidate {
  /** Nome del driver match-ato (chiave PRINTERS/PAYMENTS map). */
  driver: string;
  /** Categoria: 'printer' (RT) o 'payment' (POS). */
  kind: 'printer' | 'payment';
  /** Confidence 0..1. >0.7 = match strong; 0.3..0.7 = candidate; <0.3 = guess. */
  confidence: number;
  /** Eventuale info aggiuntiva (vendor string, modello). */
  hint?: string;
}

export interface ProbeResult {
  host: string;
  port: number;
  candidates: DriverCandidate[];
  rawSnippet?: string;
}

const PORT_HINTS: Record<number, DriverCandidate[]> = {
  80: [
    { driver: 'epson-fpmate', kind: 'printer', confidence: 0.4, hint: 'HTTP standard' },
  ],
  443: [
    { driver: 'epson-fpmate', kind: 'printer', confidence: 0.4, hint: 'HTTPS' },
  ],
  6000: [
    { driver: 'generic-ecr', kind: 'payment', confidence: 0.6, hint: 'OPI XML standard' },
  ],
  9000: [
    { driver: 'jpos', kind: 'payment', confidence: 0.55, hint: 'JPOS / ISO-8583 lite' },
  ],
  9100: [
    { driver: 'italretail', kind: 'printer', confidence: 0.5, hint: 'XON-XOFF over TCP (Italretail / Custom)' },
    { driver: 'custom-xon', kind: 'printer', confidence: 0.45 },
    { driver: 'escpos-fiscal', kind: 'printer', confidence: 0.35 },
  ],
  9101: [
    { driver: 'italretail', kind: 'printer', confidence: 0.5, hint: 'porta secondaria Italretail' },
    { driver: 'custom-xon', kind: 'printer', confidence: 0.4 },
  ],
  9999: [
    { driver: 'nexi-p17', kind: 'payment', confidence: 0.7, hint: 'Protocollo 17 / ECR17 (Nexi)' },
  ],
  10001: [
    { driver: 'nexi-p17', kind: 'payment', confidence: 0.45, hint: 'JSONPOS variante' },
  ],
  8080: [
    { driver: 'epson-fpmate', kind: 'printer', confidence: 0.35 },
  ],
  8443: [
    { driver: 'epson-fpmate', kind: 'printer', confidence: 0.35 },
  ],
};

export const DEFAULT_SCAN_PORTS: number[] = Object.keys(PORT_HINTS).map(Number).sort((a, b) => a - b);

/**
 * Probe ATTIVA (best-effort): tenta una piccola interrogazione applicativa per
 * "alzare" la confidence dai port-based hints. Se la probe fallisce o non è
 * conclusiva, restituisce solo i candidati port-based.
 */
export async function probeDriver(host: string, port: number): Promise<ProbeResult> {
  const baseCandidates = PORT_HINTS[port] ?? [];
  const result: ProbeResult = { host, port, candidates: [...baseCandidates] };

  // 1) Per porte 80/443/8080/8443: HTTP HEAD/GET tramite fetch (non serve TCP plugin)
  if ([80, 443, 8080, 8443].includes(port)) {
    try {
      const proto = port === 443 || port === 8443 ? 'https' : 'http';
      const url = `${proto}://${host}:${port}/cgi-bin/fpmate.cgi`;
      const ctrl = new AbortController();
      const tmo = setTimeout(() => ctrl.abort(), 2_000);
      try {
        const resp = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(tmo);
        if (resp.status > 0) {
          // Endpoint Epson FPMate raggiungibile. Bump confidence.
          for (const c of result.candidates) {
            if (c.driver === 'epson-fpmate') c.confidence = Math.min(1, c.confidence + 0.4);
          }
          result.rawSnippet = `HTTP ${resp.status}`;
        }
      } catch (_) {
        clearTimeout(tmo);
        /* probe fallita, lasciamo solo gli hints port-based */
      }
    } catch (_) {
      /* swallow */
    }
    return finalize(result);
  }

  // 2) Per le porte TCP binarie: invio un payload "status" innocuo del driver più probabile.
  //    Se rispondono coerentemente (no NAK rumoroso, no socket reset immediato), bump.
  try {
    const probePayload = makeStatusProbe(port);
    if (!probePayload) return finalize(result);
    const resp = await sendTcpOnce(host, port, probePayload, { timeoutMs: 1_500, quietMs: 200 });
    if (resp.length > 0) {
      const text = new TextDecoder('latin1').decode(resp.subarray(0, Math.min(resp.length, 64)));
      result.rawSnippet = text;
      // Heuristics minime
      const heur = matchProbeResponse(port, resp, text);
      for (const c of result.candidates) {
        if (heur.boostDrivers.includes(c.driver)) {
          c.confidence = Math.min(1, c.confidence + heur.boost);
        }
      }
    }
  } catch (_) {
    /* probe TCP fallita, lasciamo i port-based hints */
  }

  return finalize(result);
}

/**
 * Costruisce un payload "status" minimale per la porta. Il payload deve essere
 * il più possibile innocuo (non causa stampe/movimenti finanziari).
 */
function makeStatusProbe(port: number): Uint8Array | null {
  if (port === 9100 || port === 9101) {
    // ESC % ? ETX → "query status" Custom XON. Innocuo.
    return new Uint8Array([0x1b, 0x25, 0x3f, 0x03]);
  }
  if (port === 6000) {
    // OPI Diagnosis (4-byte ASCII length + minimal XML).
    const xml = `<?xml version="1.0"?><ServiceRequest RequestType="Diagnosis" RequestID="000001" WorkstationID="POS01" POPID="1"/>`;
    const body = new TextEncoder().encode(xml);
    const len = String(body.length).padStart(4, '0');
    const out = new Uint8Array(4 + body.length);
    out.set(new TextEncoder().encode(len), 0);
    out.set(body, 4);
    return out;
  }
  if (port === 9000) {
    // ISO-8583 0800 minimal Network Management. Risposta attesa 0810.
    const mti = new TextEncoder().encode('08008000000000000000');
    const out = new Uint8Array(2 + mti.length);
    out[0] = (mti.length >> 8) & 0xff;
    out[1] = mti.length & 0xff;
    out.set(mti, 2);
    return out;
  }
  if (port === 9999 || port === 10001) {
    // P17 Status: STX | "OP=STAT|TID=PROBE|WID=PROBE" | ETX | LRC
    const body = new TextEncoder().encode('OP=STAT|TID=PROBE|WID=PROBE');
    const out = new Uint8Array(body.length + 3);
    out[0] = 0x02;
    out.set(body, 1);
    out[body.length + 1] = 0x03;
    let lrc = 0x7f;
    for (let i = 1; i < body.length + 2; i++) lrc ^= out[i];
    out[body.length + 2] = lrc;
    return out;
  }
  return null;
}

function matchProbeResponse(
  port: number,
  buf: Uint8Array,
  text: string,
): { boostDrivers: string[]; boost: number } {
  if (port === 9100 || port === 9101) {
    // Custom XON: risposta inizia con STX (0x02). Bump per italretail/custom-xon.
    if (buf.length > 0 && buf[0] === 0x02) {
      return { boostDrivers: ['italretail', 'custom-xon', 'escpos-fiscal'], boost: 0.3 };
    }
  }
  if (port === 6000 && /OverallResult/i.test(text)) {
    return { boostDrivers: ['generic-ecr'], boost: 0.35 };
  }
  if (port === 9000 && buf.length > 4) {
    const head = new TextDecoder().decode(buf.subarray(2, 6));
    if (head === '0810') return { boostDrivers: ['jpos'], boost: 0.4 };
  }
  if ((port === 9999 || port === 10001) && buf.length >= 4) {
    // P17 risponde con ACK (0x06) o frame STX...ETX|LRC
    if (buf[0] === 0x06 || buf[0] === 0x02) {
      return { boostDrivers: ['nexi-p17'], boost: 0.25 };
    }
  }
  return { boostDrivers: [], boost: 0 };
}

function finalize(result: ProbeResult): ProbeResult {
  result.candidates.sort((a, b) => b.confidence - a.confidence);
  return result;
}
