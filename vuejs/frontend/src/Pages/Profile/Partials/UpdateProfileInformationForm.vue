<script setup>
import { onMounted, ref } from 'vue';
import InputLabel from '@/Components/InputLabel.vue';
import { useStore } from 'vuex';
import TextInput from '@/Components/TextInput.vue';

const isError = ref(false);
const isSucces = ref(false);
const alertMessage = ref('');
const isLoading = ref(false);

const props = defineProps({
    user: {
        type: Object,
        required: true,
        default: () => ({
            id: '',
            username: '',
            email: '',
        }),
    },
});

const username = ref('');
const email = ref('');
const store = useStore();



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
    const tokjwt = store.getters.getToken;
    try {
      const response = await fetch(`http://192.168.1.36:1337/api/users/${props.user.id}`,{
        method: 'PUT',
        headers:{
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokjwt}`,
        },
        body: JSON.stringify({
            "email": email.value,
            "username": username.value,
        }),
      });
        const responseData = await response.json();

        if (!response.ok) {
            isError.value = true;
            alertMessage.value = responseData.error;
        } else {
            isSucces.value = true;
            alertMessage.value = 'Profilo aggiornato';
        }
    } catch {
        isError.value = true;
        alertMessage.value = 'Errore inaspettato';
    }
    isLoading.value = false;
};

onMounted(() => {
  username.value = props.user.username;
  email.value = props.user.email;
});
</script>

<template>
    <form @submit.prevent="updateInfoUser">
        <!-- Name -->
        <div class="container border bg-light p-4">
            <h1 class="display-6 fw-bold text-body pb-3 mt-3">
                Aggiorna le informazioni del <span style="text-decoration: underline; text-decoration-color: blue">tuo profilo.</span>
            </h1>
            <div v-if="isError" style="color: red;">{{ alertMessage }}</div>
            <div v-else-if="isSucces" style="color: green;">{{ alertMessage }}</div>
            <div class="col pt-3 mb-3">
                <InputLabel for="name" value="Name" class="form-label"/>
                <TextInput
                    id="name"
                    v-model="username"
                    type="text"
                    class="form-control"
                    required
                    autocomplete="username"
                    :placeholder="username"
                />
            </div>
            <!-- Email -->
            <div class="col pt-3 mb-3">
                <InputLabel for="email" value="Email" class="form-label" />
                <TextInput
                    id="email"
                    v-model="email"
                    type="email"
                    class="form-control"
                    required
                    autocomplete="email"
                    :placeholder="email"
                />
            </div>
            <button 
                type="submit" 
                class="btn btn-primary" 
                :disabled="isLoading"
            >
                <span v-if="isLoading" class="loader"></span>
                <span v-else>Salva</span>
            </button>
        </div>
    </form>
</template>