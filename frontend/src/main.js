import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth.store';
import { initMsal } from './auth/msal';

// Await MSAL init before mounting: handleRedirectPromise must run
// before any loginPopup() call, otherwise a stale interaction flag
// from a previous attempt triggers `interaction_in_progress`.
async function bootstrap() {
  try {
    await initMsal();
  } catch (err) {
    // Non-fatal — app still mounts so the login screen can render
    // and the user can retry (which will re-run initMsal via the
    // singleton's cached rejected promise, so reset it first).
    console.error('MSAL init failed:', err);
  }

  const app   = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  // Rehydrate auth state from sessionStorage before the first render.
  useAuthStore().initFromSession();

  app.mount('#app');
}

bootstrap();
