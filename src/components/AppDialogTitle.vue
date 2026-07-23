<template>
  <div class="app-dialog-heading">
    <span class="app-dialog-heading__icon" aria-hidden="true">
      <el-icon :size="19"><component :is="icon" /></el-icon>
    </span>
    <span class="app-dialog-heading__copy">
      <strong>{{ title }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  title: string
  description?: string
}>()
</script>

<style scoped>
.app-dialog-heading {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 11px;
  text-align: left;
}

.app-dialog-heading__icon {
  display: grid;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 11%, var(--app-surface));
  place-items: center;
}

.app-dialog-heading__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.app-dialog-heading strong {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.2;
}

.app-dialog-heading small {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 460px) {
  .app-dialog-heading small {
    display: none;
  }
}
</style>
