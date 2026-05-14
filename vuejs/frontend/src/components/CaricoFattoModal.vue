<script setup>
// Modale full-screen NON dismissible: l'unica uscita e' "Annulla" o "Carico fatto".
// Mostra il conteggio unita bottiglie del turno corrente in modo essenziale
// (niente revenue, solo numeri "da contare per riempire il frigo").
//
// Stampa locale: opzione "Stampa report" usa window.print() con un CSS print
// stylesheet dedicato (formato scontrino + A4 fallback). La stampante predefinita
// del browser viene memorizzata automaticamente dal sistema operativo.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import TeleportCompat from '@/lib/compat/teleport.js';

const props = defineProps({
  report: { type: Object, default: null },
  submitting: { type: Boolean, default: false },
  openedAt: { type: String, default: null },
  elapsed: { type: String, default: '—' },
});

const emit = defineEmits(['cancel', 'confirm']);

const note = ref('');

// Bottiglie da prelevare dal magazzino, divise in due gruppi:
//
// 1) Ingredienti dosati (cocktail composti): vengono da
//    `report.ingredients_consumption[]`. Mostriamo il nome ingrediente
//    (campari, gin, vermouth…) con il numero di bottiglie aperte
//    (ceil(qty_totale_usata / formato_bottiglia)). Sorgente: ricetta strutturata
//    Element ↔ Ingredient ↔ ElementIngredient.qty_per_serving.
//
// 2) Bottiglie/lattine pre-confezionate: Element del menu con
//    `is_beverage_advanced=false` (es. acqua minerale, coca-cola, birra in
//    bottiglia). Per questi 1 servita = 1 unita' intera. Sorgente:
//    `report.units[]` filtrato per `!is_beverage_advanced`.
const ingredientsConsumption = computed(() => {
  const list = props.report?.ingredients_consumption || [];
  return list
    .map((c) => ({
      key: 'ing-' + (c.ingredient_documentId || c.name),
      name: c.name,
      unit: c.unit || '',
      unit_size: c.unit_size || null,
      total_qty_used: Number(c.total_qty_used || 0),
      units_consumed: Number.isFinite(c.units_consumed) ? c.units_consumed : null,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
});

const prePackagedUnits = computed(() => {
  const units = props.report?.units || [];
  return units
    .filter((u) => !u.is_beverage_advanced)
    .map((u) => ({
      key: 'pre-' + (u.element_documentId || u.name),
      name: u.name,
      category: u.category || null,
      served_count: u.served_count,
      units_consumed: Number.isFinite(u.units_consumed) ? u.units_consumed : null,
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
});

const totalUnits = computed(() => {
  const a = ingredientsConsumption.value.reduce(
    (s, c) => s + (Number.isFinite(c.units_consumed) ? c.units_consumed : 0),
    0
  );
  const b = prePackagedUnits.value.reduce(
    (s, u) => s + (Number.isFinite(u.units_consumed) ? u.units_consumed : 0),
    0
  );
  return a + b;
});
const totalServed = computed(() => {
  const fromUnits = (props.report?.units || []).reduce((s, u) => s + (u.served_count || 0), 0);
  return fromUnits;
});

const hasAnything = computed(() => (
  ingredientsConsumption.value.length > 0
    || prePackagedUnits.value.length > 0
    || (props.report?.freeform || []).length > 0
));

const freeform = computed(() => props.report?.freeform || []);

const onCancel = () => {
  if (props.submitting) return;
  emit('cancel');
};

const onConfirm = () => {
  if (props.submitting) return;
  emit('confirm', { note: note.value || null });
};

const handlePrint = () => {
  // Stampa il contenuto del modale: il CSS @media print qui sotto restringe
  // il bundle visibile a `.cf-print-area`. La stampante predefinita del browser
  // (gia' configurata dal sistema operativo) compare nel dialog.
  window.print();
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  } catch (_e) {
    return iso;
  }
};

// Lock body scroll while modal is open
let savedOverflow = '';
onMounted(() => {
  savedOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
});
onBeforeUnmount(() => {
  document.body.style.overflow = savedOverflow;
});
</script>

<template>
  <TeleportCompat to="body">
    <div class="cf-overlay" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <div class="cf-card">
        <!-- Header non-dismissible: niente X di chiusura -->
        <header class="cf-head">
          <div class="cf-head-info">
            <div class="cf-overline">Carico fatto · Riepilogo turno</div>
            <h2 id="cf-title">Bottiglie e unita usate</h2>
            <p>
              Turno aperto il {{ formatDateTime(openedAt) }} ({{ elapsed }}).
              Conta queste unita per riempire il frigo del bar.
            </p>
          </div>
          <div class="cf-head-meta">
            <div class="cf-meta-block">
              <div class="cf-meta-label">Unita</div>
              <div class="cf-meta-value">{{ totalUnits }}</div>
            </div>
            <div class="cf-meta-block">
              <div class="cf-meta-label">Servite</div>
              <div class="cf-meta-value">{{ totalServed }}</div>
            </div>
          </div>
        </header>

        <!-- Area stampabile -->
        <section class="cf-body cf-print-area">
          <div class="cf-print-header">
            <h3>Carico fatto — Riepilogo turno bar</h3>
            <p>{{ formatDateTime(openedAt) }} → {{ formatDateTime(new Date().toISOString()) }}</p>
          </div>

          <div v-if="!hasAnything" class="cf-empty">
            <i class="bi bi-inbox"></i>
            <span>Nessuna vendita registrata in questo turno.</span>
          </div>

          <div v-else class="cf-sections">
            <!-- Bottiglie aperte dai cocktail dosati -->
            <div v-if="ingredientsConsumption.length > 0" class="cf-section">
              <h4>Bottiglie da prelevare</h4>
              <p class="cf-section-note">
                Bottiglie aperte durante il turno per preparare cocktail dosati.
                Conta queste unita' per riempire il frigo del bar.
              </p>
              <ul class="cf-list">
                <li v-for="c in ingredientsConsumption" :key="c.key" class="cf-row">
                  <div class="cf-row-name">
                    <span>{{ c.name }}</span>
                    <span class="cf-row-cat">
                      <template v-if="c.unit_size">{{ Number(c.unit_size).toFixed(0) }} {{ c.unit }} a bottiglia</template>
                      <template v-else>formato bottiglia non impostato</template>
                    </span>
                  </div>
                  <div class="cf-row-vals">
                    <span class="cf-row-served">{{ Number(c.total_qty_used).toFixed(0) }} {{ c.unit }} usati</span>
                    <strong class="cf-row-units">
                      <template v-if="c.units_consumed !== null">{{ c.units_consumed }} btg</template>
                      <template v-else>— btg</template>
                    </strong>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Bottiglie/lattine pre-confezionate (Element non-advanced) -->
            <div v-if="prePackagedUnits.length > 0" class="cf-section">
              <h4>Bottiglie/lattine pre-confezionate</h4>
              <p class="cf-section-note">
                Bevande servite intere (acqua, lattine, vino in bottiglia, ecc.):
                1 servita = 1 unita' da rimpiazzare.
              </p>
              <ul class="cf-list">
                <li v-for="u in prePackagedUnits" :key="u.key" class="cf-row">
                  <div class="cf-row-name">
                    <span>{{ u.name }}</span>
                    <span v-if="u.category" class="cf-row-cat">{{ u.category }}</span>
                  </div>
                  <div class="cf-row-vals">
                    <span class="cf-row-served">{{ u.served_count }} servite</span>
                    <strong class="cf-row-units">
                      <template v-if="u.units_consumed !== null">{{ u.units_consumed }} u.</template>
                      <template v-else>— u.</template>
                    </strong>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Totale generale -->
            <div v-if="ingredientsConsumption.length > 0 || prePackagedUnits.length > 0" class="cf-row cf-row-total">
              <div class="cf-row-name"><strong>TOTALE UNITA DA PRELEVARE</strong></div>
              <div class="cf-row-vals"><strong>{{ totalUnits }}</strong></div>
            </div>

            <!-- Free-form -->
            <div v-if="freeform.length > 0" class="cf-section cf-section-warn">
              <h4><i class="bi bi-exclamation-triangle"></i> Articoli fuori menu</h4>
              <p class="cf-warn-note">
                Voci inserite a mano: non sono conteggiate come unita perche non
                collegate a un articolo del menu.
              </p>
              <ul class="cf-list">
                <li v-for="(f, idx) in freeform" :key="`ff-${idx}`" class="cf-row">
                  <div class="cf-row-name">{{ f.name }}</div>
                  <div class="cf-row-vals">{{ f.served_count }} servite</div>
                </li>
              </ul>
            </div>
          </div>

          <!-- Nota opzionale (non in stampa) -->
          <div class="cf-note cf-no-print">
            <label class="ds-label" for="cf-note-input">Nota (opzionale)</label>
            <textarea
              id="cf-note-input"
              v-model="note"
              class="ds-input"
              maxlength="1000"
              rows="2"
              placeholder="Es. consegna fornitore, sostituzione bottiglia, ecc."
              :disabled="submitting"
            ></textarea>
          </div>
        </section>

        <!-- Footer: stampa + azioni non-dismissibili -->
        <footer class="cf-foot cf-no-print">
          <button
            type="button"
            class="ds-btn ds-btn-secondary"
            :disabled="submitting"
            @click="handlePrint"
          >
            <i class="bi bi-printer"></i>
            <span>Stampa report</span>
          </button>
          <div class="cf-foot-actions">
            <button
              type="button"
              class="ds-btn ds-btn-ghost"
              :disabled="submitting"
              @click="onCancel"
            >
              Annulla
            </button>
            <button
              type="button"
              class="ds-btn ds-btn-primary ds-btn-lg"
              :disabled="submitting"
              @click="onConfirm"
            >
              <i v-if="submitting" class="bi bi-arrow-repeat cf-spin"></i>
              <i v-else class="bi bi-check2-circle"></i>
              <span>Carico fatto</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
.cf-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.cf-card {
  background: var(--color-bg, #fff);
  color: var(--color-text);
  border-radius: 12px;
  width: 100%;
  max-width: 720px;
  max-height: 92vh;
  overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 64px rgba(0,0,0,0.4);
  border: 1px solid var(--color-border);
}

.cf-head {
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.cf-overline { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-muted); margin-bottom: 4px; }
.cf-head h2 { margin: 0 0 4px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.cf-head p { margin: 0; font-size: 13px; color: var(--color-text-secondary); line-height: 1.4; }

.cf-head-meta { display: flex; gap: 12px; }
.cf-meta-block {
  padding: 8px 16px;
  background: var(--color-bg-subtle);
  border-radius: 8px;
  text-align: center;
  min-width: 76px;
}
.cf-meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-muted); }
.cf-meta-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }

.cf-body { padding: 16px 24px; overflow-y: auto; flex: 1; min-height: 0; }
.cf-print-header { display: none; }

.cf-empty { padding: 32px; text-align: center; color: var(--color-text-muted); display: flex; align-items: center; justify-content: center; gap: 8px; }

.cf-sections { display: flex; flex-direction: column; gap: 16px; }
.cf-section h4 { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.05em; }
.cf-section-warn h4 i { color: var(--color-warning, #d97706); margin-right: 6px; }
.cf-warn-note { margin: 0 0 8px; font-size: 12px; color: var(--color-text-muted); }
.cf-section-note { margin: 0 0 8px; font-size: 12px; color: var(--color-text-muted); }

.cf-list { list-style: none; padding: 0; margin: 0; }
.cf-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 0; border-bottom: 1px dashed var(--color-border);
}
.cf-row:last-child { border-bottom: none; }
.cf-row-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.cf-row-name span:first-child { font-weight: 500; font-size: 15px; overflow: hidden; text-overflow: ellipsis; }
.cf-row-cat { font-size: 12px; color: var(--color-text-muted); }
.cf-row-vals { display: flex; gap: 12px; align-items: baseline; }
.cf-row-served { font-size: 12px; color: var(--color-text-muted); }
.cf-row-units { font-size: 18px; min-width: 56px; text-align: right; font-variant-numeric: tabular-nums; }
.cf-row-total {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 2px solid var(--color-text);
  border-bottom: none;
  font-size: 16px;
}

.cf-note { margin-top: 16px; }
.cf-note .ds-label { margin-bottom: 6px; display: block; font-size: 13px; }

.cf-foot {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  background: var(--color-bg-subtle);
}
.cf-foot-actions { display: flex; gap: 8px; }

.cf-spin { animation: cf-spin 0.8s linear infinite; display: inline-block; }
@keyframes cf-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .cf-head { padding: 16px; }
  .cf-head h2 { font-size: 18px; }
  .cf-body { padding: 12px 16px; }
  .cf-foot { padding: 12px 16px; flex-direction: column; align-items: stretch; }
  .cf-foot-actions { width: 100%; justify-content: flex-end; }
}

/* Le regole @media print vivono in un <style> non-scoped sotto, perche
 * Vue scoped style aggiunge attribute selectors `[data-v-xxx]` che impediscono
 * il match con `body *`. */
</style>

<!-- Print styles: globali (non-scoped) per poter nascondere body * e mostrare
     solo .cf-overlay. Le classi .cf- sono prefissi unici, niente collisione. -->
<style>
@media print {
  body > * { visibility: hidden !important; }
  body .cf-overlay, body .cf-overlay * { visibility: visible !important; }
  body .cf-overlay {
    position: absolute !important;
    inset: 0 !important;
    background: white !important;
    color: black !important;
    backdrop-filter: none !important;
    padding: 0 !important;
    z-index: 0 !important;
  }
  body .cf-card {
    max-height: none !important;
    border: none !important;
    box-shadow: none !important;
    overflow: visible !important;
    width: 100% !important;
    max-width: 100% !important;
    background: white !important;
    color: black !important;
  }
  body .cf-head, body .cf-foot, body .cf-head-meta, body .cf-no-print { display: none !important; }
  body .cf-body { padding: 0 !important; overflow: visible !important; }
  body .cf-print-header { display: block !important; margin: 0 0 16px; text-align: center; color: black !important; }
  body .cf-print-header h3 { margin: 0; font-size: 16px; font-weight: 700; }
  body .cf-print-header p { margin: 4px 0 0; font-size: 12px; color: #444; }
  body .cf-row { padding: 6px 0; border-bottom: 1px dashed #999 !important; color: black !important; }
  body .cf-row-units { font-size: 16px !important; }
  body .cf-row-total { border-top: 2px solid #000 !important; }
  /* Su scontrini termici 58/80mm il layout resta verticale grazie a flex */
}
</style>
