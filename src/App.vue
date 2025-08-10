<script setup lang="ts">
import { computed } from 'vue'
import Dashboard from './components/Dashboard.vue'
import CardWindow from './components/CardWindow.vue'

const isCardWindow = computed(() => {
  return window.location.hash.startsWith('#card/')
})
</script>

<template>
  <CardWindow v-if="isCardWindow" />
  <Dashboard v-else />
</template>

<style>
/* Hello World */
/* .flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo.electron:hover {
  filter: drop-shadow(0 0 2em #9FEAF9);
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
} */
</style>
