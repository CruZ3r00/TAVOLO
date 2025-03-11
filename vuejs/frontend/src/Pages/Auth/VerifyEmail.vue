<script setup>
import { computed } from 'vue';
import { useHead } from '@vueuse/head';
import { useForm } from 'vee-validate';
import AuthenticationCard from '@/Components/AuthenticationCard.vue';
import PrimaryButton from '@/Components/PrimaryButton.vue';

// Aggiorna il titolo della pagina
useHead({
    title: 'Email Verification',
    meta: [
        { name: 'description', content: 'Please verify your email address to continue' },
    ],
});

// Dati del form
const form = useForm();

// Prop per lo stato del link di verifica
const props = defineProps({
    status: String,
});

// Computed per sapere se il link di verifica è stato inviato
const verificationLinkSent = computed(() => props.status === 'verification-link-sent');

// Funzione per inviare nuovamente il link di verifica
const submit = () => {
    form.post(route('verification.send'));
};
</script>

<template>
  <AuthenticationCard>

    <div class="mb-4 text-sm text-gray-600">
      Before continuing, could you verify your email address by clicking on the link we just emailed to you? If you didn't receive the email, we will gladly send you another.
    </div>

    <div v-if="verificationLinkSent" class="mb-4 font-medium text-sm text-green-600">
      A new verification link has been sent to the email address you provided in your profile settings.
    </div>

    <form @submit.prevent="submit">
      <div class="mt-4 flex items-center justify-between">
        <PrimaryButton :class="{ 'opacity-25': form.processing }" :disabled="form.processing">
          Resend Verification Email
        </PrimaryButton>

        <div>
          <!-- Sostituito Link con router-link -->
          <router-link
            :to="route('profile.show')"
            class="underline text-sm text-gray-600 hover:text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Edit Profile
          </router-link>

          <!-- Sostituito Link con un button per il logout -->
          <button
            type="submit"
            formmethod="post"
            formaction="route('logout')" 
            class="underline text-sm text-gray-600 hover:text-gray-900 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ms-2"
          >
            Log Out
          </button>
        </div>
      </div>
    </form>
  </AuthenticationCard>
</template>

<style scoped>
.error {
  color: red;
}
</style>
