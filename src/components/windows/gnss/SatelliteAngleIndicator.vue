<template>
  <span v-if="angle !== null" class="sat-angle">
    <span
      aria-hidden="true"
      class="sat-angle-diagram"
      :class="[
        `sat-angle-diagram--${kind}`,
        { 'sat-angle-diagram--below-horizon': kind === 'elevation' && angle < 0 },
      ]"
      :style="{
        '--sector-start': `${kind === 'elevation' ? 90 - Math.abs(angle) : 0}deg`,
        '--sector-sweep': `${Math.abs(angle)}deg`,
      }"
    >
      <i class="sat-angle-sector" />
      <i class="sat-angle-reference" />
      <i class="sat-angle-ray" />
    </span>
    <span>{{ Number(angle.toFixed(1)) }}°</span>
  </span>
  <span v-else class="sat-angle-unavailable">—</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  kind: 'elevation' | 'azimuth'
  value: number
  known?: boolean
}>()

const angle = computed(() => {
  if (props.known === false || !Number.isFinite(props.value)) return null
  if (props.kind === 'azimuth') return ((props.value % 360) + 360) % 360
  return Math.max(-90, Math.min(90, props.value))
})
</script>

<style scoped>
.sat-angle {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-sm);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.sat-angle-diagram {
  --axis-color: color-mix(in srgb, var(--app-text-secondary) 63%, transparent);
  --ray-color: var(--el-color-primary);
  --sector-color: color-mix(in srgb, var(--ray-color) 37%, transparent);
  display: inline-block;
  position: relative;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
}

.sat-angle-sector,
.sat-angle-reference,
.sat-angle-ray {
  display: block;
  position: absolute;
  box-sizing: border-box;
}

.sat-angle-sector {
  background-image: conic-gradient(
    from var(--sector-start) at var(--sector-origin, 50% 50%),
    var(--sector-color) 0deg var(--sector-sweep),
    transparent var(--sector-sweep) 360deg
  );
}

.sat-angle-ray {
  width: 9px;
  height: 1.5px;
  border-radius: 2px;
  background: var(--ray-color);
  top: calc(50% - 0.75px);
  transform-origin: 0 50%;
}

.sat-angle-ray::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: inherit;
  transform: translate(50%, -50%);
}

.sat-angle-diagram--elevation {
  --quarter-inset: 4px;
  --sector-origin: 0% 100%;
}

.sat-angle-diagram--below-horizon {
  transform: scaleY(-1);
}

.sat-angle-diagram--elevation .sat-angle-reference,
.sat-angle-diagram--elevation .sat-angle-sector {
  inset: var(--quarter-inset);
  border-radius: 0 100% 0 0;
}

.sat-angle-diagram--elevation .sat-angle-reference,
.sat-angle-diagram--azimuth .sat-angle-reference {
  border: 1px solid var(--axis-color);
}

.sat-angle-diagram--elevation .sat-angle-ray {
  left: var(--quarter-inset);
  top: calc(100% - var(--quarter-inset) - 0.75px);
  width: 14px;
  transform: rotate(calc(0deg - var(--sector-sweep)));
}

.sat-angle-diagram--azimuth .sat-angle-reference,
.sat-angle-diagram--azimuth .sat-angle-sector {
  inset: 1px;
  border-radius: 50%;
}

.sat-angle-diagram--azimuth .sat-angle-reference::before {
  content: '';
  position: absolute;
  top: 0;
  left: calc(50% - 0.5px);
  height: 3px;
  border-left: 1px solid var(--axis-color);
}

.sat-angle-diagram--azimuth .sat-angle-ray {
  left: 50%;
  transform: rotate(calc(var(--sector-sweep) - 90deg));
}

.sat-angle-unavailable {
  color: var(--app-text-muted);
}
</style>
