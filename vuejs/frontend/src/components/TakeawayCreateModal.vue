<script setup>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import Modal from '@/components/Modal.vue';
import { createTakeaway, fetchMenuElements, orderErrorMessage } from '@/utils';
import { effectiveUserDocumentId } from '@/staffAccess';

const props = defineProps({
  show: { type: Boolean, default: false },
  token: { type: String, default: null },
});

const emit = defineEmits(['close', 'created']);

const store = useStore();
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const step = ref('items');
const menuElements = ref([]);
const loadingMenu = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const fieldErrors = ref({});
const search = ref('');
const selectedCategory = ref('all');
const cart = ref([]);
const free = ref({ name: '', price: '', quantity: 1, category: 'Altro', notes: '', course: 1 });
const customer = ref({
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  date: todayISO(),
  time: '20:00',
});

const reset = () => {
  step.value = 'items';
  cart.value = [];
  search.value = '';
  selectedCategory.value = 'all';
  free.value = { name: '', price: '', quantity: 1, category: 'Altro', notes: '', course: 1 };
  customer.value = { customer_name: '', customer_phone: '', customer_email: '', date: todayISO(), time: '20:00' };
  errorMessage.value = '';
  fieldErrors.value = {};
};

watch(() => props.show, async (v) => {
  if (!v) return;
  reset();
  await loadMenu();
});

const loadMenu = async () => {
  const ownerDoc = effectiveUserDocumentId(store.getters.getUser);
  if (!ownerDoc) return;
  loadingMenu.value = true;
  try {
    const data = await fetchMenuElements(ownerDoc);
    menuElements.value = data?.data?.[0]?.fk_elements || [];
  } finally {
    loadingMenu.value = false;
  }
};

const categories = computed(() => {
  const counts = new Map();
  for (const el of menuElements.value) {
    const c = el.category || 'Altro';
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'it')).map(([name, count]) => ({ name, count }));
});

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return menuElements.value.filter((el) => {
    const cat = el.category || 'Altro';
    if (selectedCategory.value !== 'all' && selectedCategory.value !== cat) return false;
    return !q || String(el.name || '').toLowerCase().includes(q) || cat.toLowerCase().includes(q);
  });
});

const grouped = computed(() => filtered.value.reduce((acc, el) => {
  const cat = el.category || 'Altro';
  (acc[cat] = acc[cat] || []).push(el);
  return acc;
}, {}));

const total = computed(() => cart.value.reduce((sum, item) => sum + (Number(item.price || 0) * (parseInt(item.quantity, 10) || 1)), 0));
const minDate = computed(() => todayISO());

const addMenuItem = (el) => {
  cart.value.push({
    element_id: el.documentId,
    name: el.name,
    price: Number(el.price || 0),
    category: el.category || 'Altro',
    quantity: 1,
    course: 1,
    notes: '',
  });
};

const validateFree = () => {
  const errs = {};
  if (!free.value.name.trim()) errs.free = 'Inserisci il nome del piatto libero.';
  const price = parseFloat(free.value.price);
  if (!Number.isFinite(price) || price < 0) errs.free = 'Prezzo libero non valido.';
  const qty = parseInt(free.value.quantity, 10);
  if (!Number.isFinite(qty) || qty < 1) errs.free = 'Quantità libera non valida.';
  fieldErrors.value = errs;
  return Object.keys(errs).length === 0;
};

const addFreeItem = () => {
  if (!validateFree()) return;
  cart.value.push({
    name: free.value.name.trim(),
    price: parseFloat(free.value.price),
    category: free.value.category.trim() || 'Altro',
    quantity: parseInt(free.value.quantity, 10),
    course: parseInt(free.value.course, 10) || 1,
    notes: free.value.notes.trim() || undefined,
  });
  free.value = { name: '', price: '', quantity: 1, category: 'Altro', notes: '', course: 1 };
};

const removeItem = (idx) => {
  cart.value.splice(idx, 1);
};

const canGoCustomer = computed(() => cart.value.length > 0);

const validateCustomer = () => {
  const errs = {};
  if (!customer.value.customer_name.trim()) errs.customer_name = 'Inserisci il nome.';
  if (!customer.value.customer_phone.trim()) errs.customer_phone = 'Inserisci il telefono.';
  if (customer.value.customer_email && !/^\S+@\S+\.\S+$/.test(customer.value.customer_email.trim())) {
    errs.customer_email = 'Email non valida.';
  }
  const dt = new Date(`${customer.value.date}T${customer.value.time || '00:00'}`);
  if (Number.isNaN(dt.getTime()) || dt.getTime() < Date.now()) errs.time = 'Scegli un orario futuro.';
  fieldErrors.value = errs;
  return Object.keys(errs).length === 0;
};

const submit = async () => {
  if (!props.token || !validateCustomer()) return;
  saving.value = true;
  errorMessage.value = '';
  try {
    const items = cart.value.map((item) => ({
      element_id: item.element_id,
      name: item.element_id ? undefined : item.name,
      price: item.element_id ? undefined : item.price,
      category: item.element_id ? undefined : item.category,
      quantity: parseInt(item.quantity, 10) || 1,
      course: parseInt(item.course, 10) || 1,
      notes: item.notes || undefined,
    }));
    const created = await createTakeaway({
      customer_name: customer.value.customer_name.trim(),
      customer_phone: customer.value.customer_phone.trim(),
      customer_email: customer.value.customer_email.trim() || undefined,
      date: customer.value.date,
      time: customer.value.time.length === 5 ? `${customer.value.time}:00` : customer.value.time,
      items,
    }, props.token);
    emit('created', created);
    emit('close');
  } catch (err) {
    errorMessage.value = orderErrorMessage(err);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <Modal :show="show" @close="emit('close')">
    <template #title>
      <div class="tc-title"><i class="bi bi-bag-plus"></i><h2>Nuovo asporto</h2></div>
    </template>
    <template #body>
      <div class="tc">
        <div v-if="errorMessage" class="ds-alert ds-alert-error">
          <i class="bi bi-exclamation-circle"></i><span>{{ errorMessage }}</span>
        </div>

        <div class="aim-tabs" role="tablist">
          <button type="button" class="aim-tab" :class="{ active: step === 'items' }" @click="step = 'items'">
            <i class="bi bi-basket"></i>Ordine
          </button>
          <button type="button" class="aim-tab" :class="{ active: step === 'customer' }" :disabled="!canGoCustomer" @click="step = 'customer'">
            <i class="bi bi-person-lines-fill"></i>Cliente
          </button>
        </div>

        <template v-if="step === 'items'">
          <div class="tc-grid">
            <section class="tc-menu">
              <div class="aim-search">
                <i class="bi bi-search aim-search-icon"></i>
                <input v-model="search" class="ds-input aim-search-input" type="text" placeholder="Cerca piatto o categoria">
              </div>
              <div class="aim-category-filter">
                <button type="button" class="aim-filter-chip" :class="{ active: selectedCategory === 'all' }" @click="selectedCategory = 'all'">
                  Tutto <span>{{ menuElements.length }}</span>
                </button>
                <button v-for="cat in categories" :key="cat.name" type="button" class="aim-filter-chip" :class="{ active: selectedCategory === cat.name }" @click="selectedCategory = cat.name">
                  {{ cat.name }} <span>{{ cat.count }}</span>
                </button>
              </div>
              <div v-if="loadingMenu" class="aim-loading"><span class="ds-spinner"></span>Caricamento menu...</div>
              <div v-else class="tc-list">
                <template v-for="(items, category) in grouped" :key="category">
                  <div class="aim-category">{{ category }}</div>
                  <button v-for="el in items" :key="el.documentId" type="button" class="aim-element" @click="addMenuItem(el)">
                    <span class="aim-el-name">{{ el.name }}</span>
                    <span class="aim-el-price">&euro; {{ Number(el.price || 0).toFixed(2) }}</span>
                  </button>
                </template>
              </div>
            </section>

            <aside class="tc-cart">
              <header class="tc-cart-head">
                <strong>Carrello</strong>
                <span>&euro; {{ total.toFixed(2) }}</span>
              </header>
              <div v-if="cart.length" class="tc-cart-list">
                <div v-for="(item, idx) in cart" :key="`${item.name}-${idx}`" class="tc-cart-row">
                  <div>
                    <strong>{{ item.name }}</strong>
                    <span>{{ item.category }} · &euro; {{ Number(item.price || 0).toFixed(2) }}</span>
                  </div>
                  <input v-model.number="item.quantity" class="ds-input tc-qty" type="number" min="1">
                  <input v-model.number="item.course" class="ds-input tc-course" type="number" min="1" max="12" aria-label="Portata">
                  <button type="button" class="tc-remove" @click="removeItem(idx)" aria-label="Rimuovi"><i class="bi bi-x-lg"></i></button>
                </div>
              </div>
              <div v-else class="tc-empty">Aggiungi almeno un piatto.</div>

              <div class="tc-free">
                <strong>Fuori menu</strong>
                <input v-model="free.name" class="ds-input" type="text" placeholder="Nome">
                <div class="form-row-2">
                  <input v-model="free.price" class="ds-input" type="number" min="0" step="0.01" placeholder="Prezzo">
                  <input v-model.number="free.quantity" class="ds-input" type="number" min="1" placeholder="Qtà">
                </div>
                <div class="form-row-2">
                  <input v-model="free.category" class="ds-input" type="text" placeholder="Categoria">
                  <input v-model.number="free.course" class="ds-input" type="number" min="1" max="12" placeholder="Portata">
                </div>
                <input v-model="free.notes" class="ds-input" type="text" placeholder="Note">
                <p v-if="fieldErrors.free" class="ds-helper tc-err">{{ fieldErrors.free }}</p>
                <button type="button" class="ds-btn ds-btn-secondary" @click="addFreeItem"><i class="bi bi-plus-lg"></i>Aggiungi fuori menu</button>
              </div>
            </aside>
          </div>
          <div class="tc-actions">
            <button type="button" class="ds-btn ds-btn-ghost" @click="emit('close')">Annulla</button>
            <button type="button" class="ds-btn ds-btn-primary" :disabled="!canGoCustomer" @click="step = 'customer'">
              <span>Avanti</span><i class="bi bi-arrow-right"></i>
            </button>
          </div>
        </template>

        <form v-else class="tc-customer" @submit.prevent="submit" novalidate>
          <div class="ds-field">
            <label class="ds-label" for="tc-name">Nome cliente *</label>
            <input id="tc-name" v-model="customer.customer_name" class="ds-input" type="text" maxlength="120">
            <p v-if="fieldErrors.customer_name" class="ds-helper tc-err">{{ fieldErrors.customer_name }}</p>
          </div>
          <div class="form-row-2">
            <div class="ds-field">
              <label class="ds-label" for="tc-phone">Telefono *</label>
              <input id="tc-phone" v-model="customer.customer_phone" class="ds-input" type="tel" maxlength="32">
              <p v-if="fieldErrors.customer_phone" class="ds-helper tc-err">{{ fieldErrors.customer_phone }}</p>
            </div>
            <div class="ds-field">
              <label class="ds-label" for="tc-email">Email</label>
              <input id="tc-email" v-model="customer.customer_email" class="ds-input" type="email">
              <p v-if="fieldErrors.customer_email" class="ds-helper tc-err">{{ fieldErrors.customer_email }}</p>
            </div>
          </div>
          <div class="form-row-2">
            <div class="ds-field">
              <label class="ds-label" for="tc-date">Data ritiro *</label>
              <input id="tc-date" v-model="customer.date" class="ds-input" type="date" :min="minDate">
            </div>
            <div class="ds-field">
              <label class="ds-label" for="tc-time">Ora ritiro *</label>
              <input id="tc-time" v-model="customer.time" class="ds-input" type="time" step="300">
              <p v-if="fieldErrors.time" class="ds-helper tc-err">{{ fieldErrors.time }}</p>
            </div>
          </div>
          <div class="tc-actions">
            <button type="button" class="ds-btn ds-btn-ghost" :disabled="saving" @click="step = 'items'">
              <i class="bi bi-arrow-left"></i><span>Indietro</span>
            </button>
            <button type="submit" class="ds-btn ds-btn-primary" :disabled="saving">
              <span v-if="saving" class="spin-icon"></span>
              <i v-else class="bi bi-check2-circle"></i><span>Crea asporto</span>
            </button>
          </div>
        </form>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.tc-title { display: flex; align-items: center; gap: 10px; }
.tc-title h2 { margin: 0; font-size: 16px; font-weight: 700; }
.tc-title i { color: var(--ac); }
.tc { display: flex; flex-direction: column; gap: 14px; }
.aim-tabs { display: flex; gap: 3px; padding: 4px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--bg-2); }
.aim-tab { flex: 1; min-height: 34px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--ink-2); font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.aim-tab.active { background: var(--paper); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
.aim-tab:disabled { opacity: 0.45; cursor: not-allowed; }
.aim-search { position: relative; margin-bottom: 10px; }
.aim-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-3); pointer-events: none; }
.aim-search-input { padding-left: 36px; }
.aim-category-filter { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 10px; }
.aim-filter-chip { display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); color: var(--ink-2); font-size: 12px; font-weight: 700; white-space: nowrap; }
.aim-filter-chip.active { color: var(--ac); border-color: color-mix(in oklab, var(--ac) 45%, var(--line)); background: color-mix(in oklab, var(--ac) 8%, var(--paper)); }
.aim-loading { min-height: 120px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--ink-3); }
.aim-category { position: sticky; top: 0; z-index: 1; padding: 9px 12px 6px; border-bottom: 1px solid var(--line); background: var(--bg-2); color: var(--ink-3); font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.aim-element { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--line); background: var(--paper); text-align: left; }
.aim-element:hover { background: color-mix(in oklab, var(--ac) 6%, var(--paper)); }
.aim-el-name { color: var(--ink); font-size: 14px; font-weight: 600; }
.aim-el-price { color: var(--ac); font-size: 13px; font-weight: 800; white-space: nowrap; }
.tc-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr); gap: 14px; }
.tc-list { max-height: 420px; overflow: auto; border: 1px solid var(--line); border-radius: var(--r-md); }
.tc-cart { display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px; background: var(--paper); }
.tc-cart-head { display: flex; justify-content: space-between; align-items: center; }
.tc-cart-head span { color: var(--ac); font-weight: 800; }
.tc-cart-list { display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow: auto; }
.tc-cart-row { display: grid; grid-template-columns: minmax(0, 1fr) 56px 56px 32px; gap: 6px; align-items: center; padding: 8px; background: var(--bg-2); border-radius: var(--r-sm); }
.tc-cart-row strong { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-cart-row span { display: block; color: var(--ink-3); font-size: 11px; }
.tc-qty, .tc-course { min-height: 32px; padding: 4px 6px; }
.tc-remove { width: 32px; height: 32px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--paper); color: var(--danger); }
.tc-empty { padding: 18px; text-align: center; color: var(--ink-3); border: 1px dashed var(--line); border-radius: var(--r-sm); }
.tc-free { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--line); }
.tc-actions { display: flex; justify-content: flex-end; gap: 10px; }
.tc-customer { display: flex; flex-direction: column; gap: 12px; }
.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.tc-err { color: var(--danger); }
@media (max-width: 860px) {
  .tc-grid { grid-template-columns: 1fr; }
  .form-row-2 { grid-template-columns: 1fr; }
}
</style>
