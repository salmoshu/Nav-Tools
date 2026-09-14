<template>
  <div class="lidar-scene">
    <div class="scene-toolbar">
      <el-button type="default" size="small" @click="configVisible = !configVisible">
        <el-icon><Setting /></el-icon>&nbsp;{{ t('lidar.scene.config') }}
      </el-button>
      <el-button type="default" size="small" :disabled="!hasFrame" @click="fitView">
        <el-icon><FullScreen /></el-icon>&nbsp;{{ t('lidar.scene.fitView') }}
      </el-button>
      <div class="scene-hud" v-if="hasFrame">
        <span class="hud-chip" :class="successClass">{{ hudState }}</span>
        <span class="hud-chip">t = {{ hudTime }}</span>
        <span class="hud-chip" v-if="hudPlanMs">plan {{ hudPlanMs }} ms</span>
        <span class="hud-chip hud-cmd" v-if="hudCmd"
          >cmd v={{ hudCmd.v.toFixed(2) }} w={{ hudCmd.w.toFixed(2) }}</span
        >
      </div>
      <div class="scene-hud" v-else>
        <span class="hud-hint">{{ t('lidar.scene.noData') }}</span>
      </div>
    </div>

    <div ref="canvasWrap" class="scene-canvas-wrap" :class="{ empty: !hasFrame }">
      <canvas
        ref="canvasRef"
        class="scene-canvas"
        tabindex="0"
        :aria-label="t('lidar.scene.interactionLabel')"
        @keydown="handleSceneKeydown"
        @dblclick="fitView"
      ></canvas>
      <div v-show="sceneInteracting && hasFrame" class="scene-crosshair" aria-hidden="true"></div>
      <div class="scene-empty" v-if="!hasFrame">
        <el-icon :size="42"><DataLine /></el-icon>
        <p>{{ t('lidar.scene.emptyHint') }}</p>
        <p class="empty-sub">{{ t('lidar.scene.emptySub') }}</p>
      </div>
      <div class="scene-config" v-if="configVisible">
        <div class="config-section">
          <div class="config-title">{{ t('lidar.scene.topics') }}</div>
          <el-checkbox v-model="showRaw" size="small">{{ t('lidar.scene.scanRaw') }}</el-checkbox>
          <el-checkbox v-model="showFiltered" size="small">{{
            t('lidar.scene.scanFiltered')
          }}</el-checkbox>
          <el-checkbox v-model="showObstacles" size="small">{{
            t('lidar.scene.obstacles')
          }}</el-checkbox>
          <el-checkbox v-model="showCandidates" size="small">{{
            t('lidar.scene.candidates')
          }}</el-checkbox>
          <el-checkbox v-model="showBest" size="small">{{ t('lidar.scene.best') }}</el-checkbox>
          <el-checkbox v-model="showTrail" size="small">{{ t('lidar.scene.trail') }}</el-checkbox>
          <el-checkbox v-model="showFootprint" size="small">{{
            t('lidar.scene.footprint')
          }}</el-checkbox>
          <el-checkbox v-model="showMargin" size="small">{{ t('lidar.scene.margin') }}</el-checkbox>
          <el-checkbox v-model="showGoal" size="small">{{ t('lidar.scene.goal') }}</el-checkbox>
        </div>
        <div class="config-section">
          <div class="config-title">{{ t('lidar.scene.display') }}</div>
          <div class="config-row">
            <span class="config-label">{{ t('lidar.scene.colorMode') }}</span>
            <el-radio-group v-model="opts.colorMode" size="small">
              <el-radio-button value="flat">{{ t('lidar.scene.colorFlat') }}</el-radio-button>
              <el-radio-button value="intensity">{{
                t('lidar.scene.colorIntensity')
              }}</el-radio-button>
              <el-radio-button value="range">{{ t('lidar.scene.colorRange') }}</el-radio-button>
            </el-radio-group>
          </div>
          <div class="config-row">
            <span class="config-label">{{ t('lidar.scene.pointSize') }}</span>
            <el-slider v-model="opts.pointSize" :min="1" :max="10" :step="1" style="width: 120px" />
          </div>
          <el-checkbox v-model="opts.followRobot" size="small">{{
            t('lidar.scene.followRobot')
          }}</el-checkbox>
          <el-checkbox v-model="opts.showGrid" size="small">{{
            t('lidar.scene.grid')
          }}</el-checkbox>
        </div>
      </div>
      <div class="scene-legend" v-if="hasFrame">
        <span><i class="dot dot-raw"></i>{{ t('lidar.scene.scanRaw') }}</span>
        <span><i class="dot dot-filtered"></i>{{ t('lidar.scene.scanFiltered') }}</span>
        <span><i class="dot dot-obstacle"></i>{{ t('lidar.scene.obstacles') }}</span>
        <span><i class="dot dot-candidate"></i>{{ t('lidar.scene.candidates') }}</span>
        <span><i class="dot dot-best"></i>{{ t('lidar.scene.best') }}</span>
        <span><i class="dot dot-trail"></i>{{ t('lidar.scene.trail') }}</span>
      </div>
      <div v-if="hasFrame && !configVisible" class="scene-controls-hint">
        {{ t('lidar.scene.controlsHint') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { DataLine, FullScreen, Setting } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'
import { t } from '@/i18n'
import { useLidarPanelPresence, useMcapPlayer } from '@/composables/useMcapPlayer'
import { buildSceneFrameData } from '@/core/lidar/SceneFrame'
import { formatRelativeNs } from '@/core/lidar/timeFormat'
import type { DwaScores } from '@/core/lidar/types'
import { LidarSceneRenderer, type SceneRenderOptions } from './scene/LidarSceneRenderer'

const player = useMcapPlayer()
useLidarPanelPresence()
const { resolvedTheme } = useTheme()

const canvasRef = ref<HTMLCanvasElement>()
const canvasWrap = ref<HTMLDivElement>()
const configVisible = ref(false)
const sceneInteracting = ref(false)

// 话题可见性以播放器持久化存储为唯一数据源（回放面板与场景面板共享）；
// 纯显示项存本地
const opts = reactive({
  theme: (resolvedTheme.value === 'dark' ? 'dark' : 'light') as 'dark' | 'light',
  showGrid: true,
  showRobot: true,
  pointSize: 3,
  colorMode: 'flat' as 'flat' | 'intensity' | 'range',
  followRobot: player.followRobot.value,
})

function topicFlag(topic: string) {
  return computed<boolean>({
    get: () => player.isTopicVisible(topic),
    set: (value) => player.setTopicVisible(topic, value),
  })
}
const showRaw = topicFlag('/scan_raw')
const showFiltered = topicFlag('/scan_filtered')
const showObstacles = topicFlag('/obstacles_planned')
const showCandidates = topicFlag('/traj_candidates')
const showBest = topicFlag('/traj_best')
const showFootprint = topicFlag('/footprint')
const showMargin = topicFlag('/footprint_margin')
const showGoal = topicFlag('/goal')
const showTrail = topicFlag('/odom_est')

const renderOptions = computed<SceneRenderOptions & { theme: 'dark' | 'light' }>(() => ({
  ...opts,
  showRaw: showRaw.value,
  showFiltered: showFiltered.value,
  showObstacles: showObstacles.value,
  showCandidates: showCandidates.value,
  showBest: showBest.value,
  showFootprint: showFootprint.value,
  showMargin: showMargin.value,
  showGoal: showGoal.value,
  showTrail: showTrail.value,
}))

watch(
  () => opts.followRobot,
  (value) => {
    player.followRobot.value = value
  },
)

watch(
  () => player.followRobot.value,
  (value) => {
    opts.followRobot = value
  },
)

let renderer: LidarSceneRenderer | null = null
let resizeObserver: ResizeObserver | null = null
let animationId = 0
let interactionEndTimer = 0

function setSceneInteraction(active: boolean): void {
  window.clearTimeout(interactionEndTimer)
  if (active) {
    sceneInteracting.value = true
    return
  }
  interactionEndTimer = window.setTimeout(() => {
    sceneInteracting.value = false
  }, 320)
}

// 场景几何数据：只在 currentFrame 变化（即有新消息）时重算
const sceneFrame = computed(() => {
  const doc = player.document.value
  const frame = player.currentFrame.value
  if (!doc || !frame) return undefined
  return buildSceneFrameData(doc, frame, { trailSeries: player.series.value?.odom ?? undefined })
})

const hasFrame = computed(() => sceneFrame.value !== undefined)

// ——— HUD ———
const scores = computed<DwaScores | undefined>(() => player.currentScores.value)
const hudState = computed(() => {
  const value = scores.value
  if (!value) return t('lidar.scene.stateUnknown')
  if (!value.success) return t('lidar.scene.stateBlocked')
  return `${t('lidar.scene.stateMoving')} #${value.best}`
})
const successClass = computed(() => (scores.value?.success ? 'ok' : 'blocked'))
const hudTime = computed(() => {
  const doc = player.document.value
  if (!doc?.startNs) return '-'
  return formatRelativeNs(player.playheadNs.value, doc.startNs)
})
const hudPlanMs = computed(() => scores.value?.plan_ms?.toFixed(2))
const hudCmd = computed(() => scores.value?.cmd)

// ——— 渲染循环 ———

function renderOnce(): void {
  if (!renderer) return
  const frame = sceneFrame.value
  opts.theme = resolvedTheme.value === 'dark' ? 'dark' : 'light'
  renderer.update(frame ?? emptyFrame(), renderOptions.value)
}

function emptyFrame() {
  return {
    timeNs: player.playheadNs.value,
    robot: {
      odomX: undefined,
      odomY: undefined,
      odomYaw: undefined,
      laserOffsetX: 0,
      laserOffsetY: 0,
      hasOdom: false,
    },
    scanRawXY: undefined,
    scanRawIntensity: undefined,
    scanFilteredXY: undefined,
    obstaclesXY: undefined,
    bestPathXY: undefined,
    candidatePathsXY: [],
    footprintXY: undefined,
    footprintMarginXY: undefined,
    goalXY: undefined,
    odomTrailXY: undefined,
    warnings: [],
  }
}

function loop(): void {
  animationId = requestAnimationFrame(loop)
  // OrbitControls 阻尼需要持续 update；renderOnce 内部会处理
  renderer?.renderOnce()
}

// currentFrame 变化或显示选项变化时重画一帧
watch([sceneFrame, renderOptions, resolvedTheme], () => renderOnce())

function fitView(): void {
  renderer?.fitView(sceneFrame.value)
  renderOnce()
}

function handleSceneKeydown(event: KeyboardEvent): void {
  if (event.code !== 'Digit1' && event.code !== 'Numpad1') return
  event.preventDefault()
  fitView()
}

onMounted(() => {
  if (!canvasRef.value) return
  renderer = new LidarSceneRenderer(canvasRef.value, setSceneInteraction)
  if (import.meta.env.DEV) Reflect.set(window, '__lidarSceneRenderer', renderer)
  if (canvasWrap.value) {
    renderer.resize(canvasWrap.value.clientWidth, canvasWrap.value.clientHeight)
    resizeObserver = new ResizeObserver(() => {
      if (canvasWrap.value) {
        renderer?.resize(canvasWrap.value.clientWidth, canvasWrap.value.clientHeight)
        renderOnce()
      }
    })
    resizeObserver.observe(canvasWrap.value)
  }
  // 首帧适配视野
  watch(
    sceneFrame,
    (frame) => {
      if (frame && !renderer?.isViewInitialized) {
        renderer?.fitView(frame)
      }
    },
    { immediate: true },
  )
  renderOnce()
  loop()
})

onUnmounted(() => {
  window.clearTimeout(interactionEndTimer)
  cancelAnimationFrame(animationId)
  resizeObserver?.disconnect()
  if (Reflect.get(window, '__lidarSceneRenderer') === renderer) {
    Reflect.deleteProperty(window, '__lidarSceneRenderer')
  }
  renderer?.dispose()
  renderer = null
})
</script>

<style scoped>
.lidar-scene {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--app-surface);
  color: var(--app-text);
}

.scene-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface-muted);
  flex-wrap: wrap;
}

.scene-hud {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-wrap: wrap;
}

.hud-chip {
  font-size: 12px;
  font-family: monospace;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
}

.hud-chip.ok {
  color: #22c55e;
  border-color: #22c55e55;
}

.hud-chip.blocked {
  color: #ef4444;
  border-color: #ef444455;
}

.hud-hint {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.scene-canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 240px;
  overflow: hidden;
}

.scene-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.scene-canvas:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--el-color-primary) 72%, transparent);
  outline-offset: -2px;
}

.scene-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  width: 18px;
  height: 18px;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.scene-crosshair::before,
.scene-crosshair::after {
  position: absolute;
  content: '';
  background: color-mix(in srgb, var(--app-text) 72%, transparent);
  box-shadow: 0 0 3px var(--app-surface);
}

.scene-crosshair::before {
  top: 8px;
  left: 0;
  width: 18px;
  height: 1px;
}

.scene-crosshair::after {
  top: 0;
  left: 8px;
  width: 1px;
  height: 18px;
}

.scene-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--app-text-secondary);
  pointer-events: none;
}

.scene-empty .empty-sub {
  font-size: 12px;
  opacity: 0.7;
}

.scene-config {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 5;
  display: flex;
  gap: 18px;
  padding: 12px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  max-width: calc(100% - 20px);
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
}

.config-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
  margin-bottom: 4px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.config-label {
  font-size: 12px;
  color: var(--app-text-secondary);
  min-width: 56px;
}

.scene-legend {
  position: absolute;
  bottom: 8px;
  right: 10px;
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--app-text-secondary);
  background: color-mix(in srgb, var(--app-surface) 78%, transparent);
  padding: 3px 8px;
  border-radius: 8px;
}

.scene-controls-hint {
  position: absolute;
  top: 8px;
  right: 10px;
  max-width: calc(100% - 20px);
  overflow: hidden;
  padding: 4px 8px;
  color: var(--app-text-secondary);
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  background: color-mix(in srgb, var(--app-surface) 78%, transparent);
  border-radius: 8px;
}

.scene-legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 3px;
}

.dot-raw {
  background: #22d3ee;
}
.dot-filtered {
  background: #a3e635;
}
.dot-obstacle {
  background: #ef4444;
}
.dot-candidate {
  background: #7c8da3;
}
.dot-best {
  background: #22c55e;
}
.dot-trail {
  background: #f59e0b;
}
</style>
