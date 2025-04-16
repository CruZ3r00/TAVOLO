<script setup>
import { ref } from 'vue';
import InputLabel from '@/Components/InputLabel.vue';
import TextInput from '@/Components/TextInput.vue';
import { useStore } from 'vuex';

const store = useStore();
const props = defineProps(['id']);
// Reference variables for inputs
const current_password = ref('');
const password = ref('');
const password_confirmation = ref('');
const alertMessage = ref('');

// Variables for success message and visibility of password
const showPassword = ref(false);
const showCurrentPassword = ref(false);
const showConfirmPassword = ref(false);

const isLoading = ref(false);
const isError = ref(false);
const isSucces = ref(false);
const updatePassword = async () => {
    const tkn = store.getters.getToken;
    if( password.value === password_confirmation.value){
        try{
            const response = await fetch(`http://localhost:1337/api/users/${props.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tkn}`,
                },
                body: JSON.stringify({
                    password: password.value, // La password corrente
                }),
            });

            if (response.ok){
                isError.value = false;
                isSucces.value = true;
                alertMessage.value = 'Password aggiornata con successo'
            }else{
                isError.value = true;
                alertMessage.value = 'Errore inaspettato' 
            }
        }catch(error){
            alertMessage.value = 'Network error. Please try again.';
            isError.value = true;
        }
    }else{
        alertMessage.value = 'Le due password devono essere uguali';
        isError.value = true;
    }
}



// Password update function
const updatePasswordCheck = async () => {
    const username = store.getters.getUser.username;
    isLoading.value = true;
    try{
        const response = await fetch('http://localhost:1337/api/auth/local', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                identifier: username, // Usa lo username
                password: current_password.value, // La password corrente
            }),
        });
        if(response.ok){
            const data = await response.json();
            // Saving in the Storage
            store.dispatch('login', { user: data.user, token: data.jwt });
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('token', data.jwt);
            updatePassword();
        }else{
            alertMessage.value = 'Password sbagliata';
            isError.value = true;
        }
    }catch(error){
        alertMessage.value = 'Network error. Please try again.';
        isError.value = true;
    }finally{
        isLoading.value = false;
    }
};
</script>

<template>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <form @submit.prevent="updatePasswordCheck">
        <div class="container border bg-light p-4">
            <h1 class="display-6 fw-bold text-body pb-3 mt-3">
                Aggiorna <span style="text-decoration: underline; text-decoration-color: blue">la tua password</span>
            </h1>

            <div v-if="isError" class="fade-in" style="color: red;">
                {{ alertMessage }}
            </div>
            <div v-else-if="isSucces" class="fade-in" style="color: green;">
                {{ alertMessage }}
            </div>

            <InputLabel for="current_password" value="Password corrente" class="form-label"/>
            <div class="password-container mb-3 pt-3">
                <TextInput
                    id="current_password"
                    v-model="current_password"
                    :type="showCurrentPassword ? 'text' : 'password'"
                    class="form-control"
                    :placeholder="'Inserisci la password corrente'"
                    required
                />
                <span @click="showCurrentPassword = !showCurrentPassword" class="icon">
                    <i v-if="showCurrentPassword" class="bi bi-eye"></i>
                    <i v-else class="bi bi-eye-slash"></i>
                </span>
            </div>

            <InputLabel for="password" value="Password" class="form-label" />
            <div class="password-container mb-3 pt-3">
                <TextInput 
                id="password" 
                v-model="password" 
                :type="showPassword ? 'text' : 'password'" 
                class="form-control" 
                :placeholder="'Nuova password'"
                required 
                />
                <span @click="showPassword = !showPassword" class="icon">
                    <i v-if="showPassword" class="bi bi-eye"></i>
                    <i v-else class="bi bi-eye-slash"></i>
                </span>
            </div>

            <InputLabel for="password_confirmation" value="Confirm Password" class="form-label" />
            <div class="password-container mb-3 pt-3">
                <TextInput
                id="password_confirmation"
                v-model="password_confirmation"
                :type="showConfirmPassword ? 'text' : 'password'"
                class="form-control"
                :placeholder="'Conferma la nuova password'"
                autocomplete="new-password"
                required
                />
                <span @click="showConfirmPassword = !showConfirmPassword" class="icon">
                    <i v-if="showConfirmPassword" class="bi bi-eye"></i>
                    <i v-else class="bi bi-eye-slash"></i>
                </span>
                </div>

            <button type="submit" class="btn btn-primary ">
                Salva
            </button>
        </div>
    </form>

</template>

<style scoped>
.password-container {
    position: relative;
    display: inline-block;
    width: 100%;    
  }

  .password-container input {
    width: 100%;
    padding-right:40px; /* Spazio per l'icona */
    box-sizing: border-box;
  }

  .password-container .icon {
    position: absolute;
    right: 10px;
    top: 45%;
  }
</style>