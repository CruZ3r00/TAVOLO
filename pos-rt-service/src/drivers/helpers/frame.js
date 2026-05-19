'use strict';

/**
 * Framing helpers per protocolli wire usati dai driver POS/RT.
 *
 *  - STX/ETX framing con LRC (Protocollo 17 / ECR17 -- Nexi)
 *  - 4-byte ASCII length prefix (OPI XML -- generic-ecr)
 *  - 2-byte big-endian length prefix (ISO-8583 lite -- jpos)
 *
 * Tutto puro, niente IO. I driver compongono queste primitive con la sessione TCP.
 *
 * Ported from mobile/src/drivers/helpers/frame.ts (TypeScript -> CommonJS).
 */

const { lrc } = require('./lrc');

const STX = 0x02;
const ETX = 0x03;
const ACK = 0x06;
const NAK = 0x15;
const SOH = 0x01;
const EOT = 0x04;

/**
 * Wrap payload per Protocollo 17: `STX | payload | ETX | LRC`.
 * LRC = XOR di base (0x7F default) con tutti i byte di payload + ETX.
 * (STX e' escluso dal calcolo del LRC, ETX e' incluso, come da spec ECR17.)
 * @param {Uint8Array} payload
 * @param {number} [lrcBase=0x7f]
 * @returns {Uint8Array}
 */
function wrapStxEtxLrc(payload, lrcBase = 0x7f) {
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
 * @param {Uint8Array} buf
 * @param {number} [lrcBase=0x7f]
 * @returns {{ payload: Uint8Array, lrc: number }}
 */
function unwrapStxEtxLrc(buf, lrcBase = 0x7f) {
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
 * @param {number} [lrcBase=0x7f]
 * @returns {Uint8Array}
 */
function ackPacket(lrcBase = 0x7f) {
  const out = new Uint8Array(3);
  out[0] = ACK;
  out[1] = ETX;
  out[2] = lrc(out.subarray(0, 2), lrcBase);
  return out;
}

/**
 * NAK packet: `NAK | ETX | LRC`.
 * @param {number} [lrcBase=0x7f]
 * @returns {Uint8Array}
 */
function nakPacket(lrcBase = 0x7f) {
  const out = new Uint8Array(3);
  out[0] = NAK;
  out[1] = ETX;
  out[2] = lrc(out.subarray(0, 2), lrcBase);
  return out;
}

/**
 * Framing 4-byte ASCII length prefix (OPI / Nexi XML legacy).
 * @param {Uint8Array} payload
 * @param {number} [digits=4]
 * @returns {Uint8Array}
 */
function frameAsciiLength(payload, digits = 4) {
  const max = Math.pow(10, digits) - 1;
  if (payload.length > max) {
    throw new Error(`frame ASCII-length: payload ${payload.length} > max ${max}`);
  }
  const lenStr = String(payload.length).padStart(digits, '0');
  const lenBuf = Buffer.from(lenStr, 'ascii');
  const out = new Uint8Array(lenBuf.length + payload.length);
  out.set(lenBuf, 0);
  out.set(payload, lenBuf.length);
  return out;
}

/**
 * Estrae il payload da un frame ASCII-length-prefixed.
 * @param {Uint8Array} buf
 * @param {number} [digits=4]
 * @returns {Uint8Array}
 */
function unframeAsciiLength(buf, digits = 4) {
  if (buf.length < digits) throw new Error('unframe ASCII-length: buffer piu corto del prefisso');
  const lenStr = Buffer.from(buf.subarray(0, digits)).toString('ascii');
  const len = parseInt(lenStr, 10);
  if (!Number.isFinite(len) || len < 0) throw new Error(`unframe ASCII-length: lunghezza invalida "${lenStr}"`);
  const end = Math.min(digits + len, buf.length);
  return buf.subarray(digits, end);
}

/**
 * Framing big-endian uint length prefix (jpos / ISO-8583 lite).
 * @param {Uint8Array} payload
 * @param {number} [bytes=2]
 * @returns {Uint8Array}
 */
function frameBigEndianLength(payload, bytes = 2) {
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

/**
 * @param {Uint8Array} buf
 * @param {number} [bytes=2]
 * @returns {Uint8Array}
 */
function unframeBigEndianLength(buf, bytes = 2) {
  if (buf.length < bytes) throw new Error('BE-length: buffer piu corto del prefisso');
  let len = 0;
  for (let i = 0; i < bytes; i++) len = (len << 8) | buf[i];
  return buf.subarray(bytes, bytes + len);
}

/**
 * Concatena array di Uint8Array in un singolo buffer.
 * @param {Uint8Array[]} parts
 * @returns {Uint8Array}
 */
function concatBytes(parts) {
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

module.exports = {
  STX,
  ETX,
  ACK,
  NAK,
  SOH,
  EOT,
  wrapStxEtxLrc,
  unwrapStxEtxLrc,
  ackPacket,
  nakPacket,
  frameAsciiLength,
  unframeAsciiLength,
  frameBigEndianLength,
  unframeBigEndianLength,
  concatBytes,
};
