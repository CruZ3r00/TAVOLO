import { describe, it, expect } from 'vitest';
import { lrc, lrcSlice } from '../../src/drivers/helpers/lrc';

describe('lrc', () => {
  it('base only (empty bytes) → base', () => {
    expect(lrc([], 0x7f)).toBe(0x7f);
    expect(lrc([], 0)).toBe(0);
  });

  // Spec ECR17/Protocollo 17: ACK frame = ACK(0x06) ETX(0x03) LRC.
  // LRC = 0x7F XOR 0x06 XOR 0x03 = 0x7A.
  it('Protocollo 17 ACK vector', () => {
    expect(lrc([0x06, 0x03], 0x7f)).toBe(0x7a);
  });

  // NAK frame = NAK(0x15) ETX(0x03) LRC.
  // LRC = 0x7F XOR 0x15 XOR 0x03 = 0x69.
  it('Protocollo 17 NAK vector', () => {
    expect(lrc([0x15, 0x03], 0x7f)).toBe(0x69);
  });

  it('default base = 0x7F', () => {
    expect(lrc([0x06, 0x03])).toBe(0x7a);
  });

  it('two equal bytes XOR cancellation', () => {
    expect(lrc([0xff, 0xff], 0x7f)).toBe(0x7f);
  });

  it('lrcSlice() opera su finestra del Uint8Array', () => {
    const buf = new Uint8Array([0x02, 0x06, 0x03, 0xaa]); // STX + ACK + ETX + LRC
    // Slice da 1 a 3 (esclusivo) = [0x06, 0x03] → LRC = 0x7A
    expect(lrcSlice(buf, 1, 3, 0x7f)).toBe(0x7a);
  });

  it('robusto a byte > 0xFF (mask)', () => {
    expect(lrc([0x100 | 0x06, 0x03], 0x7f)).toBe(0x7a);
  });
});
