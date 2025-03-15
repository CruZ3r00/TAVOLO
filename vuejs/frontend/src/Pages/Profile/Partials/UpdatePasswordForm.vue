<script setup>
import { ref } from 'vue';
import { useForm } from 'vee-validate';
import * as yup from 'yup';
import InputError from '@/Components/InputError.vue';
import InputLabel from '@/Components/InputLabel.vue';
import TextInput from '@/Components/TextInput.vue';

// Reference variables for inputs
const passwordInput = ref(null);
const currentPasswordInput = ref(null);

// Variables for success message and visibility of password
const isPasswordUpdated = ref(false);
const showPassword = ref(false);
const showCurrentPassword = ref(false);
const showConfirmPassword = ref(false);

// Setup of vee-validate for form validation
const passwordSchema = yup.object({
    password: yup.string().min(8, 'Password must be at least 8 characters'),
    password_confirmation: yup.string()
        .oneOf([yup.ref('password'), null], 'Passwords must match'),
});

const { handleSubmit, errors, reset, setFieldValue, values, isSubmitting, setTouched } = useForm({
    validationSchema: passwordSchema,
});

// Password update function
const updatePassword = handleSubmit(() => {
    // Simulate API call for password update
    setTimeout(() => {
        // Success logic
        isPasswordUpdated.value = true;
        reset();
        // Simulation success
        console.log("Password updated successfully!");
    }, 1000);
});
</script>

<template>
    <div class="container">
        <p class="description-text">Ensure your account is using a long, random password to stay secure</p>

        <SectionTitle>
            <template #title>
                <slot name="title" />
            </template>
        </SectionTitle>

        <div v-if="isLoading" class="loader"></div>

        <form @submit.prevent="updatePassword" class="password-form">
            <div class="form-field">
                <InputLabel for="current_password" value="Current Password" />
                <div class="password-input-wrapper">
                    <TextInput
                        id="current_password"
                        v-model="values.current_password"
                        :type="showCurrentPassword ? 'text' : 'password'"
                        class="input-field"
                        :placeholder="'Enter current password'"
                        required
                    />
                    <button type="button" class="toggle-password" @click="showCurrentPassword = !showCurrentPassword">
                        {{ showCurrentPassword ? 'Hide' : 'Show' }}
                    </button>
                </div>
                <InputError :message="errors.current_password" />
            </div>

            <div class="form-field">
                <InputLabel for="password" value="New Password" />
                <div class="password-input-wrapper">
                    <TextInput
                        id="password"
                        ref="passwordInput"
                        v-model="values.password"
                        :type="showPassword ? 'text' : 'password'"
                        class="input-field"
                        :placeholder="'Enter new password'"
                        required
                    />
                    <button type="button" class="toggle-password" @click="showPassword = !showPassword">
                        {{ showPassword ? 'Hide' : 'Show' }}
                    </button>
                </div>
                <InputError :message="errors.password" />
            </div>

            <div class="form-field">
                <InputLabel for="password_confirmation" value="Confirm Password" />
                <div class="password-input-wrapper">
                    <TextInput
                        id="password_confirmation"
                        v-model="values.password_confirmation"
                        :type="showConfirmPassword ? 'text' : 'password'"
                        class="input-field"
                        :placeholder="'Confirm new password'"
                        autocomplete="new-password"
                        required
                    />
                    <button type="button" class="toggle-password" @click="showConfirmPassword = !showConfirmPassword">
                        {{ showConfirmPassword ? 'Hide' : 'Show' }}
                    </button>
                </div>
                <InputError :message="errors.password_confirmation" />
            </div>

            <button type="submit" class="btn btn-primary" :disabled="isLoading">
                <span v-if="isLoading" class="loader-spinner"></span>
                <span v-else>Save</span>
            </button>
        </form>
    </div>
</template>
