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
  padding: var(--space-10) 0 var(--space-16);
}
.prefs-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 var(--space-6);
}
.prefs-title {
  font-size: var(--text-3xl);
  font-weight: 800;
  color: var(--color-text);
  margin: var(--space-2) 0;
  letter-spacing: var(--tracking-tight);
}
.prefs-subtitle {
  font-size: var(--text-md);
  color: var(--color-text-muted);
  margin: 0 0 var(--space-8) 0;
  line-height: var(--leading-relaxed);
}
.prefs-card {
  margin-bottom: var(--space-10);
}
.prefs-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.prefs-colors {
  display: flex;
  gap: var(--space-3);
}
.prefs-color-swatch {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}
.prefs-preview {
  margin-top: var(--space-6);
}
.prefs-preview-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 var(--space-4) 0;
}
.prefs-preview-frame {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
</style>
