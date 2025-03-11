import { createApp } from 'vue';
import App from '@/Pages/App.vue';
import router from './router';    
import { createHead } from '@vueuse/head';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';

const app = createApp(App);
app.use(router); // Pair the router with the Vue app
app.use(createHead())
app.mount('#app'); // Mount the app in the element with id "app"
