<template>
  <div class="login-wrapper">
    <div class="login-card">
      <div class="logo">
        <span class="logo-icon">SP</span>
        <h1>SmartProcure</h1>
        <p>Procurement Management Platform</p>
      </div>

      <!--
        Secure-context / MSAL-unavailable banner.
        Shown when the page is served over plain HTTP from a non-localhost
        origin, because browsers only expose window.crypto.subtle (which
        MSAL needs for PKCE) in a secure context. Without this guard the
        whole SPA crashes with `crypto_nonexistent` at import time and
        the user sees a blank page.
      -->
      <div v-if="!msalReady" class="insecure-banner">
        <strong>Sign-in unavailable over plain HTTP.</strong>
        <p>
          Microsoft Entra ID (Azure AD) requires a secure context for PKCE
          sign-in, which means HTTPS or <code>http://localhost</code>.
          This page is currently served over plain HTTP, so the Web Crypto
          APIs MSAL depends on are blocked by the browser.
        </p>
        <p class="insecure-howto">
          To try sign-in, either:
        </p>
        <ul>
          <li>Run the SPA locally at <code>http://localhost:5173/</code>, or</li>
          <li>Put an HTTPS ingress (e.g. ingress-nginx + cert-manager with Let's Encrypt on a nip.io hostname) in front of this cluster and register the HTTPS URL as an SPA redirect URI in Azure AD.</li>
        </ul>
        <p v-if="msalInitErrorMsg" class="diag">
          <small>Diagnostic: {{ msalInitErrorMsg }}</small>
        </p>
      </div>

      <template v-else>
        <p class="login-help">
          Sign-in happens on Microsoft's secure page.
          Enter your username and password after clicking the button below.
        </p>

        <button class="ms-login-btn" @click="handleLogin" :disabled="loading">
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
          {{ loading ? 'Signing in...' : 'Sign in with Microsoft' }}
        </button>

        <p v-if="loading" class="status-msg">
          Waiting for Microsoft sign-in to complete...
        </p>

        <p v-if="error" class="error-msg">{{ error }}</p>
      </template>

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
import {
  msalInstance,
  initMsal,
  consumeRedirectResult,
  getLastRedirectError,
  isMsalAvailable,
  getMsalInitError,
} from '../auth/msal';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.store';
import { roleLandingPath } from '../router';

const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const error = ref(null);

// Reactive mirrors of the MSAL readiness state. Set after initMsal() so
// the template can show either the Sign-In button or the HTTPS-required
// banner.
const msalReady = ref(false);
const msalInitErrorMsg = ref('');

const POPUP_TIMEOUT_MS = 20000;

const completeSignin = async (result) => {
  const token = result.idToken;
  const email = result.account.username;
  const name = result.account.name;

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
// doesn't retrigger handleRedirectPromise with a consumed nonce - the
// classic cause of the `no_token_request_cache_error` loop.
const stripAuthHash = () => {
  const hash = window.location.hash || '';
  if (/(^#|&)(code|state|error|id_token|access_token)=/.test(hash)) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
};

onMounted(async () => {
  try {
    // initMsal() resolves false (not rejects) when MSAL can't be
    // constructed — e.g. no secure context. Mirror the result into the
    // template so we render the right half.
    await initMsal();
    msalReady.value = isMsalAvailable();

    if (!msalReady.value) {
      const initErr = getMsalInitError();
      msalInitErrorMsg.value =
        initErr?.errorCode
          ? `${initErr.errorCode}${initErr.errorMessage ? ': ' + initErr.errorMessage : ''}`
          : (initErr?.message || 'Unknown MSAL initialization error');
      return;
    }

    // initMsal() swallows handleRedirectPromise failures so the singleton
    // stays usable. Surface the error here instead.
    const redirectErr = getLastRedirectError();
    if (redirectErr) {
      stripAuthHash();
      if (redirectErr.errorCode === 'no_token_request_cache_error') {
        error.value =
          'Sign-in state was lost during the redirect. ' +
          'Please click "Sign in" again - if this keeps happening, ' +
          'clear site data for this URL and retry.';
      } else {
        error.value =
          'Login failed after redirect. ' +
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
  // Guard against double-clicks - a second loginPopup before the first
  // finishes is the classic trigger for `interaction_in_progress`.
  if (loading.value) return;

  // Extra guard: if MSAL never came up (e.g. insecure context, see the
  // banner in the template), bail early with a useful message instead
  // of dereferencing a null instance.
  if (!isMsalAvailable() || !msalInstance) {
    error.value = 'Sign-in is unavailable in this context. See the notice above.';
    return;
  }

  loading.value = true;
  error.value = null;
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
      try {
        await msalInstance.handleRedirectPromise();
      } catch {
        // noop
      }
      error.value = 'Previous sign-in was interrupted. Please try again.';
    } else if (e?.errorCode === 'user_cancelled') {
      error.value = 'Sign-in cancelled.';
    } else if (
      e?.errorCode === 'timed_out' ||
      e?.errorCode === 'monitor_window_timeout' ||
      e?.errorCode === 'popup_local_timeout'
    ) {
      // Popup opened but never posted back (redirect URI not registered
      // as SPA in Azure AD, popup blocker, cross-origin messaging issue).
      // MSAL still thinks the popup interaction is in-flight, so we must
      // clear that flag before we can start a redirect - otherwise MSAL
      // throws `interaction_in_progress`.
      try {
        await msalInstance.handleRedirectPromise();
      } catch {
        // noop
      }
      // handleRedirectPromise() doesn't always clear the flag if there
      // was no hash to consume. Wipe the status key manually as a
      // belt-and-braces - this is the key MSAL writes during interaction.
      try {
        window.sessionStorage.removeItem('msal.interaction.status');
      } catch {
        // noop
      }
      try {
        window.localStorage.removeItem('msal.interaction.status');
      } catch {
        // noop
      }
      await msalInstance.loginRedirect(loginRequest);
      return;
    } else if (e?.errorCode === 'popup_window_error') {
      error.value = 'Popup was blocked. Allow popups for this site and try again.';
    } else {
      error.value = 'Login failed. ' + (e?.errorMessage || e?.message || e?.errorCode || '');
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
  background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.login-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  padding: 40px 36px 32px;
  max-width: 460px;
  width: 100%;
}

.logo {
  text-align: center;
  margin-bottom: 24px;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: #1a365d;
  color: #fff;
  font-weight: 700;
  font-size: 22px;
  border-radius: 12px;
  margin-bottom: 12px;
}

.logo h1 {
  margin: 0;
  font-size: 22px;
  color: #1a202c;
}

.logo p {
  margin: 4px 0 0;
  color: #718096;
  font-size: 14px;
}

.login-help {
  font-size: 14px;
  color: #4a5568;
  margin: 0 0 16px;
  text-align: center;
}

.ms-login-btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 16px;
  background: #ffffff;
  color: #1a202c;
  border: 1px solid #cbd5e0;
  border-radius: 6px;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}

.ms-login-btn:hover:not(:disabled) {
  background: #f7fafc;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.ms-login-btn:disabled {
  opacity: 0.7;
  cursor: progress;
}

.status-msg {
  text-align: center;
  color: #4a5568;
  font-size: 13px;
  margin: 12px 0 0;
}

.error-msg {
  background: #fff5f5;
  border: 1px solid #fc8181;
  color: #9b2c2c;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin: 16px 0 0;
}

.insecure-banner {
  background: #fffaf0;
  border: 1px solid #f6ad55;
  color: #744210;
  padding: 14px 16px;
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.55;
  margin-bottom: 20px;
}

.insecure-banner strong {
  display: block;
  font-size: 14.5px;
  margin-bottom: 6px;
}

.insecure-banner p {
  margin: 6px 0;
}

.insecure-banner .insecure-howto {
  margin-top: 8px;
  font-weight: 600;
}

.insecure-banner ul {
  margin: 6px 0 8px;
  padding-left: 20px;
}

.insecure-banner code {
  background: #fefcbf;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 12.5px;
}

.insecure-banner .diag {
  margin-top: 10px;
  color: #975a16;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.test-users {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed #e2e8f0;
  font-size: 12px;
  color: #4a5568;
}

.test-users p {
  margin: 0 0 6px;
  font-weight: 600;
}

.test-users span {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #2d3748;
}
</style>
