<script setup>
    import { useHead } from '@vueuse/head';
    import { ref } from 'vue';
    import { useForm, defineRule, configure } from 'vee-validate';
    import * as yup from 'yup';
    import AuthenticationCard from '@/Components/AuthenticationCard.vue';
    import InputError from '@/Components/InputError.vue';
    import InputLabel from '@/Components/InputLabel.vue';
    import PrimaryButton from '@/Components/PrimaryButton.vue';
    import TextInput from '@/Components/TextInput.vue';

    // Update the page title
    useHead({
        title: 'Secure Area',
        meta: [{ name: 'description', content: 'Password confirmation' }],
    });

    // Configure vee-validate
    defineRule('required', (value) => (value ? true : 'This field is required.'));
    configure({
        generateMessage: (ctx) => {
            const messages = {
            required: `The field ${ctx.field} is required.`,
            min: `The field ${ctx.field} must contain at least ${ctx.rule.params[0]} characters.`,
            };
            return messages[ctx.rule.name] || 'Invalid field.';
        },
    });

    // Define the validation scheme
    const schema = yup.object({
        password: yup.string().required('Password is required.'),
    });

    // Use vee-validate to manage the form
    const { values, errors, isSubmitting, handleSubmit, resetForm } = useForm({
        validationSchema: schema,
    });

    // Ref for password field
    const passwordInput = ref(null);

    // Management of the submit
    const submit = handleSubmit(() => {
        console.log('Password confirmed:', values.password);
        // Simulates a form reset and focus on the password field
        resetForm();
        passwordInput.value.focus();
    });
</script>

<template>
    <AuthenticationCard>

        <div class="mb-4 text-sm text-gray-600">
            This is a secure area of the application. Please confirm your password before continuing.
        </div>

        <form @submit.prevent="submit">
            <div>
                <InputLabel for="password" value="Password" />
                <TextInput
                id="password"
                ref="passwordInput"
                v-model="values.password"
                type="password"
                class="mt-1 block w-full"
                required
                autocomplete="current-password"
                autofocus
                />
                <InputError class="mt-2" :message="errors.password" />
            </div>

            <div class="flex justify-end mt-4">
                <PrimaryButton
                class="ms-4"
                :class="{ 'opacity-25': isSubmitting }"
                :disabled="isSubmitting"
                >
                Confirm
                </PrimaryButton>
            </div>
        </form>
    </AuthenticationCard>
</template>