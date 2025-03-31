<script setup> //probabilmente non funzionante ancora, componente form per la cancellazione dell'utente dal servizio
import { ref } from 'vue';
import { useForm, defineRule } from 'vee-validate';
import { useHead } from '@vueuse/head';
import DangerButton from '@/Components/DangerButton.vue';
import DialogModal from '@/Components/DialogModal.vue';
import InputError from '@/Components/InputError.vue';
import SecondaryButton from '@/Components/SecondaryButton.vue';
import TextInput from '@/Components/TextInput.vue';

// Define the "required" rule for password field
defineRule('required', (value) => {
    if (!value || value.trim() === '') {
        return 'Password is required';
    }
    return true;
});

// Update the page metadata
useHead({
    title: 'Delete Account',
    meta: [
        { name: 'description', content: 'Permanently delete your account and all its data' },
    ],
});

// Status and form
const confirmingUserDeletion = ref(false);
const passwordInput = ref(null);

// Use of vee-validate for form validation
const form = useForm({
    initialValues: {
        password: '',
    },
    validateOnInput: true,
});

// Function to confirm account deletion
const confirmUserDeletion = () => {
    confirmingUserDeletion.value = true;
    setTimeout(() => passwordInput.value.focus(), 250);
};

// Account delete function
// probabilmente da rifare questa function
const deleteUser = () => {
    form.submit(() => {
        fetch('/api/current-user/destroy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: form.values.password }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeModal();
            } else {
                console.error('Error:', data.message);
            }
        })
        .catch(error => {
            console.error('The request has failed', error);
            passwordInput.value.focus();
        })
        .finally(() => {
            form.reset();
        });
    });
};

// Function to close the modal
const closeModal = () => {
    confirmingUserDeletion.value = false;
    form.reset();
};
</script>

<template>
    <div class="max-w-xl mx-auto">
        <p class="text-sm text-gray-600 mb-4">
            Once your account is deleted, all of its resources and data will be permanently deleted. Before deleting your account, please download any data or information that you wish to retain.
        </p>

        <DangerButton @click="confirmUserDeletion" class="w-full md:w-auto">
            Delete Account
        </DangerButton>

        <!-- Delete Account Confirmation Modal -->
        <DialogModal :show="confirmingUserDeletion" @close="closeModal" class="transition-transform transform-gpu">
            <template #title>
                <span class="text-lg font-semibold text-red-600">Delete Account</span>
            </template>

            <template #content>
                <div class="mt-4 text-gray-800">
                    Are you sure you want to delete your account? Once your account is deleted, all of its resources and data will be permanently deleted. Please enter your password to confirm you would like to permanently delete your account.
                </div>
                <div class="mt-6">
                    <TextInput
                        ref="passwordInput"
                        v-model="form.values.password"
                        type="password"
                        class="w-full rounded-lg border-2 border-gray-300 p-3 mt-2 focus:ring-2 focus:ring-red-500"
                        placeholder="Password"
                        autocomplete="current-password"
                        @keyup.enter="deleteUser"
                    />
                    <!-- Error message for password -->
                    <InputError :message="form.errors.password" class="mt-2 text-red-500 text-sm font-medium" />
                </div>
            </template>

            <template #footer>
                <SecondaryButton @click="closeModal" class="w-full md:w-auto">
                    Cancel
                </SecondaryButton>

                <DangerButton
                    class="w-full md:w-auto mt-3 md:mt-0"
                    :class="{ 'opacity-50': form.processing }"
                    :disabled="form.processing"
                    @click="deleteUser"
                >
                    Delete Account
                </DangerButton>
            </template>
        </DialogModal>
    </div>
</template>