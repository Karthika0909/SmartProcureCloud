// Single MSAL client for the whole SPA.
//
// Why a singleton?
// PublicClientApplication stores an `interaction.status` flag in web
// storage while a popup/redirect is in flight. If a second `loginPopup`
// fires before the first finishes (HMR, double-click, popup blocked),
// MSAL throws `interaction_in_progress`. One shared instance keeps that
// state coherent across every component that touches MSAL.

import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { msalConfig } from '../config/authConfig';

export const msalInstance = new PublicClientApplication(msalConfig);

let initPromise = null;
let pendingRedirectResult = null;
let redirectResultConsumed = false;

/**
 * Idempotent async initializer.
 *
 * Call (and await) this at app startup AND at the top of any component
 * that may trigger auth. Subsequent calls return the cached promise, so
 * it's cheap to call repeatedly.
 *
 * If `handleRedirectPromise()` throws (e.g. no_token_request_cache_error
 * because the matching request state was lost across the Azure AD
 * round-trip), we swallow the error here rather than letting it poison
 * the singleton — otherwise every subsequent login attempt would inherit
 * the same rejected promise and the user could never recover without a
 * full reload. The caller can still observe the failure via the exposed
 * `lastRedirectError` getter.
 */
let lastRedirectError = null;

export function initMsal() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await msalInstance.initialize();

    // Completes a redirect flow if we just came back from one, and
    // clears any stale `interaction.status` flag from an aborted popup.
    try {
      pendingRedirectResult = await msalInstance.handleRedirectPromise();
    } catch (err) {
      lastRedirectError = err;
      pendingRedirectResult = null;
      // Don't rethrow — keep the singleton usable so the user can click
      // "Sign in" again. LoginView surfaces the error via getLastRedirectError().
      console.error('[msal] handleRedirectPromise failed:', err);
    }

    // Restore the signed-in account on refresh if one is cached.
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length && !msalInstance.getActiveAccount()) {
      msalInstance.setActiveAccount(accounts[0]);
    }

    // Keep the active account in sync with subsequent logins.
    msalInstance.addEventCallback((event) => {
      if (
        event.eventType === EventType.LOGIN_SUCCESS &&
        event.payload?.account
      ) {
        msalInstance.setActiveAccount(event.payload.account);
      }
    });
  })();

  return initPromise;
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
