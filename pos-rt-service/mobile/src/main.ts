import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/main.css';
import { bootstrapListeners, onPushReceived } from './plugins/apnsRegistration';
import { wakeAndSyncOnce } from './core/scheduler';

createApp(App).use(router).mount('#app');

// Setup APNs listeners (no-op su Android/web). Silent push (content-available=1)
// → triggera un singolo ciclo di sync, che processa eventuali job pending.
bootstrapListeners().then(() => {
  onPushReceived(async (data) => {
    // jobHint è il payload custom che lo Strapi service mette quando crea
    // un nuovo job. Su altre push (es. notifiche utente in futuro) non
    // facciamo nulla.
    if (data && (data.jobHint || data.event_id)) {
      try {
        await wakeAndSyncOnce();
      } catch (err) {
        console.warn('[push] wake-and-sync fallito:', err);
      }
    }
  });
});
