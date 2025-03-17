<script setup>
import { useHead } from '@vueuse/head';
import { useRouter } from 'vue-router';
import AuthenticationCard from '@/Components/AuthenticationCard.vue';
import Checkbox from '@/Components/Checkbox.vue';
import InputLabel from '@/Components/InputLabel.vue';
import TextInput from '@/Components/TextInput.vue';
import { ref } from 'vue';

// Page title
useHead({
  title: 'Register',
  meta: [
    { name: 'description', content: 'Registration page' },
  ],
});

const username = ref('');
const name = ref('');
const surname = ref('');
const email = ref('');
const birth_date = ref('');
const password = ref('');
const password_confirmation= ref('');
const terms = ref(false);
const preferenceID = ref('');


const isError = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const showPassword = ref(false);


const router = useRouter();

const CreatePreferences = async () => {
  try{
    const response = await fetch('http://localhost:1337/api/preferences/', {
      method: "POST",
      headers: {
        'Content-Type' : 'application/json',
      },
      body: JSON.stringify({ data: {
        primary_color: "#0d6efd",
        second_color: "#ffffff",
        theme: "standard",
        layout: 1,
      } }), //using default value
    });
    if( response.ok ){
      const data = await response.json();
      preferenceID.value = data.data.id-1;
    }
  }catch(error){
    console.error('Errore di rete:', error.message);
  }

};

// Management of the submit
const submit = async () => {
  isLoading.value = true;
    try {
      await CreatePreferences();
      console.log(preferenceID.value);
        const response = await fetch('http://localhost:1337/api/auth/local/register/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              data: {
                "username": username.value,
                "email": email.value,
                "password": password.value,
                "passwordConfirmation" : password_confirmation.value,
                "bith_date": birth_date.value,
                "name": name.value,
                "surname": surname.value,
                "fk_prefs": preferenceID.value,
              }
            }),
        });

        if (response.ok) {
            router.push('/login');
        } else {
            const errorData = await response.json();
            errorMessage.value = errorData.email + errorData.username;
            isError.value = true;
        }

    } catch (error) {
        console.error('Errore di rete:', error.message);
    }
  isLoading.value = false;

};
</script>

<template>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <div class="register-page">
    <AuthenticationCard class="auth-card">
      <!-- Welcome message remains static -->
      <div class="welcome-message">
        <span class="welcome-text">Registrati!</span>
      </div>
      
      <div v-if="isError" class="error-message fade-in">
        {{ errorMessage }}
      </div>

      <form @submit.prevent="submit" class="register-form">

        <InputLabel for="username" value="Username" class="form-label"/>
        <TextInput
          id="username"
          v-model="username"
          type="text"
          class="form-control"
          placeholder="Username"
          required
        />

        <InputLabel for="email" value="Email" class="form-label"/>
        <TextInput
          id="email"
          v-model="email"
          type="email"
          class="form-control"
          placeholder="Email"
          required
        />

        <InputLabel for="birth_date" value="Birth date" class="form-label"/>
        <TextInput
          id="birth_date"
          v-model="birth_date"
          type="date"
          class="form-control"
          required
          />

        <InputLabel for="name" value="Nome" class="form-label"/>
        <TextInput
          id="name"
          v-model="name"
          type="text"
          class="form-control"
          placeholder="Nome"
          required
        />

        <InputLabel for="surname" value="Cognome" class="form-label"/>
        <TextInput
          id="surname"
          v-model="surname"
          type="text"
          class="form-control"
          placeholder="Cognome"
          required
        />

        <InputLabel for="password" value="Password" class="form-label" />
        <div class="password-container">
          <TextInput 
            id="password" 
            v-model="password" 
            :type="showPassword ? 'text' : 'password'" 
            class="form-control" 
            placeholder="password"
            required 
          />
          <span @click="showPassword = !showPassword" class="icon">
            <i v-if="showPassword" class="bi bi-eye"></i>
            <i v-else class="bi bi-eye-slash"></i>
          </span>
        </div>

        <InputLabel for="password_confirm" value="Conferma password" class="form-label" />
        <div class="password-container">
          <TextInput 
            id="password_confirm" 
            v-model="password_confirmation" 
            :type="showPassword ? 'text' : 'password'" 
            class="form-control" 
            placeholder="Ripeti password"
            required 
          />
          <span @click="showPassword = !showPassword" class="icon">
            <i v-if="showPassword" class="bi bi-eye"></i>
            <i v-else class="bi bi-eye-slash"></i>
          </span>
        </div>

        <div class="form-field terms-field">
          <label class="checkbox-label">
            <Checkbox id="terms" v-model:checked="terms" name="terms" required />
            <span class="terms-text">
              Ho letto e accetto i
              <router-link to="/terms" class="link">termini del servizio</router-link> e la 
              <router-link to="/privacy-policy" class="link">Politica di privacy</router-link>
            </span>
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="submit-btn" :disabled="isLoading">
            <span v-if="isLoading" class="loader"></span>
            <span v-else>Register</span>
          </button>
        </div>

        <!-- Modified "Already Registered" link -->
        <router-link to="/login" class="already-registered link">
          Already have an account? <span>Log in now</span>
        </router-link>
      </form>
    </AuthenticationCard>
  </div>
</template>

<style scoped>
  body {
    margin: 0;
    font-family: 'Arial', sans-serif;
  }

  .register-page  {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-size: cover;
    background-position: center;
  }

  .auth-card{
    background-color: #f5eee1;
    border-radius: 15px;
    padding: 2rem;
    box-shadow: 0 8px 20px rgba(255, 255, 255, 0.3);
    width: 450px;
    max-width: 90%;
    position: relative;
    margin: 0 auto; /* Center the form */
  }

  .welcome-message {
    font-size: 1.6rem;
    text-align: center;
    color: #2c3e50;
    margin-bottom: 0.2rem;
    text-shadow: 4px 4px 10px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 255, 255, 0.8);
  }

  .welcome-text {
    color: #2c3e50;
    font-size: 26px;
    font-weight: bold;
    text-shadow: 2px 2px 5px rgba(0, 0, 0, 0.3);
  }
  .password-container {
    position: relative;
    display: inline-block;
  }

  .password-container input {
    padding-right: 30px; /* Spazio per l'icona */
    height: 35px;
    border: 1px solid #ccc;
    border-radius: 5px;
  }

  .password-container .icon {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
  }

  .error-message {
    color: #e74c3c;
    font-size: 14px;
    text-align: center;
    margin-bottom: 1rem;
  }
  .register-form {
    width: 350px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background-color: #ffffff;
    border-radius: 12px;
  }
  .input-field {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    box-sizing: border-box;
    font-size: 13px;
    transition: border-color 0.3s ease;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  }

  .input-field:focus {
    border-color: #2980b9;
    outline: none;
    box-shadow: 0 4px 8px rgba(41, 128, 185, 0.3);
  }

  .password-field {
    position: relative;
  }

  .password-toggle {
    position: absolute;
    top: 40%;
    right: 5px;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #2ecc71;
    font-size: 12.5px;
    font-weight: bold;
    cursor: pointer;
  }

  .submit-btn {
  background-color: #2ecc71;
  color: white;
  padding: 10px 18px;
  border: none;
  margin-top: 0.8rem;
  border-radius: 6px;
  width: 100%;
  cursor: pointer;
  transition: background-color 0.3s ease, transform 0.2s ease, box-shadow 0.2s ease;
  font-size: 14px;
 }

 .submit-btn:hover {
  background-color: #27ae60;
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
 }

  .terms-text {
    font-size: 12px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    font-size: 14px;
    margin-top: 10px;
  }

  .already-registered {
    display: block;
    text-align: center;
    color: #2c3e50;
    font-size: 14px;
    font-weight: 500;
    margin-top: 15px;
  }

  .already-registered span {
    font-weight: bold;
  }

  .already-registered:hover {
    text-decoration: underline;
  }

  .loader {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #3498db;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    animation: spin 2s linear infinite;
  }
  /* Smoother transitions */
  .fade-in {
    animation: fadeIn 1s;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>