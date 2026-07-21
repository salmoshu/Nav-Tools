<template>
  <div
    v-for="edge in edges"
    :key="edge"
    class="resize-handle"
    :class="`resize-${edge}`"
    @mousedown="startResize(edge, $event)"
  />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { getBrowserWindowService } from '@/core/window/browserWindowService'
import type { WindowResizeEdge } from '@/core/window/WindowService'

const edges: WindowResizeEdge[] = [
  'top', 'right', 'bottom', 'left',
  'top-left', 'top-right', 'bottom-left', 'bottom-right',
]

let resizing = false
const windowService = getBrowserWindowService()

async function stopResize() {
  if (!resizing) return
  resizing = false
  await windowService.stopResize()
}

async function startResize(edge: WindowResizeEdge, event: MouseEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  resizing = true
  await windowService.startResize(edge)
}

onMounted(() => {
  window.addEventListener('mouseup', stopResize)
  window.addEventListener('blur', stopResize)
})

onUnmounted(() => {
  window.removeEventListener('mouseup', stopResize)
  window.removeEventListener('blur', stopResize)
  void stopResize()
})
</script>

<style scoped>
.resize-handle {
  position: fixed;
  z-index: 7000;
  -webkit-app-region: no-drag;
}

.resize-top,
.resize-bottom {
  left: 6px;
  right: 6px;
  height: 5px;
  cursor: ns-resize;
}

.resize-left,
.resize-right {
  top: 6px;
  bottom: 6px;
  width: 5px;
  cursor: ew-resize;
}

.resize-top { top: 0; }
.resize-bottom { bottom: 0; }
.resize-left { left: 0; }
.resize-right { right: 0; }

.resize-top-left,
.resize-top-right,
.resize-bottom-left,
.resize-bottom-right {
  width: 9px;
  height: 9px;
}

.resize-top-left { top: 0; left: 0; cursor: nwse-resize; }
.resize-top-right { top: 0; right: 0; cursor: nesw-resize; }
.resize-bottom-left { bottom: 0; left: 0; cursor: nesw-resize; }
.resize-bottom-right { right: 0; bottom: 0; cursor: nwse-resize; }
</style>
