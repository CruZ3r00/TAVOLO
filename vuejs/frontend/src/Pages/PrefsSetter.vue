<script setup>
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { ref, onMounted, nextTick, watch } from 'vue';
    import { useStore } from 'vuex';
    import { colorCalculator } from '@/utils';
    import MenuViewComponent from '@/components/MenuViewComponent.vue';

    const store = useStore();
    const tkn = store.getters.getToken;

    const id = ref('');
    const primary_color = ref('');
    const second_color = ref('');
    const background = ref('');
    const details = ref('');
    const theme = ref('');
    const changed = ref(false);
    const userid = ref();
    const saving = ref(false);

    const fetchPrefs = async () => {
        try {
            const response = await fetch(`http://localhost:1337/api/users/me?populate=*`,{
                method: "GET",
                headers: {
                    "Authorization" : `Bearer ${tkn}`,
                    "Content-Type" : "application/json",
                },
            });

            if(response.ok){
                const data = await response.json();
                primary_color.value = data.fk_prefs.primary_color;
                second_color.value = data.fk_prefs.second_color;
                background.value = data.fk_prefs.background;
                details.value = data.fk_prefs.details;
                theme.value = data.fk_prefs.theme;
                id.value = data.fk_prefs.documentId;
                userid.value = data.id;
            }
        } catch (error) {
            console.error(error);
        }
    };

    const submit = async () => {
        saving.value = true;
        try {
            const update = await fetch(`http://localhost:1337/api/users/${userid.value}`,{
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`,
                },
                body: JSON.stringify({
                    data: {
                        fk_prefs:{
                            disconnect: { id: id.value },
                        }
                    },
                })
            });

            if (update.ok){
                const del = await fetch(`http://localhost:1337/api/preferences/${id.value}`,{
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${tkn}`
                    }
                });

                if (del.ok){
                    const response = await fetch(`http://localhost:1337/api/preferences`,{
                        method: "POST",
                        headers: {
                            "Authorization" : `Bearer ${tkn}`,
                            "Content-Type" : "application/json",
                        },
                        body: JSON.stringify({
                            data:{
                                primary_color: primary_color.value,
                                second_color: second_color.value,
                                theme: theme.value,
                                background: background.value,
                                details: details.value,
                            }
                        })
                    });
                    if(response.ok){
                        const data = await response.json();
                        const id_ = data.data;
                        const reconnect = await fetch(`http://localhost:1337/api/users/${userid.value}`,{
                            method: 'PUT',
                            headers:{
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${tkn}`,
                            },
                            body: JSON.stringify({
                                fk_prefs:{
                                    connect:
                                        {id: id_.id-1}
                                },
                            }),
                        });
                        if(reconnect.ok){
                            await fetchPrefs();
                            changed.value = false;
                        }
                    }
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            saving.value = false;
        }
    }

    watch(theme, (newVal, oldVal) => {
        changed.value = true;
        colorCalculator( theme, primary_color, second_color, background, details );
    })

    onMounted(async () => {
        await fetchPrefs();
        changed.value = false;
        nextTick(() => {
            document.title = 'Modifica il layout';
        });
    });

    const themes = [
        'Classico', 'Luxury', 'Street food', 'Minimal', 'Nature', 'Rustico', 'Pop',
        'Classico scuro', 'Luxury scuro', 'Street food scuro', 'Minimal scuro',
        'Nature scuro', 'Rustico scuro', 'Pop scuro',
    ];
</script>

<template>
    <AppLayout>
        <div class="prefs-page">
            <div class="prefs-container">
                <p class="text-overline">Personalizzazione</p>
                <h1 class="prefs-title">Modifica il layout</h1>
                <p class="prefs-subtitle">Scegli il tema del tuo sito menu e visualizza l'anteprima in tempo reale.</p>

                <div class="ds-card prefs-card">
                    <div class="ds-card-body">
                        <form @submit.prevent="submit" class="prefs-form">
                            <div class="ds-field">
                                <label for="inputCategory" class="ds-label">Scegli il tema</label>
                                <select id="inputCategory" v-model="theme" class="ds-select" required>
                                    <option v-for="t in themes" :key="t" :value="t">{{ t }}</option>
                                </select>
                            </div>

                            <div v-if="theme" class="prefs-colors">
                                <div class="prefs-color-swatch" :style="{ background: primary_color }" title="Primario"></div>
                                <div class="prefs-color-swatch" :style="{ background: second_color }" title="Secondario"></div>
                                <div class="prefs-color-swatch" :style="{ background: background }" title="Sfondo"></div>
                                <div class="prefs-color-swatch" :style="{ background: details }" title="Dettagli"></div>
                            </div>

                            <Transition name="fade">
                                <button v-if="changed" type="submit" class="ds-btn ds-btn-primary" :disabled="saving">
                                    <span v-if="saving" class="ds-spinner"></span>
                                    <span v-else><i class="bi bi-check-lg"></i> Salva preferenze</span>
                                </button>
                            </Transition>
                        </form>
                    </div>
                </div>

                <div class="prefs-preview">
                    <h2 class="prefs-preview-title">Anteprima</h2>
                    <div class="prefs-preview-frame">
                        <MenuViewComponent :primary="primary_color" :second="second_color" :background="background" :details="details"/>
                    </div>
                </div>
            </div>
        </div>
    </AppLayout>
</template>

<style scoped>
.prefs-page {
    padding: var(--s-8) 0 var(--s-9);
    background: var(--bg);
    min-height: calc(100vh - 64px);
    font-family: var(--f-sans, 'Geist', sans-serif);
}
.prefs-container {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 var(--s-6);
}
.text-overline {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-3);
    margin: 0 0 6px;
}
.prefs-title {
    font-size: clamp(26px, 3.5vw, 34px);
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-2) 0;
    letter-spacing: -0.03em;
    line-height: 1.1;
}
.prefs-subtitle {
    font-size: 15px;
    color: var(--ink-3);
    margin: 0 0 var(--s-7) 0;
    line-height: 1.55;
}
.prefs-card {
    margin-bottom: var(--s-7);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
}
.prefs-card :deep(.ds-card-body) {
    padding: var(--s-5);
}
.prefs-form {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
}
.prefs-form :deep(.ds-label) {
    font-family: var(--f-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    margin-bottom: 6px;
    display: block;
}
.prefs-form :deep(.ds-select) {
    width: 100%;
    padding: 10px 12px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    color: var(--ink);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    transition: border-color 120ms, box-shadow 120ms;
}
.prefs-form :deep(.ds-select:focus) {
    outline: none;
    border-color: var(--ac);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--ac) 18%, transparent);
}
.prefs-colors {
    display: flex;
    gap: var(--s-3);
}
.prefs-color-swatch {
    width: 40px;
    height: 40px;
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
}
.prefs-form :deep(.ds-btn-primary) {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    font-family: var(--f-sans, 'Geist', sans-serif);
    font-size: 14px;
    font-weight: 600;
    color: var(--paper);
    background: var(--ink);
    border: 1px solid var(--ink);
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background 120ms, transform 120ms;
}
.prefs-form :deep(.ds-btn-primary:hover) {
    background: color-mix(in oklab, var(--ink) 90%, var(--ac));
    transform: translateY(-1px);
}
.prefs-form :deep(.ds-btn-primary:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}
.prefs-preview {
    margin-top: var(--s-6);
}
.prefs-preview-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 var(--s-3) 0;
    letter-spacing: -0.01em;
}
.prefs-preview-frame {
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    overflow: hidden;
    background: var(--paper);
}
.fade-enter-active, .fade-leave-active { transition: opacity 180ms, transform 180ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 640px) {
    .prefs-container { padding: 0 var(--s-4); }
}
</style>
