'use strict';

const express = require('express');
const { requireLocalPin } = require('../middleware/local-auth');
const jobQueueRepo = require('../../storage/repositories/jobQueueRepo');
const auditRepo = require('../../storage/repositories/auditRepo');

function buildRouter({ driverRegistry, queueManager }) {
  const router = express.Router();
  router.use(requireLocalPin);

  /**
   * POST /admin/test-print — esegue una stampa di prova.
   * Body opzionale: { role: 'station'|'cash', key: 'cucina'|'bar'|... }
   * Senza body: usa il driver printer di default.
   */
  router.post('/test-print', async (req, res) => {
    try {
      const { role, key } = req.body || {};
      let out;

      if (role === 'station' && key) {
        // Test stampa su stampante di stazione
        const driver = driverRegistry.getPrinterForStation(key);
        const payload = {
          station: key,
          items: [{ name: 'TEST STAMPA', quantity: 1, price: 0.01 }],
          action: 'add',
          title: 'TEST STAMPA',
          printed_at: new Date().toISOString(),
        };
        if (typeof driver.printKitchenTicket === 'function') {
          out = await driver.printKitchenTicket(payload);
        } else {
          out = await driver.printReceipt({
            header: `TEST STAMPA ${key.toUpperCase()}`,
            items: [{ name: 'Test item', quantity: 1, unit_price: 0.01 }],
            total: 0.01,
            footer: new Date().toISOString(),
          });
        }
      } else if (role === 'cash' && key) {
        // Test stampa su dispositivo cassa
        const device = driverRegistry.getCashDevice({ id: key });
        out = await device.printReceipt({
          items: [{ name: 'Test item', quantity: 1, unit_price: 1.0 }],
          total: 1.0,
          header: 'TEST DI STAMPA',
          footer: new Date().toISOString(),
        });
      } else {
        // Default: driver printer principale
        out = await driverRegistry.printer.printReceipt({
          items: [{ name: 'Test item', quantity: 1, unit_price: 1.0 }],
          total: 1.0,
          header: 'TEST DI STAMPA',
          footer: new Date().toISOString(),
        });
      }

      auditRepo.append({
        kind: 'admin.test_print',
        payload: { role: role || 'default', key: key || null },
        meta: { receipt_no: out?.receipt_no },
      });
      res.json({ data: out });
    } catch (err) {
      res.status(500).json({ code: err.code || 'INTERNAL', message: err.message });
    }
  });

  router.get('/jobs', (req, res) => {
    const status = req.query.status || 'pending';
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    res.json({ data: jobQueueRepo.listByStatus(status, limit) });
  });

  router.post('/jobs/:id/retry', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ code: 'INVALID_PAYLOAD', message: 'id invalido' });
    const job = jobQueueRepo.getById(id);
    if (!job) return res.status(404).json({ code: 'NOT_FOUND' });
    jobQueueRepo.requeue(id);
    auditRepo.append({ kind: 'admin.job_retry', eventId: job.event_id, payload: { id } });
    // dispatch immediato
    if (queueManager) queueManager.dispatch().catch(() => {});
    res.json({ data: { ok: true } });
  });

  router.post('/jobs/:id/cancel', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ code: 'INVALID_PAYLOAD', message: 'id invalido' });
    const job = jobQueueRepo.getById(id);
    if (!job) return res.status(404).json({ code: 'NOT_FOUND' });
    jobQueueRepo.cancel(id);
    auditRepo.append({ kind: 'admin.job_cancel', eventId: job.event_id, payload: { id } });
    res.json({ data: { ok: true } });
  });

  router.get('/audit', (req, res) => {
    const from = req.query.from || null;
    const to = req.query.to || null;
    const kind = req.query.kind || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    res.json({ data: auditRepo.list({ from, to, kind, limit, offset }) });
  });

  router.get('/audit/verify', (req, res) => {
    const r = auditRepo.verifyChain();
    res.json({ data: r });
  });

  return router;
}

module.exports = { buildRouter };
