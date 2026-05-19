'use strict';

/**
 * Service inventory-alerts.
 *
 * Funzioni:
 *   - runAlertScan(strapi): scan periodico (cron 4h). Per ogni owner pro
 *     attivo, calcola consumption_rate (EMA α=0.3 ultimi 14g), forecast,
 *     soglia override → genera 0/1/2 alert aggregati per tipo
 *     ('predictive' | 'threshold'). Dedup 24h o livello peggiorato.
 *   - dismissForRestock(strapi, ingredientId): quando arriva un restock,
 *     marca dismissed_by_restock=true sugli alert non-acked che contengono
 *     quell'ingrediente. Se l'alert resta vuoto, lo marca acknowledged.
 *   - computeDepletionForecast(strapi, ingredient): { rate_per_day,
 *     days_to_depletion, predicted_depletion_at }
 *
 * Canali consegna:
 *   - DB (sempre): InventoryAlert con sent_inapp=true.
 *   - Email (best-effort): se SMTP configurato, mail HTML al titolare con
 *     elenco ingredienti. sent_email=true al successo.
 */

const SAFETY_BUFFER_DAYS_DEFAULT = 1.5;
const SCAN_WINDOW_DAYS = 14;
const EMA_ALPHA = 0.3;
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function isProOwner(owner) {
  if (!owner) return false;
  if (!ACTIVE_STATUSES.has(String(owner.subscription_status || ''))) return false;
  if (String(owner.subscription_plan || '').toLowerCase() !== 'pro') return false;
  const periodEnd = owner.subscription_current_period_end || owner.end_subscription;
  if (!periodEnd) return true;
  const d = new Date(periodEnd);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= Date.now();
}

/* ------------------------------------------------------------------ */
/* Forecast                                                           */
/* ------------------------------------------------------------------ */

/**
 * Calcola consumption_rate via EMA (alfa=0.3) sui consumi degli ultimi 14g.
 * Aggrega i `kind=consumption` per giorno, applica EMA dal piu vecchio al
 * piu recente.
 *
 * @returns {{ rate_per_day: number, days_to_depletion: number|null,
 *             predicted_depletion_at: string|null }}
 */
async function computeDepletionForecast(strapi, ingredient) {
  const now = Date.now();
  const fromDate = new Date(now - SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const movements = await strapi.db.query('api::inventory-movement.inventory-movement').findMany({
    where: {
      fk_ingredient: { id: ingredient.id },
      kind: 'consumption',
      createdAt: { $gte: fromDate },
    },
    select: ['qty_delta', 'createdAt'],
    orderBy: { createdAt: 'asc' },
  });

  // Aggrega consumo (valore assoluto) per giorno
  const dayKey = (d) => {
    const dt = new Date(d);
    return `${dt.getUTCFullYear()}-${dt.getUTCMonth() + 1}-${dt.getUTCDate()}`;
  };
  const byDay = new Map();
  for (const m of movements || []) {
    const k = dayKey(m.createdAt);
    const abs = Math.abs(Number(m.qty_delta) || 0);
    byDay.set(k, (byDay.get(k) || 0) + abs);
  }

  if (byDay.size === 0) {
    return { rate_per_day: 0, days_to_depletion: null, predicted_depletion_at: null };
  }

  // Costruisce sequenza ordinata dei giorni della finestra (zero-fill mancanti)
  const days = [];
  for (let i = SCAN_WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const k = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    days.push(byDay.get(k) || 0);
  }

  // EMA
  let ema = days[0];
  for (let i = 1; i < days.length; i += 1) {
    ema = EMA_ALPHA * days[i] + (1 - EMA_ALPHA) * ema;
  }
  const ratePerDay = ema;

  if (ratePerDay <= 1e-9) {
    return { rate_per_day: 0, days_to_depletion: null, predicted_depletion_at: null };
  }

  const stock = Number(ingredient.stock_qty) || 0;
  const daysToDepletion = stock / ratePerDay;
  const predicted = new Date(now + daysToDepletion * 24 * 60 * 60 * 1000).toISOString();

  return {
    rate_per_day: Number(ratePerDay.toFixed(4)),
    days_to_depletion: Number(daysToDepletion.toFixed(2)),
    predicted_depletion_at: predicted,
  };
}

/**
 * Versione batch di computeDepletionForecast: calcola la forecast per N
 * ingredienti di un owner usando UNA sola query sui movements (evita N+1).
 *
 * @param {Array<{id, stock_qty}>} ingredients
 * @param {number} ownerId
 * @returns {Promise<Map<number, { rate_per_day, days_to_depletion, predicted_depletion_at }>>}
 */
async function computeDepletionForecastBatch(strapi, ingredients, ownerId) {
  const empty = { rate_per_day: 0, days_to_depletion: null, predicted_depletion_at: null };
  const result = new Map();
  for (const ing of ingredients || []) result.set(ing.id, { ...empty });
  if (!ingredients || ingredients.length === 0 || !ownerId) return result;

  const now = Date.now();
  const fromDate = new Date(now - SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const movements = await strapi.db.query('api::inventory-movement.inventory-movement').findMany({
    where: {
      fk_user: { id: ownerId },
      kind: 'consumption',
      createdAt: { $gte: fromDate },
    },
    select: ['qty_delta', 'createdAt'],
    populate: { fk_ingredient: { fields: ['id'] } },
  });

  const dayKey = (d) => {
    const dt = new Date(d);
    return `${dt.getUTCFullYear()}-${dt.getUTCMonth() + 1}-${dt.getUTCDate()}`;
  };

  const byIngredient = new Map();
  for (const m of movements || []) {
    const ingId = m.fk_ingredient && m.fk_ingredient.id;
    if (!ingId || !result.has(ingId)) continue;
    const k = dayKey(m.createdAt);
    const abs = Math.abs(Number(m.qty_delta) || 0);
    let inner = byIngredient.get(ingId);
    if (!inner) { inner = new Map(); byIngredient.set(ingId, inner); }
    inner.set(k, (inner.get(k) || 0) + abs);
  }

  const windowKeys = [];
  for (let i = SCAN_WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    windowKeys.push(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
  }

  for (const ing of ingredients) {
    const byDay = byIngredient.get(ing.id);
    if (!byDay || byDay.size === 0) continue;

    const days = windowKeys.map((k) => byDay.get(k) || 0);
    let ema = days[0];
    for (let i = 1; i < days.length; i += 1) {
      ema = EMA_ALPHA * days[i] + (1 - EMA_ALPHA) * ema;
    }
    const ratePerDay = ema;
    if (ratePerDay <= 1e-9) continue;

    const stock = Number(ing.stock_qty) || 0;
    const daysToDepletion = stock / ratePerDay;
    const predicted = new Date(now + daysToDepletion * 24 * 60 * 60 * 1000).toISOString();

    result.set(ing.id, {
      rate_per_day: Number(ratePerDay.toFixed(4)),
      days_to_depletion: Number(daysToDepletion.toFixed(2)),
      predicted_depletion_at: predicted,
    });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* runAlertScan                                                       */
/* ------------------------------------------------------------------ */

/**
 * Per ogni owner pro attivo, scan dei suoi Ingredient e genera alert
 * predittivi / threshold. Dedup: skip se alert dello stesso tipo creato
 * <24h fa con stesso/peggiore level.
 */
async function runAlertScan(strapi) {
  const owners = await strapi.db.query('plugin::users-permissions.user').findMany({
    where: { subscription_plan: 'pro' },
    select: [
      'id', 'email', 'name', 'subscription_plan', 'subscription_status',
      'subscription_current_period_end', 'end_subscription',
    ],
  });

  let processedOwners = 0;
  let createdAlerts = 0;

  for (const owner of owners || []) {
    if (!isProOwner(owner)) continue;
    try {
      const out = await runOwnerScan(strapi, owner);
      processedOwners += 1;
      createdAlerts += out.created;
    } catch (err) {
      strapi.log.warn(`inventory-alerts: scan owner ${owner.id} fallito: ${err.message}`);
    }
  }
  strapi.log.info(`inventory-alerts: scan completato. owners=${processedOwners} alerts_created=${createdAlerts}`);
  return { owners: processedOwners, created: createdAlerts };
}

async function runOwnerScan(strapi, owner) {
  const ingredients = await strapi.db.query('api::ingredient.ingredient').findMany({
    where: { fk_user: { id: owner.id }, is_active: true },
  });
  if (!ingredients || ingredients.length === 0) return { created: 0 };

  // Per ogni Ingredient, calcola forecast + check thresholds.
  const predictive = [];
  const threshold = [];

  let forecastMap;
  try {
    forecastMap = await computeDepletionForecastBatch(strapi, ingredients, owner.id);
  } catch (err) {
    strapi.log.warn(`computeDepletionForecastBatch owner ${owner.id}: ${err.message}`);
    forecastMap = new Map();
  }

  for (const ing of ingredients) {
    const forecast = forecastMap.get(ing.id) || { rate_per_day: 0, days_to_depletion: null, predicted_depletion_at: null };

    // Predittivo: days_to_depletion <= reorder_lead_days + safety_buffer
    if (forecast.rate_per_day > 0 && forecast.days_to_depletion !== null) {
      const lead = Number(ing.reorder_lead_days) || 3;
      const trigger = lead + SAFETY_BUFFER_DAYS_DEFAULT;
      if (forecast.days_to_depletion <= trigger) {
        const stockNow = Number(ing.stock_qty) || 0;
        let level = 'info';
        if (forecast.days_to_depletion <= lead) level = 'warning';
        if (forecast.days_to_depletion <= 1) level = 'critical';
        predictive.push({
          fk_ingredient: ing.id,
          name: ing.name,
          unit: ing.unit,
          stock_qty: stockNow,
          predicted_depletion_at: forecast.predicted_depletion_at,
          days_to_depletion: forecast.days_to_depletion,
          rate_per_day: forecast.rate_per_day,
          level,
        });
      }
    }

    // Threshold custom: stock_qty <= low_stock_threshold (se valorizzato)
    if (ing.low_stock_threshold !== null && ing.low_stock_threshold !== undefined) {
      const th = Number(ing.low_stock_threshold);
      const stockNow = Number(ing.stock_qty) || 0;
      if (Number.isFinite(th) && th > 0 && stockNow <= th) {
        const ratio = stockNow / th;
        let level = 'info';
        if (ratio <= 0.5) level = 'warning';
        if (ratio <= 0.2) level = 'critical';
        threshold.push({
          fk_ingredient: ing.id,
          name: ing.name,
          unit: ing.unit,
          stock_qty: stockNow,
          low_stock_threshold: th,
          level,
        });
      }
    }
  }

  let created = 0;
  if (predictive.length > 0) {
    const ok = await maybeCreateAlert(strapi, owner, 'predictive', predictive);
    if (ok) created += 1;
  }
  if (threshold.length > 0) {
    const ok = await maybeCreateAlert(strapi, owner, 'threshold', threshold);
    if (ok) created += 1;
  }
  return { created };
}

/**
 * Dedup: se esiste un alert dello stesso tipo non-acked creato <24h fa
 * con level uguale o superiore, skip.
 */
async function maybeCreateAlert(strapi, owner, alertType, ingredients) {
  // Cap level
  const worstLevel = ingredients.reduce((acc, x) => {
    const order = { info: 0, warning: 1, critical: 2 };
    return (order[x.level] || 0) > (order[acc] || 0) ? x.level : acc;
  }, 'info');

  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const recent = await strapi.db.query('api::inventory-alert.inventory-alert').findOne({
    where: {
      fk_user: { id: owner.id },
      alert_type: alertType,
      acknowledged_at: { $null: true },
      dismissed_by_restock: false,
      createdAt: { $gte: since },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    const order = { info: 0, warning: 1, critical: 2 };
    if ((order[recent.level] || 0) >= (order[worstLevel] || 0)) {
      return false; // skip: gia inviato livello uguale o peggiore
    }
  }

  const data = {
    alert_type: alertType,
    level: worstLevel,
    ingredients_payload: ingredients,
    sent_email: false,
    sent_inapp: true,
    dismissed_by_restock: false,
    fk_user: owner.id,
  };

  try {
    const alert = await strapi.documents('api::inventory-alert.inventory-alert').create({ data });

    // Email best-effort
    try {
      const sent = await sendAlertEmail(strapi, owner, alertType, ingredients, worstLevel);
      if (sent) {
        await strapi.documents('api::inventory-alert.inventory-alert').update({
          documentId: alert.documentId,
          data: { sent_email: true },
        });
      }
    } catch (emailErr) {
      strapi.log.warn(`inventory-alerts: email owner=${owner.id} fallita: ${emailErr.message}`);
    }
    return true;
  } catch (err) {
    strapi.log.warn(`inventory-alerts: create alert owner=${owner.id} fallita: ${err.message}`);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* dismissForRestock                                                  */
/* ------------------------------------------------------------------ */

/**
 * Quando arriva un restock per un ingrediente, marca dismissed_by_restock=true
 * sugli alert non-acked che contengono quell'ingrediente. Se vuoti
 * (tutti gli ingredient sono dismissed) marca acknowledged_at=now.
 */
async function dismissForRestock(strapi, ownerId, ingredientId) {
  const alerts = await strapi.db.query('api::inventory-alert.inventory-alert').findMany({
    where: {
      fk_user: { id: ownerId },
      acknowledged_at: { $null: true },
      dismissed_by_restock: false,
    },
  });
  for (const alert of alerts || []) {
    const payload = Array.isArray(alert.ingredients_payload) ? alert.ingredients_payload : [];
    const hasIng = payload.some((p) => Number(p.fk_ingredient) === Number(ingredientId));
    if (!hasIng) continue;

    const remaining = payload.filter((p) => Number(p.fk_ingredient) !== Number(ingredientId));
    const update = { ingredients_payload: remaining };
    if (remaining.length === 0) {
      update.dismissed_by_restock = true;
      update.acknowledged_at = new Date();
    }
    try {
      await strapi.documents('api::inventory-alert.inventory-alert').update({
        documentId: alert.documentId,
        data: update,
      });
    } catch (err) {
      strapi.log.warn(`inventory-alerts.dismissForRestock: update alert ${alert.id} fallito: ${err.message}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Email                                                              */
/* ------------------------------------------------------------------ */

async function sendAlertEmail(strapi, owner, alertType, ingredients, level) {
  if (!owner.email) return false;
  let mailer;
  try {
    mailer = strapi.plugin('email').service('email');
  } catch (_e) { return false; }
  if (!mailer) return false;

  const labelType = alertType === 'predictive'
    ? 'Previsione esaurimento'
    : 'Soglia minima raggiunta';
  const labelLevel = level === 'critical' ? 'CRITICO' : (level === 'warning' ? 'ATTENZIONE' : 'INFO');
  const subject = `[Tavolo · ${labelLevel}] ${labelType}: ${ingredients.length} ingrediente${ingredients.length === 1 ? '' : 'i'} da rifornire`;

  const rows = ingredients.map((x) => {
    if (alertType === 'predictive') {
      const days = x.days_to_depletion !== null
        ? `${Number(x.days_to_depletion).toFixed(1)} g`
        : '—';
      return `<tr><td>${escapeHtml(x.name)}</td><td>${formatStock(x.stock_qty, x.unit)}</td><td>${days}</td></tr>`;
    }
    return `<tr><td>${escapeHtml(x.name)}</td><td>${formatStock(x.stock_qty, x.unit)}</td><td>${formatStock(x.low_stock_threshold, x.unit)}</td></tr>`;
  }).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="font-family:system-ui,sans-serif;color:#222;line-height:1.5;">
  <h2 style="margin:0 0 12px;color:${level === 'critical' ? '#b91c1c' : '#d97706'};">${escapeHtml(labelType)}</h2>
  <p>Ciao ${escapeHtml(owner.name || '')},</p>
  <p>Il sistema ha rilevato ${ingredients.length} ingrediente${ingredients.length === 1 ? '' : 'i'} da rifornire (livello: <strong>${labelLevel}</strong>).</p>
  <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;border:1px solid #ddd;margin:12px 0;">
    <thead style="background:#f5f5f5;">
      <tr>
        <th align="left">Ingrediente</th>
        <th align="left">Stock</th>
        <th align="left">${alertType === 'predictive' ? 'Esaurimento previsto' : 'Soglia minima'}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p>Apri il gestionale per registrare l'ordine di rifornimento o aggiornare le quantita disponibili.</p>
  <p style="font-size:12px;color:#666;margin-top:24px;">Email automatica di Tavolo. Per disattivare gli alert email contatta il supporto.</p>
</body></html>`;

  const text = `${labelType} (${labelLevel}) — ${ingredients.length} ingrediente${ingredients.length === 1 ? '' : 'i'}:\n` +
    ingredients.map((x) => `- ${x.name}: stock ${x.stock_qty} ${x.unit || ''}`).join('\n');

  try {
    await mailer.send({ to: owner.email, subject, html, text });
    return true;
  } catch (err) {
    strapi.log.warn(`inventory-alerts.sendAlertEmail to=${owner.email}: ${err.message}`);
    return false;
  }
}

function formatStock(qty, unit) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return '—';
  return `${n} ${unit || ''}`.trim();
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  isProOwner,
  computeDepletionForecast,
  computeDepletionForecastBatch,
  runAlertScan,
  dismissForRestock,
};
