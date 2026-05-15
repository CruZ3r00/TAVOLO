<script setup>
// Editor ricetta avanzata per una bevanda (is_beverage_advanced=true).
// Permette di inserire per ogni ingrediente:
//   - Capacita unita (es. 750 ml per una bottiglia di gin)
//   - Uso per porzione (es. 20 ml per un Negroni)
//
// Use case: cocktail, vini al calice, drink miscelati. Il sistema calcola
// `units_consumed = ceil(somma_uso_turno / capacita_unita)` per ogni bottiglia
// alla chiusura del turno bar.
//
// Layout pagina (full-screen modal con overlay): header con breadcrumb,
// callout esplicazione, tabella ingredienti con header sticky, sezione
// "Simulazione consumo" con stepper porzioni e calcoli live, pannello destro
// 380px con esempio Negroni + stato ricetta + payload JSON, sticky bottom bar.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import TeleportCompat from '@/lib/compat/teleport.js';
import {
  API_BASE,
  fetchElementRecipe,
  setElementRecipe,
  inventoryErrorMessage,
} from '@/utils';

const props = defineProps({
  element: { type: Object, required: true },
});
const emit = defineEmits(['cancel', 'done', 'deactivated']);

const deactivating = ref(false);

const store = useStore();
const token = computed(() => store.getters.getToken);

const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const rows = ref([]);
const servings = ref(0);

const loadAll = async () => {
  loading.value = true;
  error.value = '';
  try {
    const recipe = await fetchElementRecipe(token.value, props.element.documentId);
    rows.value = recipe.map((r) => ({
      name: r.ingredient.name,
      unit: r.ingredient.unit || 'ml',
      unit_size: r.ingredient.unit_size !== null ? String(r.ingredient.unit_size) : '',
      qty_per_serving: r.qty_per_serving > 0 ? String(r.qty_per_serving) : '',
    }));
    if (rows.value.length === 0) {
      rows.value.push({ name: '', unit: 'ml', unit_size: '', qty_per_serving: '' });
    }
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  } finally {
    loading.value = false;
  }
};

const addRow = () => {
  rows.value.push({ name: '', unit: 'ml', unit_size: '', qty_per_serving: '' });
};

const removeRow = (idx) => {
  rows.value.splice(idx, 1);
};

const incServings = () => { servings.value = Math.min(999, servings.value + 1); };
const decServings = () => { servings.value = Math.max(0, servings.value - 1); };

// Per ogni riga: totalUse, unitsConsumed, leftover, percentuale.
const simulation = computed(() =>
  rows.value.map((r) => {
    const cap = Number(r.unit_size) || 0;
    const dose = Number(r.qty_per_serving) || 0;
    const totalUse = dose * servings.value;
    const unitsConsumed = cap > 0 ? Math.ceil(totalUse / cap) : 0;
    const leftover = unitsConsumed * cap - totalUse;
    const pct = cap > 0 ? Math.min(100, (totalUse / cap) * 100) : 0;
    return { name: r.name, unit: r.unit, unit_size: r.unit_size, dose: r.qty_per_serving, totalUse, unitsConsumed, leftover, pct };
  }),
);

const validRows = computed(() =>
  rows.value.filter((r) => String(r.name || '').trim() && Number(r.qty_per_serving) > 0),
);
const recipeIsValid = computed(() => validRows.value.length > 0);
const totalDosePerServing = computed(() =>
  rows.value.reduce((s, r) => s + (Number(r.qty_per_serving) || 0), 0),
);
const validityLabel = computed(() => (recipeIsValid.value ? '✓ OK' : '⚠ Incompleta'));

const payloadJson = computed(() => {
  const items = validRows.value.map((r) => {
    const unitSize = r.unit_size === '' || !Number.isFinite(Number(r.unit_size)) ? null : Number(r.unit_size);
    const sizeFrag = unitSize !== null ? `, unit_size: ${unitSize}` : '';
    return `    { name: "${r.name}", unit: "${r.unit}"${sizeFrag}, qty_per_serving: ${Number(r.qty_per_serving)} }`;
  });
  if (items.length === 0) return '{ recipe: [] }';
  const truncated = items.length > 3 ? items.slice(0, 3).concat(['    …']) : items;
  return `{
  recipe: [
${truncated.join(',\n')}
  ]
}`;
});

const onSubmit = async () => {
  // Validazione: ogni riga deve avere name + qty > 0
  const recipe = [];
  for (let i = 0; i < rows.value.length; i += 1) {
    const r = rows.value[i];
    const name = String(r.name || '').trim();
    if (!name) continue; // skip empty rows
    const qty = Number(r.qty_per_serving);
    if (!Number.isFinite(qty) || qty <= 0) {
      error.value = `Riga ${i + 1}: uso per porzione non valido.`;
      return;
    }
    const item = { name, unit: r.unit, qty_per_serving: qty };
    if (r.unit_size !== '' && Number.isFinite(Number(r.unit_size))) {
      item.unit_size = Number(r.unit_size);
    }
    recipe.push(item);
  }
  if (recipe.length === 0) {
    error.value = 'Aggiungi almeno un ingrediente.';
    return;
  }

  submitting.value = true;
  error.value = '';
  try {
    await setElementRecipe(token.value, props.element.documentId, recipe);
    emit('done');
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  } finally {
    submitting.value = false;
  }
};

const onDeactivate = async () => {
  if (deactivating.value || submitting.value) return;
  if (!confirm('Disattivare la gestione avanzata? I dosaggi resteranno salvati e saranno disponibili se la riattivi.')) {
    return;
  }
  deactivating.value = true;
  error.value = '';
  try {
    const resp = await fetch(`${API_BASE}/api/elements/${props.element.documentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${store.getters.getToken}`,
      },
      body: JSON.stringify({ data: { is_beverage_advanced: false } }),
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => null);
      throw new Error(payload?.error?.message || 'Disattivazione non riuscita.');
    }
    emit('deactivated', props.element);
  } catch (e) {
    error.value = inventoryErrorMessage(e);
  } finally {
    deactivating.value = false;
  }
};

let savedOverflow = '';
onMounted(() => {
  savedOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  loadAll();
});
onBeforeUnmount(() => { document.body.style.overflow = savedOverflow; });
</script>

<template>
  <TeleportCompat to="body">
    <div class="bae-overlay" role="dialog" aria-modal="true" @click.self="!submitting && emit('cancel')">
      <div class="bae-shell">
        <!-- Header con breadcrumb + titolo + close -->
        <header class="bae-head">
          <nav class="bae-crumbs" aria-label="breadcrumb">
            <span class="bae-crumb">Menu</span>
            <span class="bae-crumb-sep" aria-hidden="true">/</span>
            <span class="bae-crumb">Bevande</span>
            <span class="bae-crumb-sep" aria-hidden="true">/</span>
            <span class="bae-crumb">{{ element.name }}</span>
            <span class="bae-crumb-sep" aria-hidden="true">/</span>
            <span class="bae-crumb bae-crumb--current">Ricetta avanzata</span>
          </nav>
          <div class="bae-title-row">
            <div class="bae-title-block">
              <h1 class="bae-title">
                Ricetta avanzata
                <span class="bae-title-sep" aria-hidden="true">·</span>
                <span class="bae-title-name">{{ element.name }}</span>
              </h1>
              <p class="bae-subtitle">
                Definisci capacità unità e dose per porzione. Il sistema scala
                automaticamente bottiglie e magazzino a ogni turno bar.
              </p>
            </div>
            <button
              type="button"
              class="bae-close"
              :disabled="submitting"
              aria-label="Chiudi"
              @click="emit('cancel')"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </header>

        <!-- 2-col body -->
        <div class="bae-grid">
          <div class="bae-main">
            <!-- 1 · Callout esplicazione -->
            <section class="bae-callout-wrap">
              <div class="bae-callout">
                <span class="bae-callout-icon" aria-hidden="true">✱</span>
                <div class="bae-callout-text">
                  <strong>Come funziona:</strong> per ogni ingrediente registri
                  <strong>capacità unità</strong> (es. <em>750ml</em> = bottiglia)
                  e <strong>uso per porzione</strong> (es. <em>20ml</em> per un
                  Negroni). A fine turno il sistema calcola
                  <code class="bae-code">units_consumed = ceil(uso_totale / capacità)</code>
                  e scala il magazzino bottiglie.
                </div>
              </div>
            </section>

            <!-- 2 · Tabella ingredienti -->
            <section class="bae-section">
              <div class="bae-section-head">
                <h2 class="bae-section-title">Ingredienti della ricetta</h2>
                <span class="bae-section-meta">{{ rows.length }} {{ rows.length === 1 ? 'riga' : 'righe' }}</span>
              </div>

              <div v-if="loading" class="bae-loading">
                <i class="bi bi-arrow-repeat bae-spin"></i>
                <span>Caricamento ricetta…</span>
              </div>

              <template v-else>
                <div class="bae-table">
                  <div class="bae-table-head">
                    <span>Ingrediente</span>
                    <span>Unità</span>
                    <span>Capacità unità</span>
                    <span>Uso / porzione</span>
                    <span aria-hidden="true"></span>
                  </div>
                  <div class="bae-table-body">
                    <div v-for="(row, idx) in rows" :key="idx" class="bae-row">
                      <input
                        v-model="row.name"
                        type="text"
                        class="bae-input"
                        placeholder="Es. Gin Tanqueray"
                        :disabled="submitting"
                      />
                      <select v-model="row.unit" class="bae-input bae-select" :disabled="submitting">
                        <option value="ml">ml</option>
                        <option value="l">l</option>
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="pz">pz</option>
                      </select>
                      <div class="bae-input-suffix-wrap">
                        <input
                          v-model="row.unit_size"
                          type="number"
                          min="0"
                          step="0.01"
                          class="bae-input bae-input--mono"
                          placeholder="750"
                          :disabled="submitting"
                        />
                        <span class="bae-input-suffix">{{ row.unit }}</span>
                      </div>
                      <div class="bae-input-suffix-wrap">
                        <input
                          v-model="row.qty_per_serving"
                          type="number"
                          min="0"
                          step="0.01"
                          class="bae-input bae-input--mono"
                          placeholder="20"
                          :disabled="submitting"
                        />
                        <span class="bae-input-suffix">{{ row.unit }}</span>
                      </div>
                      <button
                        type="button"
                        class="bae-icon-btn"
                        :disabled="submitting"
                        aria-label="Rimuovi riga"
                        @click="removeRow(idx)"
                      >
                        <i class="bi bi-x"></i>
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  class="bae-add-btn"
                  :disabled="submitting"
                  @click="addRow"
                >
                  <span aria-hidden="true">＋</span>
                  <span>Aggiungi ingrediente</span>
                </button>

                <p v-if="error" class="bae-inline-error" role="alert">
                  <i class="bi bi-exclamation-circle"></i>
                  <span>{{ error }}</span>
                </p>
              </template>
            </section>

            <!-- 3 · Simulazione consumo -->
            <section v-if="!loading" class="bae-section">
              <div class="bae-section-head bae-sim-head">
                <div>
                  <h2 class="bae-section-title">Simulazione consumo</h2>
                  <p class="bae-section-sub">Verifica come scalano le bottiglie a fine turno.</p>
                </div>
                <div class="bae-stepper" role="group" aria-label="Porzioni servite">
                  <span class="bae-stepper-label">Porzioni servite</span>
                  <button type="button" class="bae-stepper-btn" :disabled="servings === 0" @click="decServings">−</button>
                  <strong class="bae-stepper-value">{{ servings }}</strong>
                  <button type="button" class="bae-stepper-btn" @click="incServings">+</button>
                </div>
              </div>

              <div class="bae-sim-rows">
                <div v-for="(s, idx) in simulation" :key="idx" class="bae-sim-row">
                  <div class="bae-sim-name">
                    <div class="bae-sim-name-text">{{ s.name || '—' }}</div>
                    <div class="bae-sim-name-meta">
                      cap {{ s.unit_size || '?' }}{{ s.unit }} · dose {{ s.dose || '?' }}{{ s.unit }}
                    </div>
                  </div>
                  <div class="bae-sim-bar-block">
                    <div class="bae-sim-bar-meta">
                      <span>uso: {{ s.totalUse }}{{ s.unit }}</span>
                      <span>resto: {{ s.leftover }}{{ s.unit }}</span>
                    </div>
                    <div class="bae-sim-bar">
                      <div class="bae-sim-bar-fill" :style="{ width: s.pct + '%' }"></div>
                    </div>
                  </div>
                  <div
                    class="bae-sim-badge"
                    :class="{ 'bae-sim-badge--off': s.unitsConsumed === 0 }"
                  >
                    −{{ s.unitsConsumed }} {{ s.unitsConsumed === 1 ? 'unità' : 'unità' }}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <!-- Pannello destro 380px -->
          <aside class="bae-side" aria-label="Riferimento e payload">
            <div class="bae-side-overline">Esempio classico</div>
            <div class="bae-example">
              <div class="bae-example-head">NEGRONI · 1 porzione</div>
              <div class="bae-example-rows">
                <div class="bae-example-row"><span>Gin 750ml</span><span>20ml</span></div>
                <div class="bae-example-row"><span>Campari 750ml</span><span>20ml</span></div>
                <div class="bae-example-row"><span>Vermouth 1L</span><span>20ml</span></div>
              </div>
              <div class="bae-example-divider"></div>
              <p class="bae-example-note">
                5 porzioni servite = <strong>100ml × 3</strong> →
                1 unità di ognuna scalata dal magazzino.
              </p>
            </div>

            <div class="bae-status">
              <div class="bae-side-overline">Stato della ricetta</div>
              <div class="bae-status-rows">
                <div class="bae-status-row">
                  <span class="bae-status-k">Ingredienti</span>
                  <strong class="bae-status-v">{{ validRows.length }}</strong>
                </div>
                <div class="bae-status-row">
                  <span class="bae-status-k">Dose totale / porzione</span>
                  <strong class="bae-status-v">{{ totalDosePerServing }} ml</strong>
                </div>
                <div class="bae-status-row">
                  <span class="bae-status-k">Validazione</span>
                  <strong class="bae-status-v" :class="recipeIsValid ? 'bae-status-v--ok' : 'bae-status-v--warn'">
                    {{ validityLabel }}
                  </strong>
                </div>
              </div>
            </div>

            <div class="bae-payload">
              <div class="bae-payload-head">PUT /api/elements/:id/recipe</div>
              <pre class="bae-payload-pre">{{ payloadJson }}</pre>
            </div>
          </aside>
        </div>

        <!-- Sticky bottom bar -->
        <footer class="bae-foot">
          <button
            type="button"
            class="bae-btn bae-btn--danger-ghost"
            :disabled="submitting || deactivating || loading"
            @click="onDeactivate"
            title="Disattiva la gestione avanzata (i dosaggi restano salvati)"
          >
            <i v-if="deactivating" class="bi bi-arrow-repeat bae-spin"></i>
            <i v-else class="bi bi-toggle-off"></i>
            <span>Disattiva avanzata</span>
          </button>
          <div class="bae-foot-spacer"></div>
          <button
            type="button"
            class="bae-btn bae-btn--ghost"
            :disabled="submitting || deactivating"
            @click="emit('cancel')"
          >Annulla</button>
          <button
            type="button"
            class="bae-btn bae-btn--primary"
            :disabled="submitting || deactivating || loading"
            @click="onSubmit"
          >
            <i v-if="submitting" class="bi bi-arrow-repeat bae-spin"></i>
            <i v-else class="bi bi-check2"></i>
            <span>Salva ricetta</span>
          </button>
        </footer>
      </div>
    </div>
  </TeleportCompat>
</template>

<style scoped>
/* ─────────────── Overlay full-screen modal ─────────────── */
.bae-overlay {
  position: fixed;
  inset: 0;
  z-index: 8500;
  background: color-mix(in oklab, black 55%, transparent);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 24px;
}
.bae-shell {
  background: var(--bg);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 14px;
  width: 100%;
  max-width: 1280px;
  max-height: calc(100vh - 48px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-pop, 0 24px 64px rgba(0,0,0,0.3));
  font-family: var(--f-sans);
}

/* ─────────────── Header ─────────────── */
.bae-head {
  flex-shrink: 0;
  padding: 18px 28px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--paper);
}
.bae-crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-3);
  margin-bottom: 10px;
}
.bae-crumb { color: var(--ink-3); }
.bae-crumb--current { color: var(--ink); font-weight: 600; }
.bae-crumb-sep { color: var(--ink-3); opacity: 0.6; }

.bae-title-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.bae-title-block { flex: 1; min-width: 0; }
.bae-title {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.bae-title-sep { color: var(--ink-3); font-weight: 400; }
.bae-title-name { color: var(--ac); font-weight: 650; font-style: normal; }
.bae-subtitle {
  margin: 4px 0 0;
  font-size: 13.5px;
  color: var(--ink-3);
}
.bae-close {
  appearance: none;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: grid; place-items: center;
  cursor: pointer;
  color: var(--ink-2);
  transition: background var(--dur-fast), color var(--dur-fast);
}
.bae-close:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.bae-close i { font-size: 14px; }

/* ─────────────── Grid 2-col ─────────────── */
.bae-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.bae-main {
  overflow-y: auto;
  min-width: 0;
}

/* ─────────────── Callout ─────────────── */
.bae-callout-wrap {
  padding: 20px 28px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-sunk);
}
.bae-callout {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.bae-callout-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: var(--ac-soft);
  color: var(--ac);
  display: grid; place-items: center;
  font-size: 16px;
  flex-shrink: 0;
}
.bae-callout-text {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.55;
}
.bae-callout-text strong { color: var(--ink); }
.bae-callout-text em { color: var(--ink-2); font-style: italic; }
.bae-code {
  font-family: var(--f-mono);
  font-size: 12px;
  background: var(--bg-sunk);
  padding: 1px 6px;
  border-radius: 4px;
}

/* ─────────────── Sezioni ─────────────── */
.bae-section {
  padding: 22px 28px;
  border-bottom: 1px solid var(--line);
}
.bae-section:last-child { border-bottom: none; }
.bae-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
}
.bae-section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--ink);
}
.bae-section-meta {
  font-size: 12px;
  color: var(--ink-3);
  font-family: var(--f-mono);
}
.bae-section-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--ink-3);
}

/* ─────────────── Tabella ─────────────── */
.bae-table {
  display: flex;
  flex-direction: column;
}
.bae-table-head {
  display: grid;
  grid-template-columns: 1.6fr 80px 1fr 1fr 32px;
  gap: 10px;
  padding: 0 12px 8px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 2;
}
.bae-table-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bae-row {
  display: grid;
  grid-template-columns: 1.6fr 80px 1fr 1fr 32px;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.bae-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  font-family: inherit;
  font-size: 13.5px;
  outline: none;
  transition: border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast);
}
.bae-input:focus {
  border-color: var(--ac);
  background: var(--bg);
  box-shadow: 0 0 0 3px var(--ac-soft);
}
.bae-input:disabled { opacity: 0.55; cursor: not-allowed; }
.bae-input--mono { font-family: var(--f-mono); padding-right: 36px; }
.bae-select { appearance: auto; }

.bae-input-suffix-wrap { position: relative; }
.bae-input-suffix {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--ink-3);
  pointer-events: none;
  font-family: var(--f-mono);
}

.bae-icon-btn {
  appearance: none;
  border: none;
  background: transparent;
  width: 32px; height: 32px;
  border-radius: 6px;
  display: grid; place-items: center;
  cursor: pointer;
  color: var(--ink-3);
  transition: background var(--dur-fast), color var(--dur-fast);
}
.bae-icon-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.bae-icon-btn i { font-size: 16px; }

.bae-add-btn {
  margin-top: 10px;
  height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px dashed var(--line);
  background: transparent;
  color: var(--ink-2);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.bae-add-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--ac);
  color: var(--ink);
}
.bae-add-btn span:first-child { font-size: 15px; line-height: 1; }

.bae-loading {
  padding: 24px;
  text-align: center;
  color: var(--ink-3);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.bae-inline-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin: 12px 0 0;
  background: color-mix(in oklab, var(--danger) 10%, var(--paper));
  color: var(--danger);
  border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
  border-radius: 8px;
  font-size: 13px;
}

/* ─────────────── Simulazione ─────────────── */
.bae-sim-head {
  align-items: flex-end;
}
.bae-stepper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  background: var(--bg-sunk);
  border: 1px solid var(--line);
  border-radius: 999px;
}
.bae-stepper-label { font-size: 12px; color: var(--ink-3); }
.bae-stepper-value {
  font-family: var(--f-mono);
  min-width: 24px;
  text-align: center;
  font-size: 15px;
  color: var(--ink);
}
.bae-stepper-btn {
  appearance: none;
  width: 28px; height: 28px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--paper);
  cursor: pointer;
  font-size: 14px;
  color: var(--ink-2);
  display: grid; place-items: center;
  transition: background var(--dur-fast);
}
.bae-stepper-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.bae-stepper-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.bae-sim-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bae-sim-row {
  display: grid;
  grid-template-columns: 1.4fr 1.4fr auto;
  gap: 18px;
  align-items: center;
  padding: 12px 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.bae-sim-name { min-width: 0; }
.bae-sim-name-text {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bae-sim-name-meta {
  font-size: 11px;
  color: var(--ink-3);
  font-family: var(--f-mono);
  margin-top: 2px;
}
.bae-sim-bar-block {}
.bae-sim-bar-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ink-3);
  font-family: var(--f-mono);
  margin-bottom: 4px;
}
.bae-sim-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-sunk);
  overflow: hidden;
}
.bae-sim-bar-fill {
  height: 100%;
  background: var(--ac);
  transition: width 200ms;
}
.bae-sim-badge {
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--ink);
  color: var(--bg);
  font-family: var(--f-mono);
  font-size: 13px;
  font-weight: 700;
  min-width: 84px;
  text-align: center;
}
.bae-sim-badge--off {
  background: var(--bg-sunk);
  color: var(--ink-3);
}

/* ─────────────── Pannello destro ─────────────── */
.bae-side {
  background: var(--bg-sunk);
  border-left: 1px solid var(--line);
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.bae-side-overline {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-3);
  margin-bottom: 10px;
}

.bae-example {
  background: var(--ink);
  color: var(--bg);
  border-radius: 12px;
  padding: 16px;
  font-family: var(--f-mono);
}
.bae-example-head {
  font-size: 10px;
  opacity: 0.6;
  margin-bottom: 6px;
}
.bae-example-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.bae-example-row {
  display: flex;
  justify-content: space-between;
}
.bae-example-divider {
  height: 1px;
  background: rgba(255,255,255,0.15);
  margin: 10px 0;
}
.bae-example-note {
  margin: 0;
  font-size: 11px;
  opacity: 0.85;
  line-height: 1.5;
}

.bae-status {
  padding: 14px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.bae-status-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
}
.bae-status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.bae-status-k { color: var(--ink-3); }
.bae-status-v { color: var(--ink); font-weight: 600; }
.bae-status-v--ok { color: var(--ok-ink, var(--ok)); }
.bae-status-v--warn { color: var(--danger); }

.bae-payload {
  padding: 12px;
  background: var(--ink);
  color: var(--bg);
  border-radius: 10px;
  font-family: var(--f-mono);
  font-size: 11px;
}
.bae-payload-head {
  opacity: 0.6;
  margin-bottom: 4px;
}
.bae-payload-pre {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--bg);
  font-family: var(--f-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ─────────────── Sticky footer ─────────────── */
.bae-foot {
  flex-shrink: 0;
  height: 64px;
  border-top: 1px solid var(--line);
  background: var(--paper);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 28px;
}
.bae-foot-spacer { flex: 1; }

/* ─────────────── Buttons ─────────────── */
.bae-btn {
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 8px;
  height: 40px;
  padding: 0 16px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--paper);
  color: var(--ink);
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.bae-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.bae-btn--ghost { background: var(--paper); color: var(--ink-2); }
.bae-btn--ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--ink); }
.bae-btn--primary {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
}
.bae-btn--primary:hover:not(:disabled) {
  background: var(--ac);
  border-color: var(--ac);
}
.bae-btn--danger-ghost {
  color: var(--danger);
  border-color: color-mix(in oklab, var(--danger) 25%, var(--line));
}
.bae-btn--danger-ghost:hover:not(:disabled) {
  background: color-mix(in oklab, var(--danger) 8%, transparent);
}
.bae-btn i { font-size: 14px; }

.bae-spin {
  animation: bae-spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes bae-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ─────────────── Responsive ─────────────── */
@media (max-width: 1100px) {
  .bae-grid { grid-template-columns: 1fr 320px; }
}
@media (max-width: 980px) {
  .bae-overlay { padding: 0; }
  .bae-shell { max-height: 100vh; border-radius: 0; max-width: 100%; }
  .bae-grid { grid-template-columns: 1fr; }
  .bae-side {
    border-left: none;
    border-top: 1px solid var(--line);
  }
  .bae-row {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .bae-row > :nth-child(1) { grid-column: 1 / -1; }
  .bae-row > :nth-child(5) {
    grid-column: 2;
    justify-self: end;
  }
  .bae-table-head { display: none; }
  .bae-section { padding: 16px; }
  .bae-callout-wrap { padding: 16px; }
  .bae-foot { padding: 0 16px; }
}
@media (max-width: 640px) {
  .bae-head { padding: 14px 16px; }
  .bae-sim-head { flex-direction: column; align-items: stretch; }
  .bae-sim-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .bae-title { font-size: 19px; }
}
</style>
