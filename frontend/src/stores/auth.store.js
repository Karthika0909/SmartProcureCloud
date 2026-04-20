import { defineStore } from 'pinia';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user:  null,
    role:  null,
    token: null
  }),
  getters: {
    isAuthenticated: (s) => !!s.token,
    isAdmin:         (s) => s.role === 'Admin',
    isQs:            (s) => s.role === 'qs',
    isAccounts:      (s) => s.role === 'accounts',
    isReadonly:      (s) => s.role === 'readonly'
  },
  actions: {
    setUser({ name, email, role, token }) {
      this.user  = { name, email };
      this.role  = role;
      this.token = token;
      sessionStorage.setItem('sp_token', token);
      sessionStorage.setItem('sp_role',  role);
      sessionStorage.setItem('sp_user',  JSON.stringify({ name, email }));
    },
    initFromSession() {
      this.token = sessionStorage.getItem('sp_token');
      this.role  = sessionStorage.getItem('sp_role');
      const u    = sessionStorage.getItem('sp_user');
      this.user  = u ? JSON.parse(u) : null;
    },
    logout() {
      this.user  = null;
      this.role  = null;
      this.token = null;
      sessionStorage.clear();
    }
  }
});
