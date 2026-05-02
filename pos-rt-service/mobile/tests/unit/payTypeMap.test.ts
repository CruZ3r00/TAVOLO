import { describe, it, expect } from 'vitest';
import { mapPrinterPaymentType } from '../../src/drivers/helpers/payTypeMap';

describe('mapPrinterPaymentType — backward compatibility', () => {
  // I numeri devono coincidere con quelli che customXon/escposFiscal/epsonFpmate
  // usavano in precedenza, altrimenti il refactor altera lo scontrino fiscale.

  describe('custom-xon (baseline)', () => {
    it('cash → 1', () => {
      expect(mapPrinterPaymentType('cash', 'custom-xon')).toBe(1);
      expect(mapPrinterPaymentType('contanti', 'custom-xon')).toBe(1);
    });
    it('card → 2', () => {
      expect(mapPrinterPaymentType('card', 'custom-xon')).toBe(2);
      expect(mapPrinterPaymentType('pos', 'custom-xon')).toBe(2);
      expect(mapPrinterPaymentType('credit_card', 'custom-xon')).toBe(2);
    });
    it('voucher → 4', () => {
      expect(mapPrinterPaymentType('ticket', 'custom-xon')).toBe(4);
      expect(mapPrinterPaymentType('meal_voucher', 'custom-xon')).toBe(4);
    });
    it('unknown → 5 fallback', () => {
      expect(mapPrinterPaymentType('mistero', 'custom-xon')).toBe(5);
    });
    it('undefined / null → cash', () => {
      expect(mapPrinterPaymentType(undefined, 'custom-xon')).toBe(1);
      expect(mapPrinterPaymentType(null, 'custom-xon')).toBe(1);
    });
  });

  describe('escpos-fiscal (baseline identica a custom-xon)', () => {
    it('cash/card/ticket/unknown', () => {
      expect(mapPrinterPaymentType('cash', 'escpos-fiscal')).toBe(1);
      expect(mapPrinterPaymentType('card', 'escpos-fiscal')).toBe(2);
      expect(mapPrinterPaymentType('ticket', 'escpos-fiscal')).toBe(4);
      expect(mapPrinterPaymentType('foo', 'escpos-fiscal')).toBe(5);
    });
  });

  describe('epson-fpmate (baseline)', () => {
    it('cash → 0', () => {
      expect(mapPrinterPaymentType('cash', 'epson-fpmate')).toBe(0);
      expect(mapPrinterPaymentType('contanti', 'epson-fpmate')).toBe(0);
      expect(mapPrinterPaymentType(undefined, 'epson-fpmate')).toBe(0);
    });
    it('card → 2', () => {
      expect(mapPrinterPaymentType('card', 'epson-fpmate')).toBe(2);
      expect(mapPrinterPaymentType('pos', 'epson-fpmate')).toBe(2);
    });
    it('voucher → 3', () => {
      expect(mapPrinterPaymentType('ticket', 'epson-fpmate')).toBe(3);
      expect(mapPrinterPaymentType('meal_voucher', 'epson-fpmate')).toBe(3);
    });
    it('unknown → 4 fallback', () => {
      expect(mapPrinterPaymentType('mistero', 'epson-fpmate')).toBe(4);
    });
  });

  describe('italretail (rebrand custom)', () => {
    it('eredita la baseline custom-xon', () => {
      expect(mapPrinterPaymentType('cash', 'italretail')).toBe(1);
      expect(mapPrinterPaymentType('card', 'italretail')).toBe(2);
      expect(mapPrinterPaymentType('ticket', 'italretail')).toBe(4);
      expect(mapPrinterPaymentType('mistero', 'italretail')).toBe(5);
    });
  });

  describe('case-insensitivity & trim', () => {
    it('CARD / Card / card', () => {
      expect(mapPrinterPaymentType('CARD', 'custom-xon')).toBe(2);
      expect(mapPrinterPaymentType('Card', 'custom-xon')).toBe(2);
      expect(mapPrinterPaymentType(' card ', 'custom-xon')).toBe(2);
    });
  });
});
