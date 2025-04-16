<script setup> //pagina in cui l'utente selezionera' le preferenze del suo sito-menu
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { ref, onMounted, nextTick, watch } from 'vue';
    import { useStore } from 'vuex';
    import { useRouter } from 'vue-router';
    import { colorCalculator } from '@/utils';
    import MenuViewComponent from '@/components/MenuViewComponent.vue';

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const router = useRouter();
    const tkn = store.getters.getToken;

    const id = ref('');
    const primary_color = ref('');
    const second_color = ref('');
    const backgroud = ref('');
    const details = ref('');
    const theme = ref('');
    const changed = ref(false);
    const userid = ref();

    //funzione che recuperare le informazioni delle preferenze dell'utente
    const fetchPrefs = async () => {
        try {
            const response = await fetch(`http://192.168.1.36:1337/api/users/me?populate=*`,{
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
                backgroud.value = data.fk_prefs.backgroud;
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
        try {
            const update = await fetch(`http://192.168.1.36:1337/api/users/${userid.value}`,{
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                },
                body: JSON.stringify({
                    data: {
                        //disconnect elemina la connessione con preference
                        fk_prefs:{
                            disconnect: { id: id.value },
                        }
                    },         
                })
            });            

            //fetch che elimina il record dal database
            if (update.ok){
                const del = await fetch(`http://192.168.1.36:1337/api/preferences/${id.value}`,{
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${tkn}`
                    }
                });
                
                //se a buon fine elimino dalla lista
                if (del.ok){
                    const response = await fetch(`http://192.168.1.36:1337/api/preferences`,{
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
                                background: backgroud.value,
                                details: details.value,
                            }
                        })
                    });
                    if(response.ok){
                        const data = await response.json();
                        const id_ = data.data;
                        const reconnect = await fetch(`http://192.168.1.36:1337/api/users/${userid.value}`,{
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
        }
    }

    //quando cambia theme (con il menu a tendina), si calcolano i colori con la funzione apposita creata in utils.js
    watch(theme, (newVal, oldVal) => {
        changed.value = true;
        colorCalculator( theme, primary_color, second_color, backgroud, details );
    })

    //impostazione del titolo della scheda e function per caricare i dati
    onMounted(async () => {
        await fetchPrefs();
        changed.value = false;
        nextTick(() => {
            document.title = 'Modifica il layout';
        });
    });

</script>

<template>
    <AppLayout>
        <!-- scelta del layout -->
        <section>
            <form @submit.prevent="submit" class="my-5 mx-5">
                <!-- v-model collegato alla variabile relativa alla categoria del prodotto -->
                <div class="form-group col-md-11">
                    <label for="inputCategory">Scegli il tema</label>
                    <select id="inputCategory" v-model="theme" class="form-control" required>
                        <option>Classico</option>
                        <option>Luxury</option>
                        <option>Street food</option>
                        <option>Minimal</option>
                        <option>Nature</option>
                        <option>Rustico</option>
                        <option>Pop</option>
                        <option>Classico scuro</option>
                        <option>Luxury scuro</option>
                        <option>Street food scuro</option>
                        <option>Minimal scuro</option>
                        <option>Nature scuro</option>
                        <option>Rustico scuro</option>
                        <option>Pop scuro</option>
                    </select>
                </div>

                <button v-if="changed" type="submit" class="btn btn-warning mt-5">registra elemento</button>
            </form>
        </section>

        <!-- preview del sito -->
        <section>
            <MenuViewComponent :primary="primary_color" :second="second_color" :backgroud="backgroud" :details="details"/>
        </section>
    </AppLayout>
</template>