<template>
  <div class="card-window">
    <component
      v-if="cardComponent"
      :is="cardComponent"
      v-bind="cardProps"
    />
    <div v-else-if="loadError" class="load-error">
      <p class="message">{{ t('app.cardWindow.loadFailed') }}</p>
      <p class="detail">{{ loadError }}</p>
      <button class="close-btn" @click="closeWindow">{{ t('app.cardWindow.close') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { markRaw, onMounted, onUnmounted, ref } from 'vue'
import type { Component } from 'vue'
import { routeDataToWindow } from '@/hooks/useDevice'
import { t } from '@/i18n'

// 构建后动态 import 的路径会被打包成哈希文件名，
// 因此用 import.meta.glob 预扫描所有组件，运行时按键查找
const modules = import.meta.glob([
  './windows/common/*.vue',
  './windows/gnss/*.vue',
  './windows/motor/*.vue',
])

const cardComponent = ref<Component | null>(null)
const cardProps = ref<Record<string, any>>({})
const cardTitle = ref('Card Window')
const cardWindowId = ref<string | undefined>(undefined)
const loadError = ref('')

onMounted(async () => {
  const hash = window.location.hash.slice(1) // 移除 #
  if (!hash.startsWith('card/')) {
    loadError.value = t('app.cardWindow.invalidAddress')
    return
  }

  try {
    const encodedData = hash.slice(5) // 移除 'card/'
    const decodedData = JSON.parse(decodeURIComponent(encodedData))
    const { componentName, props, title, windowId } = decodedData
    cardWindowId.value = windowId

    // componentName 为面板类型名，组件实际位于对应的分类目录中。
    const loader =
      modules[`./${componentName}.vue`] ??
      Object.entries(modules).find(([path]) =>
        path.endsWith(`/${componentName}.vue`)
      )?.[1]

    if (!loader) {
      loadError.value = t('app.cardWindow.componentNotFound', { v: componentName })
      return
    }

    const component = await loader()
    cardComponent.value = markRaw((component as any).default || component)
    cardProps.value = props || {}
    cardTitle.value = title || 'Card Window'
  } catch (error) {
    console.error('Error loading card component:', error)
    loadError.value = error instanceof Error ? error.message : String(error)
  }
})

// 接收主窗口广播的实时数据并路由到当前独立窗口的组件
const incomingDataListener = (_event: unknown, data: unknown) => {
  if (typeof data === 'string' && cardWindowId.value) {
    routeDataToWindow(data, cardWindowId.value)
  }
}
window.ipcRenderer?.on('incoming-data', incomingDataListener)
onUnmounted(() => {
  window.ipcRenderer?.off('incoming-data', incomingDataListener)
})

function closeWindow() {
  void window.electronAPI?.closeWindow()
}
</script>

<style scoped>
.card-window {
  width: 100%;
  height: 100%;
  overflow: auto;
  color: var(--app-text);
  background: var(--app-surface);
}

.load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--app-text-muted);
}

.load-error .message {
  font-size: 16px;
  font-weight: 600;
  color: #d4380d;
}

.load-error .detail {
  font-size: 13px;
  word-break: break-all;
  padding: 0 20px;
}

.load-error .close-btn {
  margin-top: 8px;
  padding: 4px 16px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text);
  background: var(--app-surface);
  cursor: pointer;
}
</style>
