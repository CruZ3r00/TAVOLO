<script setup>
import { ref } from 'vue';
import InputLabel from '@/Components/InputLabel.vue';
import TextInput from '@/Components/TextInput.vue';
import SectionTitle from '@/Components/SectionTitle.vue';

const isError = ref(false);
const isSucces = ref(false);
const alertMessage = ref('');
const isLoading = ref(false);

const props = defineProps({
    user: {
        type: Object,
        required: true,
        default: () => ({
            username: '',
            email: '',
        }),
    },
});

const username = ref('');
const email = ref('');

const updateInfoUser = async () => {
    // Reset status messages before any operation
    isError.value = false;
    isSucces.value = false;
    alertMessage.value = '';

    // Check if at least one data has been entered
    if (!username.value && !email.value) {
        isError.value = true;
        alertMessage.value = 'Error: no data was entered';
        return;
    }

    isLoading.value = true;
    try {
        const response = await fetch(`http://localhost:8000/update_info/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                old_username: props.user.username,
                new_username: username.value || props.user.username,
                email: email.value || props.user.email,
            }),
        });

        const responseData = await response.json();

        if (!response.ok) {
            isError.value = true;
            alertMessage.value = responseData.error;
        } else {
            isSucces.value = true;
            alertMessage.value = 'Profile updated';
        }
    } catch {
        isError.value = true;
        alertMessage.value = 'Unexpected error during the update';
    }
    isLoading.value = false;
};
</script>

<template>
  <SectionTitle>
      <template #title>
          <slot name="title" />
      </template>
      <template #description>
          <p class="description-text">Update your account's profile information and/or email address</p>
      </template>
  </SectionTitle>

  <div v-if="isError" class="error-message fade-in">{{ alertMessage }}</div>
  <div v-else-if="isSucces" class="success-message fade-in">{{ alertMessage }}</div>

  <div v-if="isLoading" class="loader"></div>

  <form @submit.prevent="updateInfoUser" class="update-form">
      <div class="form-field">
          <InputLabel for="username" value="Username" />
          <TextInput id="username" v-model="username" type="text" class="input-field" :placeholder="props.user.username"/>
      </div>
      <div class="form-field">
          <InputLabel for="email" value="Email" />
          <TextInput id="email" v-model="email" type="text" class="input-field" :placeholder="props.user.email"/>
      </div>
      <button type="submit" class="submit-btn" :disabled="isLoading">
          <span v-if="isLoading" class="loader-spinner"></span>
          <span v-else>Save</span>
      </button>
  </form>
</template>