/**
 * Framing helpers per protocolli wire usati dai driver POS/RT.
 *
 *  - STX/ETX framing con LRC (Protocollo 17 / ECR17 — Nexi)
 *  - 4-byte ASCII length prefix (OPI XML — generic-ecr)
 *  - 2-byte big-endian length prefix (ISO-8583 lite — jpos)
 *
 * Tutto puro, niente IO. I driver compongono queste primitive con la sessione
 * TCP (sendOnce o tcpStream).
 */

import { lrc } from './lrc';

export const STX = 0x02;
export const ETX = 0x03;
export const ACK = 0x06;
export const NAK = 0x15;
export const SOH = 0x01;
export const EOT = 0x04;

/**
 * Wrap payload per Protocollo 17: `STX | payload | ETX | LRC`.
 * LRC = XOR di base (0x7F default) con tutti i byte di payload + ETX.
 * (STX è escluso dal calcolo del LRC, ETX è incluso, come da spec ECR17.)
 */
export function wrapStxEtxLrc(payload: Uint8Array, lrcBase: number = 0x7f): Uint8Array {
  const out = new Uint8Array(payload.length + 3);
  out[0] = STX;
  out.set(payload, 1);
  out[payload.length + 1] = ETX;
  out[payload.length + 2] = lrc(out.subarray(1, payload.length + 2), lrcBase);
  return out;
}

/**
 * Sblocca un frame `STX | payload | ETX | LRC`. Verifica LRC.
 * Throws Error se framing/LRC non valido.
 */
export function unwrapStxEtxLrc(
  buf: Uint8Array,
  lrcBase: number = 0x7f,
): { payload: Uint8Array; lrc: number } {
  if (buf.length < 4) throw new Error('frame: lunghezza minima 4 byte');
  if (buf[0] !== STX) throw new Error(`frame: STX atteso, trovato 0x${buf[0].toString(16)}`);
  const etxIdx = buf.length - 2;
  if (buf[etxIdx] !== ETX) throw new Error(`frame: ETX atteso a pos ${etxIdx}`);
  const expected = lrc(buf.subarray(1, etxIdx + 1), lrcBase);
  const got = buf[buf.length - 1];
  if (expected !== got) {
    throw new Error(`frame: LRC mismatch (atteso 0x${expected.toString(16)}, ricevuto 0x${got.toString(16)})`);
  }
  return { payload: buf.subarray(1, etxIdx), lrc: got };
}

/**
 * ACK packet: `ACK | ETX | LRC`.
 */
export function ackPacket(lrcBase: number = 0x7f): Uint8Array {
  const out = new Uint8Array(3);
  out[0] = ACK;
  out[1] = ETX;
  out[2] = lrc(out.subarray(0, 2), lrcBase);
  return out;
}

/**
 * NAK packet: `NAK | ETX | LRC`.
 */
export function nakPacket(lrcBase: number = 0x7f): Uint8Array {
  const out = new Uint8Array(3);
  out[0] = NAK;
  out[1] = ETX;
  out[2] = lrc(out.subarray(0, 2), lrcBase);
  return out;
}

/**
 * Framing 4-byte ASCII length prefix (OPI / Nexi XML legacy):
 * `0001` … `9999` decimal as 4 ASCII digits, then payload.
 */
export function frameAsciiLength(payload: Uint8Array, digits: number = 4): Uint8Array {
  const max = Math.pow(10, digits) - 1;
  if (payload.length > max) {
    throw new Error(`frame ASCII-length: payload ${payload.length} > max ${max}`);
  }
  const lenStr = String(payload.length).padStart(digits, '0');
  const lenBuf = new TextEncoder().encode(lenStr);
  const out = new Uint8Array(lenBuf.length + payload.length);
  out.set(lenBuf, 0);
  out.set(payload, lenBuf.length);
  return out;
}

/**
 * Estrae il payload da un frame ASCII-length-prefixed.
 * Tollera estrazioni con length > resto disponibile (clamp). Throws su length non numerico.
 */
export function unframeAsciiLength(buf: Uint8Array, digits: number = 4): Uint8Array {
  if (buf.length < digits) throw new Error('unframe ASCII-length: buffer più corto del prefisso');
  const lenStr = new TextDecoder().decode(buf.subarray(0, digits));
  const len = parseInt(lenStr, 10);
  if (!Number.isFinite(len) || len < 0) throw new Error(`unframe ASCII-length: lunghezza invalida "${lenStr}"`);
  const end = Math.min(digits + len, buf.length);
  return buf.subarray(digits, end);
}

/**
 * Framing big-endian uint length prefix (jpos / ISO-8583 lite).
 */
export function frameBigEndianLength(payload: Uint8Array, bytes: number = 2): Uint8Array {
  if (bytes < 1 || bytes > 4) throw new Error('BE-length: bytes deve essere 1..4');
  const max = Math.pow(2, 8 * bytes) - 1;
  if (payload.length > max) {
    throw new Error(`frame BE-length: payload ${payload.length} > max ${max}`);
  }
  const out = new Uint8Array(bytes + payload.length);
  let len = payload.length;
  for (let i = bytes - 1; i >= 0; i--) {
    out[i] = len & 0xff;
    len >>>= 8;
  }
  out.set(payload, bytes);
  return out;
}

export function unframeBigEndianLength(buf: Uint8Array, bytes: number = 2): Uint8Array {
  if (buf.length < bytes) throw new Error('BE-length: buffer più corto del prefisso');
  let len = 0;
  for (let i = 0; i < bytes; i++) len = (len << 8) | buf[i];
  return buf.subarray(bytes, bytes + len);
}

/**
 * Concatena array di Uint8Array in un singolo buffer (utility comune ai driver).
 */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
