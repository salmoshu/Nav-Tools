<template>
  <div class="card-window">
    <button
      v-if="cardComponent && cardWindowId"
      type="button"
      class="shortcut-button"
      :title="t('app.cardWindow.createShortcut')"
      @click="createShortcut"
    >
      <el-icon :size="14"><Pointer /></el-icon>
      <span>{{ t('app.cardWindow.createShortcut') }}</span>
    </button>
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
import { ElMessage } from 'element-plus'
import { Pointer } from '@element-plus/icons-vue'
import { routeDataToWindow } from '@/hooks/useDevice'
import { getWindowById } from '@/settings/config'
import { createComponentDesktopShortcut } from '@/core/panels/componentIcon'
import { t } from '@/i18n'

// 构建后动态 import 的路径会被打包成哈希文件名，
// 因此用 import.meta.glob 预扫描所有组件，运行时按键查找
const modules = import.meta.glob([
  './windows/common/*.vue',
  './windows/gnss/*.vue',
  './windows/motor/*.vue',
  './windows/lidar/*.vue',
  './windows/gnssraw/*.vue',
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
    // 快捷方式冷启动时主进程只有 i18n key,窗口标题在此修正为本地化组件名
    if (cardWindowId.value) {
      const definition = getWindowById(cardWindowId.value)
      if (definition) document.title = t(definition.title)
    }
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

/** 把当前组件固化成桌面快捷方式:双击直达本组件独立窗口 */
async function createShortcut(): Promise<void> {
  if (!cardWindowId.value) return
  const definition = getWindowById(cardWindowId.value)
  if (!definition) return
  try {
    await createComponentDesktopShortcut(definition.id, t(definition.title))
    ElMessage({
      message: t('app.cardWindow.shortcutCreated'),
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  } catch (error) {
    ElMessage({
      message: error instanceof Error ? error.message : String(error),
      type: 'error',
      placement: 'bottom-right',
      offset: 50,
    })
  }
}
</script>

<style scoped>
.card-window {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
  color: var(--app-text);
  background: var(--app-surface);
}
/* 创建桌面快捷方式:悬浮右上角,不占组件空间 */
.shortcut-button {
  position: absolute;
  top: 6px;
  right: 10px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text-secondary);
  background: var(--app-surface-muted);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}
.card-window:hover .shortcut-button,
.shortcut-button:focus-visible {
  opacity: 1;
}
.shortcut-button:hover {
  color: var(--app-text);
  border-color: var(--el-color-primary);
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
