// Single MSAL client for the whole SPA.
//
// Why a singleton?
// PublicClientApplication stores an `interaction.status` flag in web
// storage while a popup/redirect is in flight. If a second `loginPopup`
// fires before the first finishes (HMR, double-click, popup blocked),
// MSAL throws `interaction_in_progress`. One shared instance keeps that
// state coherent across every component that touches MSAL.
//
// Why lazy construction?
// `new PublicClientApplication(msalConfig)` synchronously touches
// `window.crypto.subtle`, which browsers only expose in a secure context
// (HTTPS or http://localhost). Loading the SPA over plain HTTP (e.g.
// http://20.195.56.34/) would otherwise crash the entire bundle at
// import time with `crypto_nonexistent`, leaving a blank page. We defer
// construction into `initMsal()` so the rest of the app can render a
// friendly "HTTPS required" message instead.

import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { msalConfig } from '../config/authConfig';

// Live-binding export. Consumers that do `import { msalInstance } from ...`
// see the populated value after `initMsal()` succeeds. Guard for null at
// call sites — if MSAL couldn't initialise (no secure context, browser
// doesn't support Web Crypto, etc.), this stays null and the UI should
// surface the reason via `getMsalInitError()`.
export let msalInstance = null;

let initPromise = null;
let pendingRedirectResult = null;
let redirectResultConsumed = false;
let lastRedirectError = null;
let msalInitError = null;

/**
 * Idempotent async initializer.
 *
 * Call (and await) this at app startup AND at the top of any component
 * that may trigger auth. Subsequent calls return the cached promise, so
 * it's cheap to call repeatedly.
 *
 * Resolves to `true` on success, `false` if MSAL could not be
 * constructed (e.g. non-secure context). Never rejects — the caller can
 * inspect `getMsalInitError()` for diagnostics.
 *
 * If `handleRedirectPromise()` throws (e.g. no_token_request_cache_error
 * because the matching request state was lost across the Azure AD
 * round-trip), we swallow the error here rather than letting it poison
 * the singleton — otherwise every subsequent login attempt would inherit
 * the same rejected promise and the user could never recover without a
 * full reload. The caller can still observe the failure via the exposed
 * `getLastRedirectError()` getter.
 */
export function initMsal() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 1. Construct the client lazily. This is the step that can throw
    //    `crypto_nonexistent` when the page is served over plain HTTP.
    try {
      msalInstance = new PublicClientApplication(msalConfig);
      await msalInstance.initialize();
    } catch (err) {
      msalInitError = err;
      msalInstance = null;
      console.error('[msal] construction/initialize failed:', err);
      // Don't rethrow — let the UI decide how to degrade. LoginView
      // shows an HTTPS-required banner when isMsalAvailable() is false.
      return false;
    }

    // 2. Diagnostics: dump what we know when initMsal runs. This makes
    //    no_token_request_cache_error actually debuggable — we can see
    //    whether the URL has a hash, and whether any msal.* keys exist
    //    in storage before handleRedirectPromise consumes them.
    const hasAuthFragment = /(^#|&)(code|state|error|id_token|access_token)=/.test(window.location.hash || '');
    const msalLocalKeys   = Object.keys(window.localStorage   || {}).filter((k) => /msal/i.test(k));
    const msalSessionKeys = Object.keys(window.sessionStorage || {}).filter((k) => /msal/i.test(k));
    console.info('[msal] initMsal:', {
      url: window.location.href,
      isSecureContext: window.isSecureContext,
      hasAuthFragment,
      msalLocalKeys,
      msalSessionKeys,
    });

    // 3. Completes a redirect flow if we just came back from one, and
    //    clears any stale `interaction.status` flag from an aborted popup.
    try {
      pendingRedirectResult = await msalInstance.handleRedirectPromise();
      console.info('[msal] handleRedirectPromise resolved:',
        pendingRedirectResult ? 'result present' : 'no pending redirect');
    } catch (err) {
      lastRedirectError = err;
      pendingRedirectResult = null;
      console.error('[msal] handleRedirectPromise failed:', err);

      // Self-heal: `no_token_request_cache_error` means the URL contains
      // a state/code but the matching request isn't in storage. That's
      // almost always a stale/corrupt cache from an earlier aborted
      // redirect. Purge every MSAL key from both storages and strip the
      // URL hash so the next "Sign in" click starts from a clean slate.
      if (err?.errorCode === 'no_token_request_cache_error') {
        purgeMsalStorage();
        stripAuthHashFromUrl();
      }
      // Don't rethrow — keep the singleton usable so the user can click
      // "Sign in" again. LoginView surfaces the error via getLastRedirectError().
    }

    // 4. Restore the signed-in account on refresh if one is cached.
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length && !msalInstance.getActiveAccount()) {
      msalInstance.setActiveAccount(accounts[0]);
    }

    // 5. Keep the active account in sync with subsequent logins.
    msalInstance.addEventCallback((event) => {
      if (
        event.eventType === EventType.LOGIN_SUCCESS &&
        event.payload?.account
      ) {
        msalInstance.setActiveAccount(event.payload.account);
      }
    });

    return true;
  })();

  return initPromise;
}

/**
 * True iff MSAL was successfully constructed. Use this at UI entry
 * points to decide whether to render the "Sign in" button or a
 * fallback message.
 */
export function isMsalAvailable() {
  return msalInstance !== null && msalInitError === null;
}

/**
 * Returns the error from the construction/initialize step, or null.
 * Survives across calls so the UI can reference it while rendering.
 */
export function getMsalInitError() {
  return msalInitError;
}

/**
 * One-shot getter for the redirect result captured during initMsal().
 * Returns null on subsequent calls so we don't double-process.
 */
export function consumeRedirectResult() {
  if (redirectResultConsumed) return null;
  redirectResultConsumed = true;
  const result = pendingRedirectResult;
  pendingRedirectResult = null;
  return result;
}

/**
 * Returns (and clears) the last error thrown by handleRedirectPromise().
 * Lets the login view display an actionable message without coupling to
 * the singleton's internal state.
 */
export function getLastRedirectError() {
  const err = lastRedirectError;
  lastRedirectError = null;
  return err;
}

// -----------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------

// Remove every MSAL-owned key from both localStorage and sessionStorage.
// MSAL keys are prefixed with "msal." or contain the client GUID — we
// match both to be safe across versions. Cookies set by
// `storeAuthStateInCookie: true` are cleared by expiring them.
function purgeMsalStorage() {
  const isMsalKey = (k) => /^msal\./.test(k) || k.includes('msal') || k.startsWith('{"');
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      const keys = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && isMsalKey(k)) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    }
    // Expire any msal.* cookies.
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (/^msal\./.test(name)) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  } catch (e) {
    console.warn('[msal] purgeMsalStorage failed:', e);
  }
}

// Drop the auth fragment from the URL so a page reload doesn't refeed
// the already-consumed nonce into handleRedirectPromise.
function stripAuthHashFromUrl() {
  try {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if (/(^#|&)(code|state|error|id_token|access_token)=/.test(hash) ||
        /[?&](code|state|error)=/.test(search)) {
      history.replaceState(null, '', window.location.pathname);
    }
  } catch (e) {
    console.warn('[msal] stripAuthHashFromUrl failed:', e);
  }
}
