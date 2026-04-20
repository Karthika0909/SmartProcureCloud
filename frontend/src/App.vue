<template>
  <router-view />
</template>

<script setup>
// Root shell — all screens live under the router (LoginView, AdminDashboard,
// ManagerDashboard, ViewerDashboard, UnauthorisedView). Global header/nav,
// if needed later, goes here above <router-view />.
</script>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
