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

const form = ref({
  username: '',
  email: '',
  birth_date: '',
  password: '',
  password_confirmation: '',
  terms: false,
});

const isError = ref(false);
const errorMessage = ref('');
const passwordVisible = ref(false);
const passwordConfirmationVisible = ref(false);

const router = useRouter();

// Management of the submit
const submit = async () => {
    try {
        const response = await fetch('http://localhost:8000/register/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(form.value),
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
};
</script>

<template>
  <div class="register-page" :style="{ backgroundImage: 'url(' + backgroundImage + ')' }">
    <AuthenticationCard class="auth-card">
      <!-- Welcome message remains static -->
      <div class="welcome-message">
        <span class="welcome-text">Nice to see you!</span>
        <span class="step-text">One last step and then you can play</span>
      </div>
      
      <div v-if="isError" class="error-message fade-in">
        {{ errorMessage }}
      </div>

      <form @submit.prevent="submit" class="register-form">
        <div class="form-field">
          <InputLabel for="username" value="Username" />
          <TextInput
            id="username"
            v-model="form.username"
            type="text"
            class="input-field"
            required
          />
        </div>

        <div class="form-field">
          <InputLabel for="email" value="Email" />
          <TextInput
            id="email"
            v-model="form.email"
            type="email"
            class="input-field"
            required
          />
        </div>

        <div class="form-field">
          <InputLabel for="birth_date" value="Birth date" />
          <TextInput
            id="birth_date"
            v-model="form.birth_date"
            type="date"
            class="input-field"
            required
          />
        </div>

        <div class="form-field">
          <InputLabel for="password" value="Password" />
          <div class="password-field">
            <TextInput
              id="password"
              v-model="form.password"
              :type="passwordVisible ? 'text' : 'password'"
              class="input-field"
              required
            />
            <button type="button" class="password-toggle" @click="passwordVisible = !passwordVisible">
              {{ passwordVisible ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <div class="form-field">
          <InputLabel for="password_confirmation" value="Conferma Password" />
          <div class="password-field">
            <TextInput
              id="password_confirmation"
              v-model="form.password_confirmation"
              :type="passwordConfirmationVisible ? 'text' : 'password'"
              class="input-field"
              required
            />
            <button type="button" class="password-toggle" @click="passwordConfirmationVisible = !passwordConfirmationVisible">
              {{ passwordConfirmationVisible ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <div class="form-field terms-field">
          <label class="checkbox-label">
            <Checkbox id="terms" v-model:checked="form.terms" name="terms" required />
            <span class="terms-text">
              I agree to the
              <router-link to="/terms" class="link">Terms of Service</router-link> and
              <router-link to="/privacy-policy" class="link">Privacy Policy</router-link>
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

  .register-page {
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
    padding: 1.5rem;
    box-shadow: 0 8px 20px rgba(255, 255, 255, 0.3);
    width: 400px;
    max-width: 90%;
    position: relative;
    margin: 0 auto;
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

  .step-text {
    color: #f39c12;
    font-size: 18px;
    font-weight: 500;
    text-shadow: 4px 4px 10px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 255, 255, 0.8);
    display: block;
    margin-top: 5px;
    transition: none;
  }
  .error-message {
    color: #e74c3c;
    font-size: 14px;
    text-align: center;
    margin-bottom: 1rem;
  }
  .register-form {
    background-color: #fff;
    border-radius: 8px;
    padding: 1.2rem;
    width: 100%;
    max-width: 400px;
    height: auto;
    box-sizing: border-box;
    margin-top: 20px;
    box-shadow: none;
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