import { describe, it, expect } from 'vitest';
import {
  STX,
  ETX,
  ACK,
  NAK,
  ackPacket,
  nakPacket,
  wrapStxEtxLrc,
  unwrapStxEtxLrc,
  frameAsciiLength,
  unframeAsciiLength,
  frameBigEndianLength,
  unframeBigEndianLength,
  concatBytes,
} from '../../src/drivers/helpers/frame';

describe('STX/ETX/LRC framing (Protocollo 17)', () => {
  it('wrap "HI" produce frame ben formato', () => {
    const payload = new Uint8Array([0x48, 0x49]); // "HI"
    const out = wrapStxEtxLrc(payload);
    // 0x7F XOR 0x48 = 0x37 ; XOR 0x49 = 0x7E ; XOR 0x03(ETX) = 0x7D
    expect(Array.from(out)).toEqual([STX, 0x48, 0x49, ETX, 0x7d]);
  });

  it('unwrap restituisce payload e LRC', () => {
    const buf = new Uint8Array([STX, 0x48, 0x49, ETX, 0x7d]);
    const { payload, lrc } = unwrapStxEtxLrc(buf);
    expect(Array.from(payload)).toEqual([0x48, 0x49]);
    expect(lrc).toBe(0x7d);
  });

  it('unwrap su LRC mismatch lancia errore', () => {
    const bad = new Uint8Array([STX, 0x48, 0x49, ETX, 0xff]);
    expect(() => unwrapStxEtxLrc(bad)).toThrowError(/LRC mismatch/);
  });

  it('unwrap richiede STX iniziale', () => {
    const bad = new Uint8Array([0x99, 0x48, ETX, 0x00]);
    expect(() => unwrapStxEtxLrc(bad)).toThrowError(/STX atteso/);
  });

  it('unwrap richiede ETX in penultima posizione', () => {
    const bad = new Uint8Array([STX, 0x48, 0x49, 0x99, 0x00]);
    expect(() => unwrapStxEtxLrc(bad)).toThrowError(/ETX atteso/);
  });

  it('round-trip wrap → unwrap mantiene il payload', () => {
    const payload = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50]);
    const { payload: out } = unwrapStxEtxLrc(wrapStxEtxLrc(payload));
    expect(Array.from(out)).toEqual(Array.from(payload));
  });

  it('ackPacket() = [ACK, ETX, 0x7A]', () => {
    expect(Array.from(ackPacket())).toEqual([ACK, ETX, 0x7a]);
  });

  it('nakPacket() = [NAK, ETX, 0x69]', () => {
    expect(Array.from(nakPacket())).toEqual([NAK, ETX, 0x69]);
  });
});

describe('ASCII-length prefix framing (OPI / generic-ecr)', () => {
  it('frame "AB" → "0002AB"', () => {
    const out = frameAsciiLength(new Uint8Array([0x41, 0x42]), 4);
    expect(new TextDecoder().decode(out)).toBe('0002AB');
  });

  it('frame con digits=4 default', () => {
    const out = frameAsciiLength(new Uint8Array([0x41]));
    expect(new TextDecoder().decode(out)).toBe('0001A');
  });

  it('unframe "0003ABC" → "ABC"', () => {
    const buf = new TextEncoder().encode('0003ABC');
    const out = unframeAsciiLength(buf, 4);
    expect(new TextDecoder().decode(out)).toBe('ABC');
  });

  it('round-trip ASCII-length', () => {
    const payload = new TextEncoder().encode('<xml>hello</xml>');
    const out = unframeAsciiLength(frameAsciiLength(payload));
    expect(out).toEqual(payload);
  });

  it('frame oltre il massimo lancia errore', () => {
    const tooBig = new Uint8Array(10000);
    expect(() => frameAsciiLength(tooBig, 4)).toThrowError(/payload .* > max/);
  });

  it('unframe lunghezza non numerica lancia errore', () => {
    const bad = new TextEncoder().encode('XXXXAB');
    expect(() => unframeAsciiLength(bad)).toThrowError(/lunghezza invalida/);
  });

  it('unframe clamp se length > buffer disponibile', () => {
    const truncated = new TextEncoder().encode('0099AB');
    const out = unframeAsciiLength(truncated);
    expect(new TextDecoder().decode(out)).toBe('AB'); // clamp
  });
});

describe('Big-endian length prefix framing (jpos)', () => {
  it('frame 2-byte: payload [0x01, 0x02, 0x03]', () => {
    const out = frameBigEndianLength(new Uint8Array([0x01, 0x02, 0x03]), 2);
    expect(Array.from(out)).toEqual([0x00, 0x03, 0x01, 0x02, 0x03]);
  });

  it('unframe 2-byte: skip prefix', () => {
    const buf = new Uint8Array([0x00, 0x03, 0x01, 0x02, 0x03]);
    const out = unframeBigEndianLength(buf, 2);
    expect(Array.from(out)).toEqual([0x01, 0x02, 0x03]);
  });

  it('round-trip BE-length', () => {
    const payload = new Uint8Array(500).fill(0xaa);
    const out = unframeBigEndianLength(frameBigEndianLength(payload, 2), 2);
    expect(out.length).toBe(500);
  });

  it('frame oltre il massimo lancia errore (1 byte)', () => {
    expect(() => frameBigEndianLength(new Uint8Array(256), 1)).toThrowError(/> max/);
  });
});

describe('concatBytes', () => {
  it('concatena array vuoto → buffer vuoto', () => {
    expect(concatBytes([]).length).toBe(0);
  });

  it('concatena 3 buffer', () => {
    const out = concatBytes([
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
      new Uint8Array([4, 5, 6]),
    ]);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
