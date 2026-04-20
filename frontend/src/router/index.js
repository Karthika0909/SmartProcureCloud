import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.store';

import LoginView         from '../views/LoginView.vue';
import AdminDashboard    from '../views/AdminDashboard.vue';
import QsDashboard       from '../views/QsDashboard.vue';
import AccountsDashboard from '../views/AccountsDashboard.vue';
import ReadonlyDashboard from '../views/ReadonlyDashboard.vue';
import UnauthorisedView  from '../views/UnauthorisedView.vue';

const routes = [
  { path: '/',             redirect: '/login' },
  { path: '/login',        component: LoginView },
  { path: '/unauthorised', component: UnauthorisedView },
  {
    path:      '/dashboard/admin',
    component: AdminDashboard,
    meta: { requiresAuth: true, role: 'Admin' }
  },
  {
    path:      '/dashboard/qs',
    component: QsDashboard,
    meta: { requiresAuth: true, role: 'qs' }
  },
  {
    path:      '/dashboard/accounts',
    component: AccountsDashboard,
    meta: { requiresAuth: true, role: 'accounts' }
  },
  {
    path:      '/dashboard/readonly',
    component: ReadonlyDashboard,
    meta: { requiresAuth: true, role: 'readonly' }
  }
];

// Map role returned by /api/me → landing path.
// Exported so LoginView (and anything else that needs to dispatch)
// doesn't hard-code the mapping in multiple places.
export const roleLandingPath = {
  Admin:    '/dashboard/admin',
  qs:       '/dashboard/qs',
  accounts: '/dashboard/accounts',
  readonly: '/dashboard/readonly'
};

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  authStore.initFromSession();

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next('/login');
  }
  if (to.meta.role && authStore.role !== to.meta.role) {
    return next('/unauthorised');
  }
  next();
});

export default router;
