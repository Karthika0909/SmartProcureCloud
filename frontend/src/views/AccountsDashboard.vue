<template>
  <div class="dashboard accounts">
    <header>
      <h1>🛒 SmartProcure</h1>
      <div class="user-info">
        <span class="role-badge accounts-badge">💼 Accounts</span>
        <span>{{ authStore.user?.name }}</span>
        <button @click="logout">Logout</button>
      </div>
    </header>
    <main>
      <h2>Accounts Dashboard</h2>
      <p>Welcome {{ authStore.user?.name }}. Process invoices, payments, and vendor reconciliations.</p>
      <div class="cards">
        <div class="card"><h3>🧾 Invoices</h3><p>Vendor invoices &amp; GRN matching</p></div>
        <div class="card"><h3>💳 Payments</h3><p>Schedule &amp; track payouts</p></div>
        <div class="card"><h3>📒 Reconciliation</h3><p>Vendor ledger reconciliation</p></div>
        <div class="card"><h3>📦 Purchase Orders</h3><p>View approved orders</p></div>
        <div class="card"><h3>🧮 Tax / GST</h3><p>GST filings &amp; TDS</p></div>
        <div class="card"><h3>📊 Financial Reports</h3><p>Aging, cashflow, outstanding</p></div>
      </div>
    </main>
  </div>
</template>
<script setup>
import { useAuthStore } from '../stores/auth.store';
import { useRouter }    from 'vue-router';
const authStore = useAuthStore();
const router    = useRouter();
const logout = () => { authStore.logout(); router.push('/login'); };
</script>
<style scoped>
.dashboard { min-height: 100vh; background: #faf5ff; }
header { background: #6b46c1; color: white; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; }
header h1 { margin: 0; font-size: 22px; }
.user-info { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.role-badge { padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 12px; }
.accounts-badge { background: #e9d8fd; color: #553c9a; }
button { padding: 6px 16px; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; cursor: pointer; }
main { padding: 32px; }
main h2 { font-size: 24px; color: #6b46c1; margin-bottom: 8px; }
main p  { color: #718096; margin-bottom: 24px; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.card h3 { margin: 0 0 8px; color: #2d3748; }
.card p  { margin: 0; color: #718096; font-size: 14px; }
</style>
