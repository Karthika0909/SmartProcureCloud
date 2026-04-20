// MSAL configuration for Azure AD SPA auth.
//
// redirectUri resolution order:
//   1. VITE_AAD_REDIRECT_URI (baked in at build time, e.g. http://4.240.x.x/)
//   2. http://localhost:5173/ in `vite` dev
//   3. window.location.origin otherwise (production fallback — works as long
//      as the current origin is registered as an SPA redirect URI in Azure AD)

const envRedirectUri = import.meta.env.VITE_AAD_REDIRECT_URI;
const defaultRedirectUri = import.meta.env.DEV
  ? 'http://localhost:5173/'
  : window.location.origin;

export const msalConfig = {
  auth: {
    clientId:    '3ea48b59-7c9b-487e-8e90-ade7b7a0caa2',
    authority:   'https://login.microsoftonline.com/98587403-b531-456c-8d95-84d5d6845a6a',
    redirectUri: envRedirectUri || defaultRedirectUri,
    postLogoutRedirectUri:     envRedirectUri || defaultRedirectUri,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    // localStorage (vs sessionStorage) survives new-tab / new-window
    // post-redirect navigation. Without this, Azure AD can redirect back
    // into a context that can't see the cached request, producing
    // `no_token_request_cache_error` from handleRedirectPromise().
    cacheLocation: 'localStorage',
    // `storeAuthStateInCookie` is only needed for IE11 / legacy Edge.
    // On modern Chromium/Firefox it can confuse MSAL's cache lookup
    // when cookies and localStorage disagree — leave it off.
    storeAuthStateInCookie: false,
  },
  system: {
    // Verbose MSAL logs to the browser console. Quiet this down to
    // `Warning` once you're past the cache-error debugging phase.
    loggerOptions: {
      loggerCallback: (level, message) => console.log(`[msal] ${message}`),
      piiLoggingEnabled: false,
      logLevel: 3, // 0=Error, 1=Warning, 2=Info, 3=Verbose
    },
  },
};

// Scopes requested at interactive login. openid/profile/email are the
// minimum set needed to get an id_token with the user's name + email,
// which the backend uses to look up the role.
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};
