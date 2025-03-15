<script setup>
import { ref, computed, watch } from 'vue';
import { useForm } from 'vee-validate';
import * as yup from 'yup';
import ActionSection from '@/Components/ActionSection.vue';
import ConfirmsPassword from '@/Components/ConfirmsPassword.vue';
import DangerButton from '@/Components/DangerButton.vue';
import InputError from '@/Components/InputError.vue';
import InputLabel from '@/Components/InputLabel.vue';
import PrimaryButton from '@/Components/PrimaryButton.vue';
import SecondaryButton from '@/Components/SecondaryButton.vue';
import TextInput from '@/Components/TextInput.vue';

const enabling = ref(false);
const confirming = ref(false);
const disabling = ref(false);
const qrCode = ref(null);
const setupKey = ref(null);
const recoveryCodes = ref([]);

// Definisci lo schema di validazione con Yup
const schema = yup.object({
    code: yup.string().required('Il codice è obbligatorio').matches(/^\d{6}$/, 'Il codice deve essere di 6 cifre'),
});

// Usa vee-validate con Yup
const { values, errors, handleSubmit, reset } = useForm({
    validationSchema: schema,
    initialValues: { code: '' },
});

const twoFactorEnabled = computed(() => !enabling.value && localStorage.getItem('two_factor_enabled') === 'true');

watch(twoFactorEnabled, () => {
    if (!twoFactorEnabled.value) {
        reset();
    }
});

const enableTwoFactorAuthentication = async () => {
    enabling.value = true;
    try {
        await fetch('/api/two-factor/enable', { method: 'POST' });
        await Promise.all([showQrCode(), showSetupKey(), showRecoveryCodes()]);
        localStorage.setItem('two_factor_enabled', 'true');
    } finally {
        enabling.value = false;
        confirming.value = true;
    }
};

const showQrCode = async () => {
    const response = await fetch('/api/two-factor/qr-code');
    const data = await response.json();
    qrCode.value = data.svg;
};

const showSetupKey = async () => {
    const response = await fetch('/api/two-factor/secret-key');
    const data = await response.json();
    setupKey.value = data.secretKey;
};

const showRecoveryCodes = async () => {
    const response = await fetch('/api/two-factor/recovery-codes');
    recoveryCodes.value = await response.json();
};

// Funzione di conferma con validazione
const confirmTwoFactorAuthentication = handleSubmit(async () => {
    try {
        await fetch('/api/two-factor/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: values.code }),
        });
        confirming.value = false;
        qrCode.value = null;
        setupKey.value = null;
        reset();
    } catch (error) {
        console.error('Errore nella conferma', error);
    }
});

const regenerateRecoveryCodes = async () => {
    await fetch('/api/two-factor/recovery-codes', { method: 'POST' });
    await showRecoveryCodes();
};

const disableTwoFactorAuthentication = async () => {
    disabling.value = true;
    try {
        await fetch('/api/two-factor/disable', { method: 'DELETE' });
        localStorage.removeItem('two_factor_enabled');
    } finally {
        disabling.value = false;
        confirming.value = false;
    }
};
</script>

<template>
    <div class="border bg-light p-4 container">
        <h1 class="display-6 fw-bold text-body-emphasis pb-3 mt-3">
            Abilita l'<span style="text-decoration: underline; text-decoration-color: darkblue">Autenticazione a due fattori.</span>
        </h1>
        <div class="py-5">
            <h3 v-if="twoFactorEnabled && !confirming" class="text-lg font-medium text-gray-900">Hai abilitato l'autenticazione a due fattori</h3>
            <h3 v-else-if="twoFactorEnabled && confirming" class="text-lg font-medium text-gray-900">Termina il processo</h3>
            <h3 v-else class="text-lg font-medium text-gray-900">Non hai abilitato l'autenticazione a due fattori</h3>

            <div v-if="twoFactorEnabled">
                <div v-if="qrCode">
                    <p class="mt-4 font-semibold">Scansiona il codice QR o inserisci la setup key</p>
                    <div class="mt-4 p-2 inline-block bg-white" v-html="qrCode" />
                    <p v-if="setupKey" class="mt-4 font-semibold">Setup Key: <span v-html="setupKey"></span></p>
                </div>

                <div v-if="confirming" class="mt-4">
                    <InputLabel for="code" value="Code" />
                    <TextInput
                        id="code"
                        v-model="values.code"
                        type="text"
                        class="block mt-1 w-1/2"
                        inputmode="numeric"
                        autofocus
                        autocomplete="one-time-code"
                        @keyup.enter="confirmTwoFactorAuthentication"
                    />
                    <InputError :message="errors.code" class="mt-2 text-red-500" />
                </div>
            </div>

            <div class="mt-5">
                <div v-if="!twoFactorEnabled">
                    <ConfirmsPassword @confirmed="enableTwoFactorAuthentication">
                        <PrimaryButton :disabled="enabling" class="btn-primary" style="background-color: darkblue;">Attiva</PrimaryButton>
                    </ConfirmsPassword>
                </div>

                <div v-else>
                    <ConfirmsPassword @confirmed="confirmTwoFactorAuthentication">
                        <PrimaryButton v-if="confirming" :disabled="enabling" class="me-3">Conferma</PrimaryButton>
                    </ConfirmsPassword>
                    <ConfirmsPassword @confirmed="regenerateRecoveryCodes">
                        <SecondaryButton v-if="recoveryCodes.length > 0 && !confirming" class="me-3">Rigenera codici di recupero</SecondaryButton>
                    </ConfirmsPassword>
                    <ConfirmsPassword @confirmed="disableTwoFactorAuthentication">
                        <DangerButton v-if="!confirming" :disabled="disabling">Disabilita</DangerButton>
                    </ConfirmsPassword>
                </div>
            </div>
        </div>
    </div>
</template>
