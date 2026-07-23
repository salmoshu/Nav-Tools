<script setup lang="ts">
import { computed, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import WindowResizeHandles from './components/WindowResizeHandles.vue'
import Dashboard from './components/Dashboard.vue'
import CardWindow from './components/CardWindow.vue'
import emitter from '@/hooks/useMitt'
import { useApplicationSelector } from '@/composables/useApplicationSelector'

interface FullscreenPanelContext {
  title: string
  action?: string
}

const maximized = ref(false)
const dashboardRef = ref<InstanceType<typeof Dashboard> | null>(null)
const fullscreenPanel = ref<FullscreenPanelContext>()
const isCardWindow = computed(() => window.location.hash.startsWith('#card/'))
const { currentApplication } = useApplicationSelector()

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

  return currentApplication.value?.name
})

const openApplicationSelector = () => emitter.emit('open-application-selector')
const exitPanelFullscreen = () => dashboardRef.value?.exitFullScreen()
const handleFullscreenPanelChange = (panel?: FullscreenPanelContext) => {
  fullscreenPanel.value = panel
}
</script>

<template>
  <div class="app-shell">
    <WindowResizeHandles v-if="!maximized" />
    <AppHeader
      :brand-title="isCardWindow ? contextTitle : 'Nav-Tools'"
      :context-title="isCardWindow ? undefined : contextTitle"
      :context-panel-title="fullscreenPanel?.title"
      :context-icon-action="fullscreenPanel?.action"
      :show-application-selector="!isCardWindow"
      :show-detached-controls="isCardWindow"
      :show-panel-fullscreen-exit="Boolean(fullscreenPanel)"
      @open-application-selector="openApplicationSelector"
      @exit-panel-fullscreen="exitPanelFullscreen"
      @maximized-change="maximized = $event"
    />
    <main class="app-content">
      <CardWindow v-if="isCardWindow" />
      <Dashboard
        v-else
        ref="dashboardRef"
        :initial-application-id="applicationId"
        @fullscreen-panel-change="handleFullscreenPanelChange"
      />
    </main>
  </div>
</template>

<style>
:root {
  --app-header-height: 38px;
  --app-toolbar-size: 40px;
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
