<script setup>
import { useHead } from '@vueuse/head';
import { useForm, defineRule, configure } from 'vee-validate';
import * as yup from 'yup';
import AuthenticationCard from '@/Components/AuthenticationCard.vue';
import InputError from '@/Components/InputError.vue';
import InputLabel from '@/Components/InputLabel.vue';
import PrimaryButton from '@/Components/PrimaryButton.vue';
import TextInput from '@/Components/TextInput.vue';
import { ref } from 'vue';

const errorMessage = ref(''); // To manage error messages
const successMessage = ref(''); // To manage success messages



// Update the page title
useHead({
  title: 'Forgot Password',
  meta: [
    { name: 'description', content: 'Password reset request' },
  ],
});

// Configure vee-validate
defineRule('required', (value) => (value ? true : 'This field is required'));
defineRule('email', (value) =>
  /^\S+@\S+\.\S+$/.test(value) || 'Please enter a valid email address.'
);
configure({
  generateMessage: (ctx) => {
    const messages = {
      required: `The field ${ctx.field} is required.`,
      email: 'Please enter a valid email address.',
    };
    return messages[ctx.rule.name] || 'Invalid field.';
  },
});

// Define the validation scheme
const schema = yup.object({
  username: yup.string().required('Username is required'),
  email: yup.string().required('The email is mandatory.').email('Please enter a valid email address.'),
});

// Use vee-validate to manage the form
const { values, errors, isSubmitting, handleSubmit } = useForm({
  validationSchema: schema,
});

// Management of the submit
const submit = handleSubmit(async () => {
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const response = await fetch('http://192.168.1.36:8000/forgotten_password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: values.username,
        email: values.email,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      errorMessage.value = data.message || 'Error during verification.';
    } else {
      successMessage.value = 'Identity confirmed. Proceed to reset password.';
    }
  } catch (error) {
    console.error('Errore:', error);
    errorMessage.value = 'An unexpected error occurred';
  }

  // Reset the form fields
  values.username = '';
  values.email = '';
});
</script>


<template>
  <AuthenticationCard>
    <div class="mb-4 text-sm text-gray-600">
      Forgot your password? No problem. Please enter your username and email address to confirm your identity.
    </div>

    <div v-if="status" class="mb-4 font-medium text-sm text-green-600">
      {{ status }}
    </div>

    <div v-if="successMessage" class="mb-4 font-medium text-sm text-green-600">
      {{ successMessage }}
    </div>
    <div v-if="errorMessage" class="mb-4 font-medium text-sm text-red-600">
      {{ errorMessage }}
    </div>

    <form @submit.prevent="submit">
      <div>
        <InputLabel for="username" value="Nome Utente" />
        <TextInput
          id="username"
          v-model="values.username"
          type="text"
          class="mt-1 block w-full"
          required
          autofocus
          autocomplete="username"
        />
        <InputError class="mt-2" :message="errors.username" />
      </div>

      <div>
        <InputLabel for="email" value="Email" />
        <TextInput
          id="email"
          v-model="values.email"
          type="email"
          class="mt-1 block w-full"
          required
          autocomplete="email"
        />
        <InputError class="mt-2" :message="errors.email" />
      </div>

      <div class="flex items-center justify-end mt-4">
        <PrimaryButton :class="{ 'opacity-25': isSubmitting }" :disabled="isSubmitting">
          Conferma Identità
        </PrimaryButton>
      </div>
    </form>
  </AuthenticationCard>
</template>