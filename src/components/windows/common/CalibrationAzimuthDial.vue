<template>
  <section
    class="azimuth-dial"
    :class="{ 'is-disabled': disabled, 'is-dragging': drag !== null }"
    role="group"
    :aria-label="`${label} · ${t('common.camera.calibration.azimuthDial')}`"
  >
    <svg class="azimuth-dial-face" viewBox="0 0 240 240">
      <circle class="azimuth-dial-ring" :cx="CENTER" :cy="CENTER" :r="RADIUS" />
      <g v-for="tick in ticks" :key="tick" class="azimuth-dial-tick" aria-hidden="true">
        <line
          :x1="point(tick, RADIUS + 2).x"
          :y1="point(tick, RADIUS + 2).y"
          :x2="point(tick, RADIUS + 8).x"
          :y2="point(tick, RADIUS + 8).y"
        />
      </g>
      <g
        v-for="mark in cardinalMarks"
        :key="mark.label"
        class="azimuth-dial-cardinal"
        aria-hidden="true"
      >
        <text :x="point(mark.angle, RADIUS + 23).x" :y="point(mark.angle, RADIUS + 23).y">
          {{ mark.label }}
        </text>
      </g>

      <path
        v-if="range.max > range.min"
        class="azimuth-sector"
        :d="sectorPath"
        role="slider"
        :tabindex="disabled ? undefined : 0"
        :aria-label="`${label} · ${t('common.camera.calibration.azimuthRotate')}`"
        :aria-valuemin="AZIMUTH_MIN_DEG"
        :aria-valuemax="AZIMUTH_MAX_DEG"
        :aria-valuenow="midpoint"
        :aria-valuetext="rangeText"
        :aria-disabled="disabled"
        @pointerdown="startDrag('move', $event)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="onRangeKeydown"
      />
      <line
        class="azimuth-sector-edge"
        :x1="CENTER"
        :y1="CENTER"
        :x2="startPoint.x"
        :y2="startPoint.y"
      />
      <line
        class="azimuth-sector-edge"
        :x1="CENTER"
        :y1="CENTER"
        :x2="endPoint.x"
        :y2="endPoint.y"
      />
      <circle class="azimuth-dial-hub" :cx="CENTER" :cy="CENTER" r="4" />

      <circle
        class="azimuth-handle azimuth-handle--start"
        :cx="startPoint.x"
        :cy="startPoint.y"
        r="9"
        role="slider"
        :tabindex="disabled ? undefined : 0"
        :aria-label="`${label} · ${t('common.camera.calibration.azimuthStart')}`"
        :aria-valuemin="AZIMUTH_MIN_DEG"
        :aria-valuemax="range.max"
        :aria-valuenow="range.min"
        :aria-disabled="disabled"
        @pointerdown="startDrag('min', $event)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="onEdgeKeydown('min', $event)"
      />
      <circle
        class="azimuth-handle azimuth-handle--end"
        :cx="endPoint.x"
        :cy="endPoint.y"
        r="9"
        role="slider"
        :tabindex="disabled ? undefined : 0"
        :aria-label="`${label} · ${t('common.camera.calibration.azimuthEnd')}`"
        :aria-valuemin="range.min"
        :aria-valuemax="AZIMUTH_MAX_DEG"
        :aria-valuenow="range.max"
        :aria-disabled="disabled"
        @pointerdown="startDrag('max', $event)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="onEdgeKeydown('max', $event)"
      />
    </svg>
    <div class="azimuth-dial-copy">
      <strong>{{ rangeText }}</strong>
      <span>{{ t('common.camera.calibration.azimuthSpan', { span: span.toFixed(1) }) }}</span>
      <small>{{ t('common.camera.calibration.azimuthDialHint') }}</small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AZIMUTH_MAX_DEG,
  AZIMUTH_MIN_DEG,
  clampAzimuth,
  normalizeAzimuthDelta,
  resizeAzimuthRange,
  shiftAzimuthRange,
  snapAzimuthDrag,
  type AzimuthRange,
} from '@/core/camera/CalibrationAzimuth'
import { t } from '@/i18n'

const props = withDefaults(
  defineProps<{
    min: number
    max: number
    disabled?: boolean
    label: string
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  'update:min': [value: number]
  'update:max': [value: number]
}>()

const CENTER = 120
const RADIUS = 82
const ticks = Array.from({ length: 12 }, (_, index) => -180 + index * 30)
const cardinalMarks = [
  { angle: 0, label: '0°' },
  { angle: 90, label: '90°' },
  { angle: 180, label: '±180°' },
  { angle: -90, label: '−90°' },
]

const range = computed<AzimuthRange>(() => ({
  min: clampAzimuth(Math.min(props.min, props.max)),
  max: clampAzimuth(Math.max(props.min, props.max)),
}))
const span = computed(() => range.value.max - range.value.min)
const midpoint = computed(() => Math.round(((range.value.min + range.value.max) / 2) * 10) / 10)
const rangeText = computed(() =>
  t('common.camera.calibration.azimuthRange', {
    min: range.value.min.toFixed(1),
    max: range.value.max.toFixed(1),
  }),
)

function point(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180
  return {
    x: CENTER + radius * Math.sin(radians),
    y: CENTER - radius * Math.cos(radians),
  }
}

const startPoint = computed(() => point(range.value.min, RADIUS))
const endPoint = computed(() => point(range.value.max, RADIUS))
const sectorPath = computed(() => {
  if (span.value >= 360) {
    return `M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER} ${CENTER + RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER} ${CENTER - RADIUS} Z`
  }
  const largeArc = span.value > 180 ? 1 : 0
  return `M ${CENTER} ${CENTER} L ${startPoint.value.x} ${startPoint.value.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${endPoint.value.x} ${endPoint.value.y} Z`
})

type DragKind = 'move' | 'min' | 'max'
const drag = ref<DragKind | null>(null)
let dragPointerId: number | null = null
let previousPointerAngle = 0
let rawDragRange: AzimuthRange = { min: 0, max: 0 }

function pointerAngle(event: PointerEvent): number {
  const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement
  if (!svg) return previousPointerAngle
  const bounds = svg.getBoundingClientRect()
  const scale = Math.min(bounds.width, bounds.height) / 240
  const centerX = bounds.left + (bounds.width - 240 * scale) / 2 + CENTER * scale
  const centerY = bounds.top + (bounds.height - 240 * scale) / 2 + CENTER * scale
  return (Math.atan2(event.clientX - centerX, centerY - event.clientY) * 180) / Math.PI
}

function updateRange(next: AzimuthRange): void {
  if (next.min !== props.min) emit('update:min', next.min)
  if (next.max !== props.max) emit('update:max', next.max)
}

function startDrag(kind: DragKind, event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return
  event.preventDefault()
  drag.value = kind
  dragPointerId = event.pointerId
  previousPointerAngle = pointerAngle(event)
  rawDragRange = { ...range.value }
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent): void {
  if (props.disabled || drag.value === null || event.pointerId !== dragPointerId) return
  const angle = pointerAngle(event)
  const delta = normalizeAzimuthDelta(angle - previousPointerAngle)
  previousPointerAngle = angle
  if (delta === 0) return
  rawDragRange =
    drag.value === 'move'
      ? shiftAzimuthRange(rawDragRange.min, rawDragRange.max, delta)
      : resizeAzimuthRange(
          rawDragRange.min,
          rawDragRange.max,
          drag.value,
          rawDragRange[drag.value] + delta,
        )
  // 显示值吸附到 5° 倍数，原始值继续跟随指针；越过吸附区后仍能自然离开。
  updateRange(snapAzimuthDrag(rawDragRange.min, rawDragRange.max, drag.value))
}

function endDrag(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId || drag.value === null) return
  const element = event.currentTarget as Element
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  updateRange(snapAzimuthDrag(rawDragRange.min, rawDragRange.max, drag.value, true))
  drag.value = null
  dragPointerId = null
}

function onRangeKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key)
    ? -1
    : ['ArrowRight', 'ArrowUp'].includes(event.key)
      ? 1
      : 0
  if (direction === 0) return
  event.preventDefault()
  const next = shiftAzimuthRange(
    range.value.min,
    range.value.max,
    direction * (event.shiftKey ? 25 : 5),
  )
  updateRange(snapAzimuthDrag(next.min, next.max, 'move', true))
}

function onEdgeKeydown(edge: 'min' | 'max', event: KeyboardEvent): void {
  if (props.disabled) return
  let value: number | undefined
  if (['ArrowLeft', 'ArrowDown'].includes(event.key)) {
    value = range.value[edge] - (event.shiftKey ? 25 : 5)
  } else if (['ArrowRight', 'ArrowUp'].includes(event.key)) {
    value = range.value[edge] + (event.shiftKey ? 25 : 5)
  } else if (event.key === 'Home') {
    value = edge === 'min' ? AZIMUTH_MIN_DEG : range.value.min
  } else if (event.key === 'End') {
    value = edge === 'min' ? range.value.max : AZIMUTH_MAX_DEG
  }
  if (value === undefined) return
  event.preventDefault()
  const next = resizeAzimuthRange(range.value.min, range.value.max, edge, value)
  updateRange(snapAzimuthDrag(next.min, next.max, edge, true))
}
</script>

<style scoped>
.azimuth-dial {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--ui-space-md) var(--ui-space-xl);
  width: 100%;
  max-width: 480px;
  margin: 2px auto 0;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--app-border) 75%, transparent);
  border-radius: 8px;
  background: var(--app-surface);
}

.azimuth-dial-face {
  display: block;
  flex: 0 0 184px;
  width: 184px;
  height: 184px;
  overflow: visible;
  touch-action: none;
}

.azimuth-dial-ring {
  fill: var(--app-surface-muted);
  stroke: var(--app-border-strong);
  stroke-width: 1;
}

.azimuth-dial-tick line {
  stroke: var(--app-text-muted);
  stroke-width: 1;
}

.azimuth-dial-cardinal text {
  fill: var(--app-text-muted);
  font-size: 9px;
  text-anchor: middle;
  dominant-baseline: middle;
  user-select: none;
}

.azimuth-sector {
  fill: color-mix(in srgb, var(--el-color-primary) 25%, transparent);
  stroke: transparent;
  stroke-width: 10px;
  cursor: grab;
  outline: none;
}

.azimuth-sector:hover,
.azimuth-sector:focus-visible {
  fill: color-mix(in srgb, var(--el-color-primary) 38%, transparent);
  stroke: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
}

.is-dragging .azimuth-sector {
  cursor: grabbing;
}

.azimuth-sector-edge {
  stroke: var(--el-color-primary);
  stroke-width: 1.5;
  pointer-events: none;
}

.azimuth-dial-hub {
  fill: var(--el-color-primary);
  pointer-events: none;
}

.azimuth-handle {
  fill: var(--app-surface);
  stroke: var(--el-color-primary);
  stroke-width: 3;
  cursor: ew-resize;
  outline: none;
}

.azimuth-handle:hover,
.azimuth-handle:focus-visible {
  fill: var(--el-color-primary-light-8);
  stroke-width: 4;
}

.azimuth-dial-copy {
  display: grid;
  flex: 1 1 150px;
  min-width: 140px;
  max-width: 220px;
  gap: var(--ui-space-xs);
}

.azimuth-dial-copy strong {
  color: var(--app-text);
  font:
    600 13px/1.5 Consolas,
    monospace;
}

.azimuth-dial-copy span {
  color: var(--el-color-primary);
  font-size: 12px;
}

.azimuth-dial-copy small {
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1.6;
}

.azimuth-dial.is-disabled {
  opacity: 0.58;
}

.azimuth-dial.is-disabled .azimuth-sector,
.azimuth-dial.is-disabled .azimuth-handle {
  cursor: not-allowed;
}
</style>
