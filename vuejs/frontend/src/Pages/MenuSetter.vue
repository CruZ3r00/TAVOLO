<script setup>
    import { onMounted } from 'vue';
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { useStore } from 'vuex';
    import { useRouter } from 'vue-router';
    const store = useStore();
    const router = useRouter();

    const verifyPayment = async () => {
        const tkn = store.getters.getToken;
        try {
            const response = await fetch('http://localhost:1337/api/user/me',{
                method: "GET",
                headers: {
                    "Authorization" : `Bearer ${tkn}`,
                    "Content-Type" : "application/json",
                },
                body : {},
            });
            if(response.ok){
                const data = await response.json().data;
                if( data.payment_method == null && 0) router.push('/add-payment');
                else if ( new Date(data.end_subscription) < new Date() && 0 ) router.push('/renew-sub');
                else return true; 
            }
        } catch (error) {
            console.log(error);
        }
    };

    onMounted(() => {
        verifyPayment();
    });
</script>

<template>
    <AppLayout>

    </AppLayout>
</template>