'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  exponentialBackoff,
  queueRetryDelayMs,
  wsReconnectDelayMs,
  QUEUE_RETRY_SCHEDULE_MS,
} = require('../../src/utils/backoff');

test('exponentialBackoff cresce e si clampa a cap', () => {
  const d0 = exponentialBackoff(0, { base: 100, factor: 2, cap: 1000, jitter: 0 });
  assert.equal(d0, 100);
  const d10 = exponentialBackoff(10, { base: 100, factor: 2, cap: 1000, jitter: 0 });
  assert.equal(d10, 1000);
});

test('queueRetryDelayMs rispetta il catalogo', () => {
  for (let i = 0; i < QUEUE_RETRY_SCHEDULE_MS.length + 2; i++) {
    const d = queueRetryDelayMs(i);
    const base = QUEUE_RETRY_SCHEDULE_MS[Math.min(i, QUEUE_RETRY_SCHEDULE_MS.length - 1)];
    // jitter ±25%
    assert.ok(d >= base * 0.74, `i=${i} d=${d} vs ${base}`);
    assert.ok(d <= base * 1.26, `i=${i} d=${d} vs ${base}`);
  }
});

test('wsReconnectDelayMs cresce poi plateau', () => {
  const d0 = wsReconnectDelayMs(0);
  const d10 = wsReconnectDelayMs(10);
  assert.ok(d0 <= 1250);
  assert.ok(d10 >= 22_000 && d10 <= 37_500);
});
