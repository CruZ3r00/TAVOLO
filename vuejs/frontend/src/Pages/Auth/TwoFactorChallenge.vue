<script setup>
    import { ref, nextTick } from 'vue';
    import { useHead } from '@vueuse/head';
    import { useForm, defineRule, configure } from 'vee-validate';
    import AuthenticationCard from '@/Components/AuthenticationCard.vue';
    import InputError from '@/Components/InputError.vue';
    import InputLabel from '@/Components/InputLabel.vue';
    import PrimaryButton from '@/Components/PrimaryButton.vue';
    import TextInput from '@/Components/TextInput.vue';

    // Aggiorna il titolo della pagina
    useHead({
        title: 'Two-factor Confirmation',
        meta: [
            { name: 'description', content: 'Two-factor authentication page' },
        ],
    });

    // Configurazione di vee-validate
    defineRule('required', (value) => (value ? true : 'Questo campo è obbligatorio.'));
    defineRule('numeric', (value) => /^[0-9]+$/.test(value) || 'Il codice deve essere numerico.');

    configure({
        generateMessage: (ctx) => {
            const messages = {
            required: `Il campo ${ctx.field} è obbligatorio.`,
            numeric: 'Il codice deve essere numerico.',
            };
            return messages[ctx.rule.name] || 'Campo non valido.';
        },
    });

    // Dati del form
    const recovery = ref(false);
    const form = useForm({
        code: '',
        recovery_code: '',
    });

    // Riferimenti per il focus sui campi
    const recoveryCodeInput = ref(null);
    const codeInput = ref(null);

    // Funzione per alternare tra i codici di autenticazione e quelli di recupero
    const toggleRecovery = async () => {
        recovery.value ^= true;
        await nextTick();

        if (recovery.value) {
            recoveryCodeInput.value.focus();
            form.code = '';
        } else {
            codeInput.value.focus();
            form.recovery_code = '';
        }
        };

        // Funzione per inviare il form
        const submit = () => {
        form.post(route('two-factor.login'));
    };
</script>

<template>
    <AuthenticationCard>

        <div class="mb-4 text-sm text-gray-600">
            <template v-if="!recovery">
                Please confirm access to your account by entering the authentication code provided by your authenticator application.
            </template>

            <template v-else>
                Please confirm access to your account by entering one of your emergency recovery codes.
            </template>
        </div>

        <form @submit.prevent="submit">
            <div v-if="!recovery">
                <InputLabel for="code" value="Code" />
                <TextInput
                    id="code"
                    ref="codeInput"
                    v-model="form.code"
                    type="text"
                    inputmode="numeric"
                    class="mt-1 block w-full"
                    autofocus
                    autocomplete="one-time-code"
                    v-bind="$attrs"
                />
                <InputError class="mt-2" :message="form.errors.code" />
            </div>

            <div v-else>
                <InputLabel for="recovery_code" value="Recovery Code" />
                <TextInput
                    id="recovery_code"
                    ref="recoveryCodeInput"
                    v-model="form.recovery_code"
                    type="text"
                    class="mt-1 block w-full"
                    autocomplete="one-time-code"
                />
                <InputError class="mt-2" :message="form.errors.recovery_code" />
            </div>

            <div class="flex items-center justify-end mt-4">
                <button
                    type="button"
                    class="text-sm text-gray-600 hover:text-gray-900 underline cursor-pointer"
                    @click.prevent="toggleRecovery"
                >
                    <template v-if="!recovery">
                        Use a recovery code
                    </template>

                    <template v-else>
                        Use an authentication code
                    </template>
                </button>

                <PrimaryButton class="ms-4" :class="{ 'opacity-25': form.processing }" :disabled="form.processing">
                    Log in
                </PrimaryButton>
            </div>
        </form>
    </AuthenticationCard>
</template>

<style scoped>
    .error {
    color: red;
    }
</style>
