<script setup lang="ts">
import { computed, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import WindowResizeHandles from './components/WindowResizeHandles.vue'
import Dashboard from './components/Dashboard.vue'
import CardWindow from './components/CardWindow.vue'
import emitter from '@/hooks/useMitt'

const maximized = ref(false)
const isCardWindow = computed(() => window.location.hash.startsWith('#card/'))

const applicationId = computed(() => {
  const match = window.location.hash.match(/^#app\/([^/?]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
})

const contextTitle = computed(() => {
  if (isCardWindow.value) {
    try {
      const payload = JSON.parse(decodeURIComponent(window.location.hash.slice('#card/'.length)))
      return typeof payload.title === 'string' ? payload.title : 'Panel'
    } catch {
      return 'Panel'
    }
  }

  if (applicationId.value) {
    try {
      const applications = JSON.parse(localStorage.getItem('nav-tools:custom-applications') ?? '[]')
      return (
        applications.find((application: { id?: string }) => application.id === applicationId.value)
          ?.name ?? 'Application'
      )
    } catch {
      return 'Application'
    }
  }
  return undefined
})

const openApplicationSelector = () => emitter.emit('open-application-selector')
</script>

<template>
  <div class="app-shell">
    <WindowResizeHandles v-if="!maximized" />
    <AppHeader
      :context-title="contextTitle"
      :show-application-selector="!isCardWindow"
      :show-detached-controls="isCardWindow"
      @open-application-selector="openApplicationSelector"
      @maximized-change="maximized = $event"
    />
    <main class="app-content">
      <CardWindow v-if="isCardWindow" />
      <Dashboard v-else :initial-application-id="applicationId" />
    </main>
  </div>
</template>

<style>
:root {
  --app-header-height: 38px;
}

.app-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: var(--app-text);
  background: var(--app-bg);
}

.app-content {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
