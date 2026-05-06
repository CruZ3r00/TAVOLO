<script setup>
import { computed, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import { fetchStaffSettings, updateCategoryRouting, updateStaffSetting } from '@/utils';

const props = defineProps({
    /**
     * 'all'        — toggle reparti + smistamento categorie (default)
     * 'staff'      — solo toggle reparti (Staff attivi)
     * 'routing'    — solo smistamento categorie (Reparti)
     */
    mode: { type: String, default: 'all' },
});

const showToggles = computed(() => props.mode === 'all' || props.mode === 'staff');
const showRouting = computed(() => props.mode === 'all' || props.mode === 'routing');
const sectionTitle = computed(() => {
    if (props.mode === 'staff') return 'Profili staff attivi';
    if (props.mode === 'routing') return 'Smistamento categorie ai reparti';
    return 'Reparti staff';
});
const sectionDescription = computed(() => {
    if (props.mode === 'staff') return 'Scegli quali account operativi possono accedere al gestionale. Ogni reparto ha la sua coda di lavoro.';
    if (props.mode === 'routing') return 'Scegli dove indirizzare ogni categoria del menu. Ogni reparto vede solo le proprie code.';
    return 'Scegli quali account operativi possono accedere al ristorante e dove inviare le categorie.';
});
const sectionIcon = computed(() => {
    if (props.mode === 'routing') return 'bi-diagram-3';
    return 'bi-people';
});

const store = useStore();
const token = computed(() => store.getters.getToken);

const routableRoles = new Set(['cucina', 'bar', 'pizzeria', 'cucina_sg']);
const departments = ref([]);
const loading = ref(true);
const savingRole = ref(null);
const savingCategory = ref(null);
const errorMessage = ref('');
const successMessage = ref('');
const hasPendingBackend = computed(() => departments.value.some((department) => department.pending_backend));
const routingAllowed = computed(() => departments.value.some((department) => department.routing_allowed));
const routableDepartments = computed(() => departments.value.filter((department) => routableRoles.has(department.role)));
const departmentCategories = (department) => (
    Array.isArray(department?.categories) ? department.categories : []
);
const categoryTotal = computed(() => departments.value.reduce((total, department) => (
    total + departmentCategories(department).length
), 0));
const routingBlockedReason = computed(() => (
    departments.value.find((department) => department.routing_blocked_reason)?.routing_blocked_reason || ''
));
const subscriptionPlan = computed(() => (
    departments.value.find((department) => department.subscription_plan)?.subscription_plan || ''
));
const subscriptionPlanLabel = computed(() => {
    if (subscriptionPlan.value === 'pro') return 'Professionale';
    if (subscriptionPlan.value === 'starter') return 'Essenziale';
    return subscriptionPlan.value || 'non attivo';
});
const routingNotice = computed(() => {
    if (hasPendingBackend.value) {
        return 'Configurazione reparti in sincronizzazione. Riprova tra qualche istante se un salvataggio non viene confermato.';
    }
    if (categoryTotal.value === 0) {
        return 'Nessuna categoria trovata nel menu. Aggiungi elementi con categoria per abilitarne lo smistamento.';
    }
    if (!routingAllowed.value) {
        if (routingBlockedReason.value === 'subscription_required') {
            return 'Le categorie sono presenti, ma la modifica delle assegnazioni richiede un abbonamento attivo al piano Professionale.';
        }
        return `Le categorie sono presenti, ma la modifica delle assegnazioni richiede il piano Professionale. Piano rilevato: ${subscriptionPlanLabel.value}. Con il piano Essenziale tutte le portate arrivano in Cucina.`;
    }
    return '';
});

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

const roleLabel = (role) => (
    routableDepartments.value.find((department) => department.role === role)?.label || role
);

const categoryRole = (category, fallbackRole) => (
    routableRoles.has(category?.staff_role) ? category.staff_role : fallbackRole
);

const categorySelectDisabled = (category) => (
    !routingAllowed.value || savingCategory.value === category?.category
);

const categorySelectTitle = (category) => {
    if (savingCategory.value === category?.category) return 'Salvataggio in corso...';
    if (!routingAllowed.value) return 'Richiede il piano Professionale.';
    return 'Sposta questa categoria in un altro reparto.';
};

const loadDepartments = async () => {
    loading.value = true;
    errorMessage.value = '';
    if (!token.value) {
        departments.value = [];
        errorMessage.value = 'Sessione non valida. Accedi di nuovo.';
        loading.value = false;
        return;
    }
    try {
        departments.value = await fetchStaffSettings(token.value);
    } catch (err) {
        errorMessage.value = err?.message || 'Impossibile caricare i reparti.';
    } finally {
        loading.value = false;
    }
};

const toggleDepartment = async (department) => {
    if (!department || savingRole.value || !department.can_toggle) return;
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

const moveCategory = async (category, role, currentRole) => {
    if (!routingAllowed.value || savingCategory.value || !category || !role) return;
    if (role === currentRole) return;
    savingCategory.value = category;
    errorMessage.value = '';
    successMessage.value = '';
    try {
        departments.value = await updateCategoryRouting(category, role, token.value);
        successMessage.value = `Categoria "${category}" assegnata a ${roleLabel(role)}.`;
        setTimeout(() => { successMessage.value = ''; }, 3500);
    } catch (err) {
        errorMessage.value = err?.message || 'Assegnazione categoria non riuscita.';
    } finally {
        savingCategory.value = null;
    }
};

onMounted(loadDepartments);
</script>

<template>
    <div class="profile-section">
        <div class="section-header">
            <div class="section-icon"><i :class="['bi', sectionIcon]"></i></div>
            <div>
                <h3 class="section-title">{{ sectionTitle }}</h3>
                <p class="section-description">{{ sectionDescription }}</p>
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

            <!-- Mode 'routing' on plans without routing rights → upsell -->
            <div
                v-else-if="mode === 'routing' && !routingAllowed && categoryTotal > 0"
                class="ct-locked-panel"
            >
                <div class="ct-locked-panel__ico">
                    <i class="bi bi-lock-fill"></i>
                </div>
                <h4>Disponibile con il piano Professionale</h4>
                <p>
                    Con l'Essenziale tutte le categorie arrivano in Cucina. Passa al
                    Professionale per smistare bar, pizzeria e cucina senza glutine in
                    code separate.
                </p>
                <router-link to="/profile/show?section=abbonamento" class="btn btn-accent">
                    Scopri il Professionale <i class="bi bi-arrow-right"></i>
                </router-link>
            </div>

            <template v-else>
                <!-- ============ STAFF TOGGLE GRID (mode 'all' o 'staff') ============ -->
                <div v-if="showToggles" class="ct-staff-grid ct-stagger">
                    <button
                        v-for="department in departments"
                        :key="`tog-${department.role}`"
                        type="button"
                        class="ct-staff-item"
                        :class="{
                            'is-active': department.active && department.plan_allowed,
                            'is-locked': !department.can_toggle,
                        }"
                        :disabled="savingRole === department.role || !department.can_toggle"
                        :aria-label="department.can_toggle ? `${department.active ? 'Disattiva' : 'Attiva'} ${department.label}` : `${department.label} bloccato`"
                        @click="toggleDepartment(department)"
                    >
                        <span class="ct-staff-item__ico">
                            <i :class="['bi', roleIcon(department.role)]"></i>
                        </span>
                        <span class="ct-staff-item__main">
                            <strong>{{ department.label }}</strong>
                            <em>{{ department.username || 'Account in preparazione' }}</em>
                            <span class="ct-staff-item__chips">
                                <span v-if="department.role === 'cameriere'" class="chip">Sempre attivo</span>
                                <span v-else-if="!department.plan_allowed" class="chip warn">Richiede PRO</span>
                            </span>
                        </span>
                        <span class="ct-staff-item__toggle" aria-hidden="true">
                            <span v-if="savingRole === department.role" class="ds-spinner" style="position:absolute;top:3px;left:10px;"></span>
                        </span>
                    </button>
                </div>

                <!-- ============ CATEGORY ROUTING (mode 'all' o 'routing') ============ -->
                <div v-if="showRouting" :class="['routing-wrap', { 'has-toggles': showToggles }]">
                    <div
                        v-if="routingNotice"
                        class="staff-inline-note"
                        :class="{ 'staff-inline-note--locked': categoryTotal > 0 && !routingAllowed }"
                    >
                        {{ routingNotice }}
                    </div>

                    <div class="ct-routing-grid ct-stagger" v-if="routableDepartments.length > 0">
                        <div
                            v-for="department in routableDepartments"
                            :key="`rt-${department.role}`"
                            class="ct-routing-col"
                        >
                            <div class="ct-routing-col__head">
                                <span class="ct-routing-col__ico">
                                    <i :class="['bi', roleIcon(department.role)]"></i>
                                </span>
                                <span class="ct-routing-col__title">{{ department.label }}</span>
                                <span class="ct-routing-col__count">
                                    {{ departmentCategories(department).length }} categorie
                                </span>
                            </div>
                            <div v-if="departmentCategories(department).length === 0" class="staff-empty-categories">
                                Nessuna categoria assegnata.
                            </div>
                            <div
                                v-for="category in departmentCategories(department)"
                                :key="`row-${department.role}-${category.category}`"
                                class="ct-routing-row"
                            >
                                <span>
                                    <strong>{{ category.category }}</strong>
                                    <em>{{ category.item_count }} elementi</em>
                                </span>
                                <select
                                    class="ds-input"
                                    :value="categoryRole(category, department.role)"
                                    :disabled="categorySelectDisabled(category)"
                                    :title="categorySelectTitle(category)"
                                    @change="moveCategory(category.category, $event.target.value, categoryRole(category, department.role))"
                                >
                                    <option
                                        v-for="target in routableDepartments"
                                        :key="target.role"
                                        :value="target.role"
                                    >
                                        {{ target.label }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
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
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
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
.staff-inline-note--locked {
    border-color: color-mix(in oklab, var(--ac) 22%, var(--line));
    background: color-mix(in oklab, var(--ac) 7%, var(--paper));
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
    transition: border-color 140ms, background 140ms, transform 140ms;
}
.staff-card:hover:not(.disabled) {
    border-color: color-mix(in oklab, var(--ac) 45%, var(--line));
    transform: translateY(-1px);
}
.staff-card.active {
    background: color-mix(in oklab, var(--ok) 8%, var(--bg));
    border-color: color-mix(in oklab, var(--ok) 35%, var(--line));
}
.staff-card.disabled {
    opacity: 0.68;
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
    border: 0;
    border-radius: 999px;
    background: var(--bg-sunk, var(--bg-2));
    color: var(--paper);
    justify-self: end;
    cursor: pointer;
}
.staff-toggle.on {
    background: var(--ok);
}
.staff-toggle.locked,
.staff-toggle:disabled {
    cursor: not-allowed;
    background: color-mix(in oklab, var(--ink-3) 26%, var(--line));
}
.staff-plan-note {
    grid-column: 2 / 4;
    color: var(--warn);
    font-size: 12px;
    font-weight: 600;
}
.staff-categories {
    grid-column: 1 / -1;
    border-top: 1px dashed var(--line);
    margin-top: 2px;
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.staff-categories-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--ink-3);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
.staff-categories-head small {
    font-family: var(--f-mono);
    font-size: 11px;
}
.staff-empty-categories {
    color: var(--ink-3);
    font-size: 12.5px;
}
.staff-category-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(120px, 150px);
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--paper);
}
.staff-category-row strong {
    display: block;
    font-size: 13px;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.staff-category-row em {
    display: block;
    margin-top: 2px;
    color: var(--ink-3);
    font-size: 11.5px;
    font-style: normal;
}
.staff-category-select {
    width: 100%;
    min-height: 34px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    font-size: 12.5px;
    padding: 0 8px;
}
.staff-category-select:disabled {
    color: var(--ink-3);
    cursor: not-allowed;
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 620px) {
    .staff-category-row {
        grid-template-columns: 1fr;
    }
}

.routing-wrap.has-toggles {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px dashed var(--line);
}
</style>
