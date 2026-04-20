<template>
  <div class="unauth">
    <div class="card">
      <div class="icon">🚫</div>
      <h1>Access Denied</h1>
      <p>You do not have permission to access this page.</p>
      <button @click="router.push('/login')">Back to Login</button>
    </div>
  </div>
</template>
<script setup>
import { useRouter } from 'vue-router';
const router = useRouter();
</script>
<style scoped>
.unauth { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #fff5f5; }
.card { text-align: center; background: white; padding: 48px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
.icon { font-size: 64px; margin-bottom: 16px; }
h1 { color: #c53030; margin-bottom: 8px; }
p  { color: #718096; margin-bottom: 24px; }
button { padding: 10px 24px; background: #c53030; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; }
</style>
