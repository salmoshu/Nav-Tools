<template>
  <div class="card-window">
    <div class="title-bar">
      <div class="title">{{ cardTitle }}</div>
      <button @click="closeWindow">×</button>
    </div>
    <component
      :is="cardComponent"
      v-bind="cardProps"
    />
  </div>
</template>

<script setup lang="ts">
import { markRaw, onMounted, ref } from 'vue'
import { componentMap } from '@/composables/useLayoutManager'
import type { Component } from 'vue'

const cardComponent = ref<Component | null>(null)
const cardProps = ref<Record<string, any>>({})
const cardTitle = ref('Card Window')

onMounted(() => {
  const hash = window.location.hash.slice(1) // 移除 #
  if (hash.startsWith('card/')) {
    try {
      const encodedData = hash.slice(5) // 移除 'card/'
      const decodedData = JSON.parse(decodeURIComponent(encodedData))
      const { componentName, props, title } = decodedData

      const component = componentMap[componentName as keyof typeof componentMap]
      
      if (component) {
        cardComponent.value = markRaw(component.component)
        cardProps.value = props || {}
        cardTitle.value = title || 'Card Window'
      }
    } catch (error) {
      console.error('Error parsing card data:', error)
    }
  }
})

function closeWindow() {
  window.ipcRenderer.send('close-card-window')
}
</script>

<style scoped>
.card-window {
  width: 100%;
  height: 100vh;
  overflow: auto;
  background: white; /* 或其他背景 */
  /* overflow: hidden; */
}

.title-bar {
  -webkit-app-region: drag;
  height: 30px;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
}

.title-bar button {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
}
</style>