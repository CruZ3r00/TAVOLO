<script setup>
    import { onMounted, ref, nextTick, watch } from 'vue';
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { useStore } from 'vuex';
    import { useRouter, useRoute } from 'vue-router';
    import { API_BASE } from '@/utils';
    import MenuAdder from '@/components/MenuAdder.vue';
    import MenuList from '@/components/MenuList.vue'

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const router = useRouter();
    const route = useRoute();
    const tkn = store.getters.getToken;

    //variabili utilizzate per la gestione della pagina
    const viewAdder = ref(false);
    const viewList = ref(false);

    //funzione che verifica lo stato dell'abbonamento dell'utente loggato
    const verifyPayment = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/users/me`,{
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
            console.error(error);
        }
    };

    //inverto le variabili per invertire cosa visualizzare
    const handleAdder = () => {
        viewList.value = false;
        viewAdder.value = true;
    }
    const handleList = () => {
        viewList.value = true;
        viewAdder.value = false;
    }

    // Quando si clicca il link "Menu" dalla navbar e si è già su /menu-handler,
    // Vue Router non re-renderizza. Questo watch resetta la vista alla lista.
    watch(() => route.fullPath, () => {
        if (route.path === '/menu-handler') {
            handleList();
        }
    });

    onMounted(async () => {
        nextTick(() => {
            document.title = 'Gestione Menu';
        });
        await verifyPayment();
        viewList.value = true;
    });
</script>

<template>
    <AppLayout>
        <MenuAdder v-if="viewAdder" @ViewList="handleList"/>
        <MenuList v-if="viewList" @AddElement="handleAdder"/>
    </AppLayout>
</template>
