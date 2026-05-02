/**
 * LRC (Longitudinal Redundancy Check) — XOR over every byte.
 *
 * Used by Protocollo 17 / ECR17 (Nexi Traditional POS) and by several other
 * Italian POS protocols. Spec: parte da `base` (0x7F per P17), XOR con ogni
 * byte. Il risultato è un singolo byte 0..255.
 *
 * In P17 il calcolo include ETX (0x03) ma NON include STX (0x02). I wrapper
 * specifici devono passare il giusto slice; questa funzione resta pura.
 */

export function lrc(bytes: ArrayLike<number>, base: number = 0x7f): number {
  let acc = base & 0xff;
  for (let i = 0; i < bytes.length; i++) {
    acc ^= bytes[i] & 0xff;
  }
  return acc & 0xff;
}

/** Slice helper per LRC su Uint8Array. */
export function lrcSlice(buf: Uint8Array, start: number, end: number, base: number = 0x7f): number {
  let acc = base & 0xff;
  for (let i = start; i < end; i++) acc ^= buf[i] & 0xff;
  return acc & 0xff;
}
