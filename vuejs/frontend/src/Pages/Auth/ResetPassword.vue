<script setup>
    import { useHead } from '@vueuse/head';
    import { reactive } from 'vue';
    import { useRouter } from 'vue-router';
    import { defineRule, configure } from 'vee-validate';
    import AuthenticationCard from '@/Components/AuthenticationCard.vue';
    import InputError from '@/Components/InputError.vue';
    import InputLabel from '@/Components/InputLabel.vue';
    import PrimaryButton from '@/Components/PrimaryButton.vue';
    import TextInput from '@/Components/TextInput.vue';

    // Update the page title
    useHead({
        title: 'Reset Password',
        meta: [
            { name: 'description', content: 'Password reset page' },
        ],
    });

    // Configure vee-validate
    defineRule('required', (value) => (value ? true : 'This field is required'));
    defineRule('email', (value) => 
        /^\S+@\S+\.\S+$/.test(value) || 'Please enter a valid email address'
    );
    defineRule('confirmed', (value, [other]) => value === other || 'The passwords do not match');
    configure({
        generateMessage: (ctx) => {
            const messages = {
            required: `The field ${ctx.field} is required.`,
            email: 'Please enter a valid email address',
            confirmed: 'The passwords do not match',
            };
            return messages[ctx.rule.name] || 'Invalid field';
        },
    });

    // Form data
    const props = defineProps({
        email: String,
        token: String,
    });

    const form = reactive({
        token: props.token,
        email: props.email,
        password: '',
        password_confirmation: '',
    });

    const errorMessage = reactive({
        value: '',
    });

    const router = useRouter();

    const submit = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/password/update', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(form),
            });

            if (!response.ok) {
            const data = await response.json();
            errorMessage.value = data.message || 'Password reset failed';
            } else {
            const data = await response.json();
            localStorage.setItem('user', JSON.stringify(data));
            router.push('/dashboard');
            }
        } catch (error) {
            console.error('Error:', error);
            errorMessage.value = 'An error occurred';
        }
    };
</script>

<template>
    <AuthenticationCard>

        <div v-if="errorMessage.value" class="mb-4 font-medium text-sm text-red-600">
            {{ errorMessage.value }}
        </div>

        <form @submit.prevent="submit">
            <div>
                <InputLabel for="email" value="Email" />
                <TextInput
                    id="email"
                    v-model="form.email"
                    type="email"
                    class="mt-1 block w-full"
                    required
                    autofocus
                    autocomplete="username"
                />
                <InputError class="mt-2" :message="form.errors.email" />
            </div>

            <div class="mt-4">
                <InputLabel for="password" value="Password" />
                <TextInput
                    id="password"
                    v-model="form.password"
                    type="password"
                    class="mt-1 block w-full"
                    required
                    autocomplete="new-password"
                />
                <InputError class="mt-2" :message="form.errors.password" />
            </div>

            <div class="mt-4">
                <InputLabel for="password_confirmation" value="Confirm Password" />
                <TextInput
                    id="password_confirmation"
                    v-model="form.password_confirmation"
                    type="password"
                    class="mt-1 block w-full"
                    required
                    autocomplete="new-password"
                />
                <InputError class="mt-2" :message="form.errors.password_confirmation" />
            </div>

            <div class="flex items-center justify-end mt-4">
                <PrimaryButton :class="{ 'opacity-25': form.processing }" :disabled="form.processing">
                    Reset Password
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
