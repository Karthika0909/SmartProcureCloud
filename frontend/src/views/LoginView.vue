<template>
  <div class="login-wrapper">
    <div class="login-card">
      <div class="logo">
        <span class="logo-icon">🛒</span>
        <h1>SmartProcure</h1>
        <p>Procurement Management Platform</p>
      </div>

      <button class="ms-login-btn" @click="handleLogin" :disabled="loading">
        <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
          <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
          <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
          <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
          <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
        </svg>
        {{ loading ? 'Signing in...' : 'Sign in with Microsoft' }}
      </button>

      <p v-if="error" class="error-msg">{{ error }}</p>

      <div class="test-users">
        <p>Test Accounts:</p>
        <span>admin@ravichandrankarthikagmail.onmicrosoft.com</span>
        <span>qs@ravichandrankarthikagmail.onmicrosoft.com</span>
        <span>accounts@ravichandrankarthikagmail.onmicrosoft.com</span>
        <span>readonly@ravichandrankarthikagmail.onmicrosoft.com</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { loginRequest } from '../config/authConfig';
import { msalInstance, initMsal, consumeRedirectResult, getLastRedirectError } from '../auth/msal';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.store';
import { roleLandingPath } from '../router';

const router    = useRouter();
const authStore = useAuthStore();
const loading   = ref(false);
const error     = ref(null);

const POPUP_TIMEOUT_MS = 20000;

const completeSignin = async (result) => {
  const token = result.idToken;
  const email = result.account.username;
  const name  = result.account.name;

  // Send token to backend to get role
  const res = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`/api/me returned ${res.status}`);
  const data = await res.json();

  authStore.setUser({ name, email, role: data.role, token });

  // Route based on role. Unknown roles fall through to /unauthorised.
  router.push(roleLandingPath[data.role] || '/unauthorised');
};

// Strip MSAL's state/code/session fragment from the URL so a page reload
// doesn't retrigger handleRedirectPromise with a consumed nonce — the
// classic cause of the `no_token_request_cache_error` loop.
const stripAuthHash = () => {
  const hash = window.location.hash || '';
  if (/(^#|&)(code|state|error|id_token|access_token)=/.test(hash)) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
};

onMounted(async () => {
  try {
    await initMsal();

    // initMsal() swallows handleRedirectPromise failures so the singleton
    // stays usable. Surface the error here instead.
    const redirectErr = getLastRedirectError();
    if (redirectErr) {
      stripAuthHash();
      if (redirectErr.errorCode === 'no_token_request_cache_error') {
        error.value =
          'Sign-in state was lost during the redirect. ' +
          'Please click "Sign in" again — if this keeps happening, ' +
          'clear site data for this URL and retry.';
      } else {
        error.value = 'Login failed after redirect. ' +
          (redirectErr.errorMessage || redirectErr.message || redirectErr.errorCode || '');
      }
      return;
    }

    const redirectResult = consumeRedirectResult();
    if (!redirectResult) return;

    loading.value = true;
    error.value = null;
    await completeSignin(redirectResult);
    stripAuthHash();
  } catch (e) {
    console.error(e);
    stripAuthHash();
    error.value = 'Login failed after redirect. ' + (e?.errorMessage || e?.message || '');
  } finally {
    loading.value = false;
  }
});

const handleLogin = async () => {
  // Guard against double-clicks — a second loginPopup before the first
  // finishes is the classic trigger for `interaction_in_progress`.
  if (loading.value) return;

  loading.value = true;
  error.value   = null;
  try {
    // Safe to call repeatedly; it's a cached, resolved promise after
    // the first call in main.js.
    await initMsal();

    const popupResult = await Promise.race([
      msalInstance.loginPopup(loginRequest),
      new Promise((_, reject) => {
        setTimeout(() => reject({ errorCode: 'popup_local_timeout' }), POPUP_TIMEOUT_MS);
      })
    ]);

    await completeSignin(popupResult);

  } catch (e) {
    console.error(e);

    // Recover from a stuck MSAL interaction flag. Calling
    // handleRedirectPromise() clears the sessionStorage flag so the
    // next click can proceed.
    if (e?.errorCode === 'interaction_in_progress') {
      try { await msalInstance.handleRedirectPromise(); } catch { /* noop */ }
      error.value = 'Previous sign-in was interrupted. Please try again.';
    } else if (e?.errorCode === 'user_cancelled') {
      error.value = 'Sign-in cancelled.';
    } else if (e?.errorCode === 'timed_out' || e?.errorCode === 'monitor_window_timeout') {
      // Almost always: redirect URI isn't registered as SPA in Azure AD,
      // so the popup's post-back fails and we wait forever.
      await msalInstance.loginRedirect(loginRequest);
      return;
    } else if (e?.errorCode === 'popup_local_timeout') {
      // Popup can get stuck open due browser popup/session issues.
      // Fall back to redirect flow, which is more reliable.
      await msalInstance.loginRedirect(loginRequest);
      return;
    } else if (e?.errorCode === 'popup_window_error') {
      error.value = 'Popup was blocked. Allow popups for this site and try again.';
    } else {
      error.value = 'Login failed. ' + (e?.errorMessage || e?.message || '');
    }
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a365d 0%, #2d6a4f 100%);
}
.login-card {
  background: white;
  border-radius: 16px;
  padding: 48px 40px;
  width: 400px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  text-align: center;
}
.logo { margin-bottom: 32px; }
.logo-icon { font-size: 48px; }
.logo h1 { font-size: 28px; font-weight: 700; color: #1a365d; margin: 0; }
</style>