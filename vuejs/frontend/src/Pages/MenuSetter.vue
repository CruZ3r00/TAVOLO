<script setup> //Pagina in cui l'utente aggiunge gli elementi al menu, da aggiungere selezione per cambiare tra l'inserimento di un nuovo elemento, la modifica di uno (o un gruppo) di elementi o la rimozione/segnare come esaurito un ingrediente.
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

    const viewAdder = ref(false);
    const viewList = ref(false);
    const siteID = ref();



    //funzione che verifica lo stato dell'abbonamento dell'utente loggato
    const verifyPayment = async () => {
        try {
            const response = await fetch('http://localhost:1337/api/users/me',{
                method: "GET",
                headers: {
                    "Authorization" : `Bearer ${tkn}`,
                    "Content-Type" : "application/json",
                },
            });
            if(response.ok){ //momentaneamente && 0 per returnare sempre true
                const data = await response.json();
                if( data.payment_method == null && 0) router.push('/add-payment');
                else if ( new Date(data.end_subscription) < new Date() && 0 ) router.push('/renew-sub');
                else return true; 
            }
        } catch (error) {
            console.log(error);
        }
    };

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

    const handleAdder = () => {
        viewList.value = false;
        viewAdder.value = true;
    }
    const handleList = () => {
        viewList.value = true;
        viewAdder.value = false;
    }

    onMounted(async () => {
        nextTick(() => {
            document.title = 'Il tuo menù';
        });
        await verifyPayment();
        await FetchSite();
        viewList.value = true;
    });
</script>



<template>
    <AppLayout>
        <MenuAdder v-if="viewAdder" :siteid="siteID" @ViewList="handleList"/>
        <MenuList v-if="viewList" :siteid="siteID" @AddElement="handleAdder"/>
    </AppLayout>
</template>