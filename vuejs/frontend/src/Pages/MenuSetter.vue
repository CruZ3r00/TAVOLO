<script setup> //Pagina in cui l'utente aggiunge gli elementi al menu o li visualizza e modifica
    import { onMounted, ref, nextTick } from 'vue';
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { useStore } from 'vuex';
    import { useRouter } from 'vue-router';
    import MenuAdder from '@/components/MenuAdder.vue';
    import MenuList from '@/components/MenuList.vue'

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const router = useRouter();
    const tkn = store.getters.getToken;

    //variabili utilizzate per la gestione della pagina
    const viewAdder = ref(false);
    const viewList = ref(false);

    //variabili utilizzate nelle fetch
    const siteID = ref();

    //funzione che verifica lo stato dell'abbonamento dell'utente loggato al momento && 0 per non gestire al momento gli abbonamenti in modo automatico
    const verifyPayment = async () => {
        try {
            const response = await fetch('http://localhost:1337/api/users/me',{
                method: "GET",
                headers: {
                    "Authorization" : `Bearer ${tkn}`,
                    "Content-Type" : "application/json",
                },
            });

            if(response.ok){ 
                const data = await response.json();
                if( data.payment_method == null && 0) router.push('/add-payment');
                else if ( new Date(data.end_subscription) < new Date() && 0 ) router.push('/renew-sub');
                else return true; 
            }
        } catch (error) {
            console.log(error);
        }
    };

    //function che recupera le info del sito collegate all'utente loggato 'users/me'
    const FetchSite = async () => {
        try{
            const response = await fetch(`http://localhost:1337/api/users/me?populate=fk_site`,{
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                },
            });

            if (response.ok){
                const data = await response.json();
                siteID.value = data.fk_site;
            }

        }catch( error ){
            console.log(error);
        }
    };

    //inverto le variabili per invertire cosa visualizzare, in entrambi
    const handleAdder = () => {
        viewList.value = false;
        viewAdder.value = true;
    }
    const handleList = () => {
        viewList.value = true;
        viewAdder.value = false;
    }


    //al mounting della pagina del dom verifico il pagamento (simulazione al momento) e recupero le info del sito
    onMounted(async () => {
        nextTick(() => {
            document.title = 'Il tuo menù';
        });
        await verifyPayment();
        await FetchSite();
        viewList.value = true; //di default visualizzazione della lista degli elementi
    });
</script>

<template>
    <AppLayout>
        <MenuAdder v-if="viewAdder" :siteid="siteID" @ViewList="handleList"/>
        <MenuList v-if="viewList" :siteid="siteID" @AddElement="handleAdder"/>
    </AppLayout>
</template>