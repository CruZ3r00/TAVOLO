'use strict';

const { z } = require('zod');
const { AppError, CODES } = require('./errors');

const pairSchema = z.object({
  strapi_url: z.string().url(),
  email: z.string().email(),
  password: z.string().min(1),
  device_name: z.string().min(1).max(120).optional(),
});

// Pairing-token flow (Fase 5): più sicuro di email+password.
// Il token (64 hex) è generato dalla pagina profilo Vue ed è single-use.
const pairByTokenSchema = z.object({
  strapi_url: z.string().url(),
  pairing_token: z.string().regex(/^[a-f0-9]{64}$/i),
  device_name: z.string().min(1).max(120).optional(),
});

const jobKindSchema = z.enum(['order.close', 'print.receipt', 'payment.charge', 'payment.refund']);

const jobSchema = z.object({
  event_id: z.string().min(1).max(64),
  kind: jobKindSchema,
  payload: z.any(),
  created_at: z.string().optional(),
  priority: z.number().int().optional(),
});

const orderClosePayloadSchema = z.object({
  order_doc_id: z.string(),
  amount: z.number().positive(),
  currency: z.string().default('EUR'),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive(),
        unit_price: z.number().nonnegative(),
        vat_rate: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  payment_method: z.enum(['pos', 'fiscal_register', 'simulator']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const ackOutcomeSchema = z.object({
  result: z.enum(['success', 'failure']),
  outcome: z
    .object({
      transactionId: z.string().optional(),
      receipt_no: z.string().optional(),
      error_code: z.string().optional(),
      error_message: z.string().optional(),
    })
    .default({}),
});

function parseOrThrow(schema, data, code = CODES.INVALID_PAYLOAD) {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError(code, 'Payload non valido', {
      httpStatus: 400,
      details: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

module.exports = {
  pairSchema,
  pairByTokenSchema,
  jobKindSchema,
  jobSchema,
  orderClosePayloadSchema,
  ackOutcomeSchema,
  parseOrThrow,
};
