'use strict';

const express = require('express');
const { requireLocalPin } = require('../middleware/local-auth');
const jobQueueRepo = require('../../storage/repositories/jobQueueRepo');
const auditRepo = require('../../storage/repositories/auditRepo');

function buildRouter({ driverRegistry, queueManager }) {
  const router = express.Router();
  router.use(requireLocalPin);

  /**
   * POST /admin/test-print — esegue una stampa di prova sul driver corrente.
   */
  router.post('/test-print', async (req, res) => {
    try {
      const out = await driverRegistry.printer.printReceipt({
        items: [
          { name: 'Test item', quantity: 1, unit_price: 1.0 },
        ],
        total: 1.0,
        header: 'TEST DI STAMPA',
        footer: new Date().toISOString(),
      });
      auditRepo.append({ kind: 'admin.test_print', payload: {}, meta: { receipt_no: out.receipt_no } });
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
