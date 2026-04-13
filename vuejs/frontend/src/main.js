import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createHead } from '@vueuse/head';
import { store } from './store';
import { MotionPlugin } from '@vueuse/motion';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import './assets/design-system.css';

const app = createApp(App)
app.use(store)
app.use(router)
app.use(createHead())
app.use(MotionPlugin)
app.mount('#app')
