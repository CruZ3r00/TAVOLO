<script setup>
    import { onMounted, ref, nextTick } from 'vue';
    import { useStore } from 'vuex';
    import QRCode from 'qrcode';

    const isLoading = ref(false);

    const store = useStore();
    const URL = store.getters.getUser.url;
    const qr = ref('');
    const genQR = async () =>{
        isLoading.value = true;
        try {
            await nextTick() 
            qr.value = await QRCode.toDataURL(URL, {
                scale: 6,
                margin: 2,
                errorCorrectionLevel: 'H',
            })
            console.log(qr.value);
        } catch (error) {
            console.log(error);
        }
        isLoading.value = false;
    }
</script>

<template>
        <div class="container border bg-light p-4">
            <h1 class="display-6 fw-bold text-body pb-3 mt-3">
                Genera il QR Code che reindirizza al <span style="text-decoration: underline; text-decoration-color: blue">tuo sito.</span>
            </h1>
            
            <button 
                class="btn btn-primary" 
                :disabled="isLoading"
                @click="genQR"
            >
                <span v-if="isLoading" class="loader"></span>
                <span v-else>Genera qr</span>
            </button>

            <img v-if="qr" :src="qr" alt="QR Code generato" />            

        </div>
    
</template>