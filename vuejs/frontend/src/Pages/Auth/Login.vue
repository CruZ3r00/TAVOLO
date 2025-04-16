<script setup>
import { useHead } from '@vueuse/head';
import { useRouter } from 'vue-router';
import AuthenticationCard from '@/Components/AuthenticationCard.vue';
import InputLabel from '@/Components/InputLabel.vue';
import TextInput from '@/Components/TextInput.vue';
import { ref } from 'vue';
import { useStore } from 'vuex';


useHead({
    title: 'Login',
    meta: [{ name: 'description', content: 'Login page for the app' }],
});

const store = useStore();

const username = ref('');
const password = ref('');
const errorMessage = ref('');
const isLoading = ref(false);
const isError = ref(false);
const showPassword = ref(false);

const router = useRouter();

const submit = async () => {
    isLoading.value = true;
    errorMessage.value = '';
    try {
        const response = await fetch('http://localhost:1337/api/auth/local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: username.value, password: password.value }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log(data);
            // Saving in the Storage
            store.dispatch('login', { user: data.user, token: data.jwt });
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('token', data.jwt);
            router.push('/dashboard'); // Redirects to dashboard
        } else {
            const errorData = await response.json();
            console.log(errorData);
            errorMessage.value = 'Login failed. Please try again.';
            isError.value = true;
        }
    } catch (error) {
        errorMessage.value = 'Network error. Please try again.';
        isError.value = true;
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <div class="login-container">
    <AuthenticationCard class="auth-card">
      <h1 class="welcome-message">
        Bentornato!
      </h1>
      
      <div v-if="isError" class="error-message fade-in">
        {{ errorMessage }}
      </div>
      
      <form @submit.prevent="submit" class="login-form">
        <div class="form-field">
          <InputLabel for="username" value="Username" class="form-label"/>
          <TextInput id="username" v-model="username" type="text" class="form-control" required placeholder="Email o Username"/>
        </div>

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

        
        <div class="actions">
          <router-link to="/forgot-password" class="text-sm link">Forgot your password?</router-link>
          <router-link to="/register" class="text-sm link">Create an account</router-link>
        </div>
        
        <button 
          type="submit" 
          class="submit-btn" 
          :disabled="isLoading"
        >
          <span v-if="isLoading" class="loader"></span>
          <span v-else>Login</span>
        </button>
      </form>
    </AuthenticationCard>
  </div>
</template>

<style scoped>
  body {
    margin: 0;
    font-family: 'Arial', sans-serif;
  }

  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-size: cover;
    background-position: center;
  }

  .auth-card {
    background-color: #f5eee1;
    border-radius: 15px;
    padding: 2rem;
    box-shadow: 0 8px 20px rgba(255, 255, 255, 0.3);
    width: 450px;
    max-width: 90%;
    position: relative;
    margin: 0 auto; /* Center the form */
  }

  .login-form {
    width: 350px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background-color: #ffffff;
    border-radius: 12px;
  }

  .welcome-message {
    font-size: 2rem;
    text-align: center;
    color: #2c3e50;
    margin-bottom: 0.2rem;
    text-shadow: 4px 4px 10px rgba(0, 0, 0, 0.4), 0 0 20px rgba(255, 255, 255, 0.6);
  }

  .error-message {
    color: #e74c3c;
    font-size: 14px;
    text-align: center;
    margin-bottom: 1rem;
  }

  .form-field {
    margin-bottom: 0.8rem;
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


  .toggle-password-text {
    position: absolute;
    top: 55%;
    right: 10px;
    transform: translateY(-50%);
    color: #2ecc71;
    font-size: 12.5px;
    font-weight: bold;
    cursor: pointer;
  }

  .toggle-password-text:hover {
    color: #27ae60;
  }

  .input-field {
    width: 100%;
    padding: 0.6rem;
    padding-right: 50px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
    background-color: #ffffff;
    box-shadow: 0 2px 5px rgba(255, 255, 255, 0.3);
    transition: box-shadow 0.3s ease, transform 0.3s ease, border-color 0.3s ease;
  }

  .input-field:focus {
    outline: none;
    box-shadow: 0 4px 10px rgba(41, 128, 185, 0.3);
    transform: scale(1.02);
  }

  .input-field:hover {
    border-color: #2ecc71;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    margin: 1rem 0;
  }

  .link {
    color: #2c3e50;
    font-size: 14px;
    text-decoration: none;
  }

  .link:hover {
    text-decoration: underline;
  }

  .submit-btn {
    width: 100%;
    padding: 0.8rem;
    background-color: #27ae60;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 8px rgba(255, 255, 255, 0.3);
    transition: all 0.3s ease;
  }

  .submit-btn:hover {
    background-color: #2ecc71;
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .submit-btn:disabled {
    background-color: #bdc3c7;
    cursor: not-allowed;
  }

  .loader {
    width: 20px;
    height: 20px;
    border: 4px solid #fff;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Smoother transitions */
  .fade-in {
    animation: fadeIn 1s;
  }

  @keyframes fadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
</style>