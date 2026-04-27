/**
 * ESC/POS-BT driver mobile — pagamento via terminale POS Bluetooth.
 *
 * Stato: scaffold. Su mobile la BT serial richiede:
 *  - Android: BluetoothAdapter + RFCOMM via plugin nativo Capacitor (TODO,
 *    da implementare in `android/app/src/main/java/.../PosBtSocketPlugin.kt`)
 *  - iOS: solo MFi-certified devices o BLE (CoreBluetooth). Limita molto la
 *    compatibilità reale → di solito lasciato al desktop.
 *
 * Per ora tutte le operazioni lanciano DRIVER_UNAVAILABLE con messaggio
 * chiaro. Quando il plugin nativo BT sarà disponibile, implementare il
 * `sendBtSerialOnce(...)` analogo a `sendTcpOnce`.
 */

import { DriverError } from './types';
import type {
  ChargeInput,
  ChargeOutcome,
  DriverStatus,
  PaymentDriver,
  RefundInput,
  RefundOutcome,
} from './types';

export interface EscPosBtOptions {
  deviceAddress?: string;
  deviceName?: string;
  timeoutMs?: number;
}

export class EscPosBtDriverMobile implements PaymentDriver {
  readonly name = 'escpos-bt';
  private opts: EscPosBtOptions;

  constructor(opts: EscPosBtOptions = {}) {
    this.opts = opts;
  }

  async init(): Promise<void> {
    throw new DriverError(
      'NOT_IMPLEMENTED',
      'escpos-bt mobile: plugin Bluetooth non ancora implementato. Roadmap Fase 3.5/4. Usa generic-ecr (TCP via WiFi LAN) come alternativa.',
    );
  }

  async charge(_input: ChargeInput): Promise<ChargeOutcome> {
    throw this.notImpl();
  }

  async refund(_input: RefundInput): Promise<RefundOutcome> {
    throw this.notImpl();
  }

  async getStatus(): Promise<DriverStatus> {
    return {
      online: false,
      name: this.name,
      degraded: true,
      error: 'Plugin Bluetooth non ancora implementato (Fase 3.5+).',
    };
  }

  async dispose(): Promise<void> {
    /* noop */
  }

  private notImpl(): DriverError {
    return new DriverError(
      'NOT_IMPLEMENTED',
      'escpos-bt mobile: plugin BT non disponibile. Usa generic-ecr (LAN TCP) finché non implementiamo il plugin nativo.',
    );
  }
}
