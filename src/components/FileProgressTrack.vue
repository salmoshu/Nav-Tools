<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: number; label: string; compact?: boolean }>()
const percent = computed(() => Math.min(100, Math.max(0, props.value || 0)))
</script>

<template>
  <span class="file-progress-caption" aria-hidden="true">
    <span v-if="!compact">{{ label }}</span>
    <span class="file-progress-percent" :class="{ 'is-compact': compact }">
      {{ Math.round(percent) }}%
    </span>
  </span>
  <span
    class="file-progress-track"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(percent)"
    :style="{ '--file-progress': `${percent}%` }"
  ></span>
</template>

<style scoped>
.file-progress-caption {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-xs);
  white-space: nowrap;
}

.file-progress-percent {
  inline-size: 4.5ch;
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.file-progress-percent.is-compact {
  text-align: center;
}

.file-progress-track {
  display: block;
  width: var(--file-progress-width, clamp(120px, 24vw, 360px));
  height: 6px;
  min-width: 0;
  margin: 0 2px;
  border: 1px solid color-mix(in srgb, var(--app-border-strong) 76%, transparent);
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--el-color-primary) 0 var(--file-progress),
    var(--app-surface-muted) var(--file-progress) 100%
  );
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--app-shadow) 20%, transparent);
}
</style>
