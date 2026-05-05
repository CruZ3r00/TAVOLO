<script setup>
import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { fetchStaffSettings, updateStaffSetting } from '@/utils';

const store = useStore();
const token = computed(() => store.getters.getToken);

const departments = ref([]);
const loading = ref(true);
const savingRole = ref(null);
const errorMessage = ref('');
const successMessage = ref('');
const hasPendingBackend = computed(() => departments.value.some((department) => department.pending_backend));

const roleIcon = (role) => {
    switch (role) {
        case 'cameriere': return 'bi-grid-3x3-gap';
        case 'cucina': return 'bi-fire';
        case 'bar': return 'bi-cup-straw';
        case 'pizzeria': return 'bi-record-circle';
        case 'cucina_sg': return 'bi-shield-check';
        default: return 'bi-person-badge';
    }
};

const loadDepartments = async () => {
    if (!token.value) return;
    loading.value = true;
    errorMessage.value = '';
    try {
        departments.value = await fetchStaffSettings(token.value);
    } catch (err) {
        errorMessage.value = err?.message || 'Impossibile caricare i reparti.';
    } finally {
        loading.value = false;
    }
};

const toggleDepartment = async (department) => {
    if (!department || savingRole.value || !department.plan_allowed) return;
    const nextActive = !department.active;
    savingRole.value = department.role;
    errorMessage.value = '';
    successMessage.value = '';
    try {
        departments.value = await updateStaffSetting(department.role, nextActive, token.value);
        successMessage.value = nextActive ? `${department.label} attivato.` : `${department.label} disattivato.`;
        setTimeout(() => { successMessage.value = ''; }, 3500);
    } catch (err) {
        errorMessage.value = err?.message || 'Aggiornamento reparto non riuscito.';
    } finally {
        savingRole.value = null;
    }
};

onMounted(loadDepartments);
</script>

<template>
    <div class="profile-section">
        <div class="section-header">
            <div class="section-icon"><i class="bi bi-people"></i></div>
            <div>
                <h3 class="section-title">Reparti staff</h3>
                <p class="section-description">Scegli quali account operativi possono accedere al ristorante.</p>
            </div>
        </div>

        <div class="section-body">
            <Transition name="fade">
                <div v-if="errorMessage" class="ds-alert ds-alert-error">
                    <i class="bi bi-exclamation-circle"></i>
                    <span>{{ errorMessage }}</span>
                </div>
            </Transition>
            <Transition name="fade">
                <div v-if="successMessage" class="ds-alert ds-alert-success">
                    <i class="bi bi-check-circle"></i>
                    <span>{{ successMessage }}</span>
                </div>
            </Transition>

            <div v-if="loading" class="staff-loading">
                <span class="ds-spinner" aria-hidden="true"></span>
                <span>Caricamento reparti...</span>
            </div>

            <div v-else class="staff-grid">
                <div v-if="hasPendingBackend" class="staff-inline-note">
                    Configurazione reparti in sincronizzazione. Riprova tra qualche istante se un salvataggio non viene confermato.
                </div>
                <button
                    v-for="department in departments"
                    :key="department.role"
                    type="button"
                    class="staff-card"
                    :class="{ active: department.active && department.plan_allowed, disabled: !department.plan_allowed }"
                    :disabled="savingRole === department.role || !department.plan_allowed"
                    @click="toggleDepartment(department)"
                >
                    <span class="staff-card-icon">
                        <i :class="['bi', roleIcon(department.role)]"></i>
                    </span>
                    <span class="staff-card-main">
                        <strong>{{ department.label }}</strong>
                        <em>{{ department.username || 'Account in preparazione' }}</em>
                    </span>
                    <span class="staff-toggle" :class="{ on: department.active && department.plan_allowed }">
                        <span v-if="savingRole === department.role" class="ds-spinner"></span>
                        <i v-else-if="department.active && department.plan_allowed" class="bi bi-check2"></i>
                    </span>
                    <span v-if="!department.plan_allowed" class="staff-plan-note">Richiede Professionale</span>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.profile-section {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    font-family: var(--f-sans, 'Geist', sans-serif);
    overflow: hidden;
}
.section-header {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-5);
    border-bottom: 1px solid var(--line);
}
.section-icon {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    background: color-mix(in oklab, var(--ac) 10%, var(--paper));
    color: var(--ac);
    border-radius: var(--r-sm);
    font-size: 16px;
    flex-shrink: 0;
}
.section-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 2px;
}
.section-description {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.5;
}
.section-body {
    padding: var(--s-5);
}
.staff-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--ink-3);
    font-size: 14px;
}
.staff-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 12px;
}
.staff-inline-note {
    grid-column: 1 / -1;
    padding: 10px 12px;
    border: 1px solid color-mix(in oklab, var(--warn) 25%, var(--line));
    border-radius: var(--r-md);
    background: color-mix(in oklab, var(--warn) 8%, var(--paper));
    color: var(--ink-2);
    font-size: 13px;
    line-height: 1.45;
}
.staff-card {
    position: relative;
    min-height: 86px;
    display: grid;
    grid-template-columns: 38px 1fr 42px;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--bg);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: border-color 140ms, background 140ms, transform 140ms;
}
.staff-card:hover:not(:disabled) {
    border-color: color-mix(in oklab, var(--ac) 45%, var(--line));
    transform: translateY(-1px);
}
.staff-card.active {
    background: color-mix(in oklab, var(--ok) 8%, var(--bg));
    border-color: color-mix(in oklab, var(--ok) 35%, var(--line));
}
.staff-card.disabled {
    opacity: 0.68;
    cursor: not-allowed;
}
.staff-card-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: var(--r-sm);
    background: var(--paper);
    color: var(--ac);
    font-size: 17px;
}
.staff-card-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.staff-card-main strong {
    font-size: 14px;
    font-weight: 700;
}
.staff-card-main em {
    color: var(--ink-3);
    font-size: 12px;
    font-style: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.staff-toggle {
    width: 38px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--bg-sunk, var(--bg-2));
    color: var(--paper);
    justify-self: end;
}
.staff-toggle.on {
    background: var(--ok);
}
.staff-plan-note {
    grid-column: 2 / 4;
    color: var(--warn);
    font-size: 12px;
    font-weight: 600;
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
