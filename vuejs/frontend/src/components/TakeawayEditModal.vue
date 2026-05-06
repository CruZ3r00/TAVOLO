<script setup>
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { updateTakeaway, orderErrorMessage } from '@/utils';

const props = defineProps({
  show: { type: Boolean, default: false },
  order: { type: Object, default: null },
  token: { type: String, default: null },
});

const emit = defineEmits(['close', 'updated']);

const form = ref({ customer_name: '', customer_phone: '', customer_email: '', date: '', time: '' });
const saving = ref(false);
const errorMessage = ref('');
const fieldErrors = ref({});

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const splitPickup = (value) => {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return { date: todayISO(), time: '20:00' };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

watch(() => props.show, (v) => {
  if (!v || !props.order) return;
  const pickup = splitPickup(props.order.pickup_at);
  form.value = {
    customer_name: props.order.customer_name || '',
    customer_phone: props.order.customer_phone || '',
    customer_email: props.order.customer_email || '',
    date: pickup.date,
    time: pickup.time,
  };
  fieldErrors.value = {};
  errorMessage.value = '';
});

const minDate = computed(() => todayISO());
const emailRequired = computed(() => props.order?.takeaway_status === 'pending_acceptance');

const validate = () => {
  const errs = {};
  if (!form.value.customer_name.trim()) errs.customer_name = 'Inserisci il nome.';
  if (!form.value.customer_phone.trim()) errs.customer_phone = 'Inserisci il telefono.';
  if (emailRequired.value && !form.value.customer_email.trim()) {
    errs.customer_email = 'Inserisci l\'email per rispondere al cliente.';
  }
  if (form.value.customer_email && !/^\S+@\S+\.\S+$/.test(form.value.customer_email.trim())) {
    errs.customer_email = 'Email non valida.';
  }
  const dt = new Date(`${form.value.date}T${form.value.time || '00:00'}`);
  if (Number.isNaN(dt.getTime()) || dt.getTime() < Date.now()) {
    errs.time = 'Scegli un orario futuro.';
  }
  fieldErrors.value = errs;
  return Object.keys(errs).length === 0;
};

const submit = async () => {
  if (!props.order?.documentId || !props.token || !validate()) return;
  saving.value = true;
  errorMessage.value = '';
  try {
    const updated = await updateTakeaway(props.order.documentId, {
      customer_name: form.value.customer_name.trim(),
      customer_phone: form.value.customer_phone.trim(),
      customer_email: form.value.customer_email.trim() || undefined,
      date: form.value.date,
      time: form.value.time.length === 5 ? `${form.value.time}:00` : form.value.time,
    }, props.token);
    emit('updated', updated);
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
      <div class="te-title"><i class="bi bi-calendar2-event"></i><h2>Dati asporto</h2></div>
    </template>
    <template #body>
      <form class="te-form" @submit.prevent="submit" novalidate>
        <div v-if="errorMessage" class="ds-alert ds-alert-error">
          <i class="bi bi-exclamation-circle"></i><span>{{ errorMessage }}</span>
        </div>
        <div class="ds-field">
          <label class="ds-label" for="te-name">Nome cliente *</label>
          <input id="te-name" v-model="form.customer_name" class="ds-input" type="text" maxlength="120">
          <p v-if="fieldErrors.customer_name" class="ds-helper te-err">{{ fieldErrors.customer_name }}</p>
        </div>
        <div class="form-row-2">
          <div class="ds-field">
            <label class="ds-label" for="te-phone">Telefono *</label>
            <input id="te-phone" v-model="form.customer_phone" class="ds-input" type="tel" maxlength="32">
            <p v-if="fieldErrors.customer_phone" class="ds-helper te-err">{{ fieldErrors.customer_phone }}</p>
          </div>
          <div class="ds-field">
            <label class="ds-label" for="te-email">Email{{ emailRequired ? ' *' : '' }}</label>
            <input id="te-email" v-model="form.customer_email" class="ds-input" type="email">
            <p v-if="fieldErrors.customer_email" class="ds-helper te-err">{{ fieldErrors.customer_email }}</p>
          </div>
        </div>
        <div class="form-row-2">
          <div class="ds-field">
            <label class="ds-label" for="te-date">Data ritiro *</label>
            <input id="te-date" v-model="form.date" class="ds-input" type="date" :min="minDate">
          </div>
          <div class="ds-field">
            <label class="ds-label" for="te-time">Ora ritiro *</label>
            <input id="te-time" v-model="form.time" class="ds-input" type="time" step="300">
            <p v-if="fieldErrors.time" class="ds-helper te-err">{{ fieldErrors.time }}</p>
          </div>
        </div>
        <div class="te-actions">
          <button type="button" class="ds-btn ds-btn-ghost" :disabled="saving" @click="emit('close')">Annulla</button>
          <button type="submit" class="ds-btn ds-btn-primary" :disabled="saving">
            <span v-if="saving" class="spin-icon"></span>
            <i v-else class="bi bi-check2"></i><span>Salva</span>
          </button>
        </div>
      </form>
    </template>
  </Modal>
</template>

<style scoped>
.te-title { display: flex; align-items: center; gap: 10px; }
.te-title h2 { margin: 0; font-size: 16px; font-weight: 700; }
.te-title i { color: var(--ac); }
.te-form { display: flex; flex-direction: column; gap: 12px; }
.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.te-err { color: var(--danger); }
.te-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 6px; }
@media (max-width: 640px) {
  .form-row-2 { grid-template-columns: 1fr; }
}
</style>
