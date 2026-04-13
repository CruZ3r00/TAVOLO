<script setup>
    import { onMounted, ref, nextTick } from 'vue';
    import QRCode from 'qrcode';

    const props = defineProps({
        siteUrl: {
            type: String,
            default: '',
        },
    });

    const isLoading = ref(false);

    const qr = ref('');
    const genQR = async () =>{
        if (!props.siteUrl) {
            console.error('Nessun URL del sito configurato per generare il QR code.');
            return;
        }
        isLoading.value = true;
        try {
            await nextTick()
            qr.value = await QRCode.toDataURL(props.siteUrl, {
                scale: 6,
                margin: 2,
                errorCorrectionLevel: 'H',
            })
        } catch (error) {
            console.error(error);
        }
        isLoading.value = false;
    }
</script>

<template>
    <div class="qr-generator">
        <div class="qr-header">
            <h3 class="qr-title">Genera QR Code</h3>
            <p class="qr-description">Crea un QR code che reindirizza al tuo sito menu.</p>
        </div>

        <button
            class="ds-btn ds-btn-primary"
            :disabled="isLoading || !siteUrl"
            @click="genQR"
        >
            <span v-if="isLoading" class="ds-spinner"></span>
            <template v-else>
                <i class="bi bi-qr-code"></i>
                <span>Genera QR</span>
            </template>
        </button>

        <Transition name="scale">
            <div v-if="qr" class="qr-result">
                <img :src="qr" alt="QR Code generato" class="qr-image" />
                <a :href="qr" download="qr-code-menu.png" class="ds-btn ds-btn-secondary ds-btn-sm qr-download-btn">
                    <i class="bi bi-download"></i>
                    <span>Scarica QR</span>
                </a>
            </div>
        </Transition>

        <p v-if="!siteUrl" class="qr-warning">
            <i class="bi bi-info-circle"></i>
            Configura prima l'URL del tuo sito per generare il QR code.
        </p>
    </div>
</template>

<style scoped>
.qr-generator {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.qr-title {
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--color-text);
    margin: 0 0 var(--space-1) 0;
}

.qr-description {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
}

.qr-result {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
}

.qr-download-btn {
    text-decoration: none;
}

.qr-image {
    border-radius: var(--radius-md);
    max-width: 200px;
}

.qr-warning {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-warning);
    margin: 0;
}
</style>
