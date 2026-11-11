<template>
  <div ref="rootElement" class="rtknavi">
    <div v-if="!props.embedded" class="run-toolbar">
      <div class="view-tabs" role="tablist" aria-label="RTKNAVI">
        <button
          v-for="tab in tabs"
          :id="`${viewId}-${tab.name}-tab`"
          :key="tab.name"
          class="view-tab"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.name"
          :aria-controls="`${viewId}-${tab.name}-panel`"
          :tabindex="activeTab === tab.name ? 0 : -1"
          @click="activeTab = tab.name"
          @keydown="switchTabWithKeyboard"
        >
          {{ tab.label }}
        </button>
      </div>
      <span class="run-state" :class="store.status.value.state">{{ statusText }}</span>
      <div class="gl-actions">
        <el-button v-if="!store.running.value" type="primary" @click="start">
          {{ t('gnssLib.rtknavi.start') }}
        </el-button>
        <el-button
          v-else
          type="danger"
          plain
          :loading="store.status.value.state === 'stopping'"
          @click="stop"
        >
          {{ t('gnssLib.rtknavi.stop') }}
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!props.embedded && !desktopAvailable"
      class="desktop-alert"
      type="info"
      :closable="false"
      :title="t('gnssLib.rtknavi.desktopOnly')"
    />
    <el-alert
      v-if="!props.embedded && store.errorText.value"
      class="error-alert"
      type="error"
      :closable="false"
      :title="store.errorText.value"
    />

    <div class="navi-panels">
      <section
        v-show="activeTab === 'monitor'"
        :id="`${viewId}-monitor-panel`"
        role="tabpanel"
        :aria-labelledby="`${viewId}-monitor-tab`"
      >
        <div class="monitor-heading">
          <span class="output-path" :title="currentOutputPath">{{ currentOutputPath }}</span>
          <el-button text size="small" @click="store.clearMonitor">
            {{ t('gnssLib.rtknavi.clear') }}
          </el-button>
        </div>
        <div class="summary-cards">
          <div class="summary-card">
            <div class="summary-value">{{ store.epochs.value.toLocaleString() }}</div>
            <div class="summary-label">{{ t('gnssLib.rtknavi.epochs') }}</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">{{ qualityCount(1) }}</div>
            <div class="summary-label">{{ t('gnssLib.rtknavi.fixed') }}</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">{{ qualityCount(2) }}</div>
            <div class="summary-label">{{ t('gnssLib.rtknavi.float') }}</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">{{ qualityCount(5) }}</div>
            <div class="summary-label">{{ t('gnssLib.rtknavi.single') }}</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">{{ otherQualityCount }}</div>
            <div class="summary-label">{{ t('gnssLib.rtknavi.other') }}</div>
          </div>
        </div>

        <template v-if="store.latestSolution.value">
          <div class="section-title">{{ t('gnssLib.rtknavi.solution') }}</div>
          <div class="solution-grid">
            <div class="solution-item wide">
              <span>GPST</span>
              <strong>{{ store.latestSolution.value.time }}</strong>
            </div>
            <div class="solution-item">
              <span>{{ t('gnssLib.rtknavi.latitude') }}</span>
              <strong>{{ store.latestSolution.value.latitude.toFixed(9) }}°</strong>
            </div>
            <div class="solution-item">
              <span>{{ t('gnssLib.rtknavi.longitude') }}</span>
              <strong>{{ store.latestSolution.value.longitude.toFixed(9) }}°</strong>
            </div>
            <div class="solution-item">
              <span>{{ t('gnssLib.rtknavi.height') }}</span>
              <strong>{{ store.latestSolution.value.height.toFixed(4) }} m</strong>
            </div>
            <div class="solution-item">
              <span>{{ t('gnssLib.rtknavi.quality') }}</span>
              <strong class="quality-text" :class="qualityClass">{{ qualityText }}</strong>
            </div>
            <div class="solution-item">
              <span>{{ t('gnssLib.rtknavi.satellites') }}</span>
              <strong>{{ store.latestSolution.value.satellites }}</strong>
            </div>
            <div class="solution-item">
              <span>{{ t('gnssLib.rtknavi.age') }}</span>
              <strong>{{ formatOptional(store.latestSolution.value.age, ' s') }}</strong>
            </div>
            <div class="solution-item">
              <span>{{ t('gnssLib.rtknavi.ratio') }}</span>
              <strong>{{ formatOptional(store.latestSolution.value.ratio) }}</strong>
            </div>
          </div>
          <div class="section-title">{{ t('gnssLib.rtknavi.track') }}</div>
          <div class="track-panel">
            <svg viewBox="0 0 400 220" role="img" aria-label="GNSS track">
              <line x1="0" y1="110" x2="400" y2="110" class="track-axis" />
              <line x1="200" y1="0" x2="200" y2="220" class="track-axis" />
              <polyline v-if="trackPoints" :points="trackPoints" class="track-line" />
              <circle cx="200" cy="110" r="4" class="track-origin" />
            </svg>
            <span class="track-scale">{{ trackScale }}</span>
          </div>
        </template>
        <div v-else class="empty-monitor">{{ t('gnssLib.rtknavi.noSolution') }}</div>
      </section>

      <section
        v-show="activeTab === 'configuration'"
        :id="`${viewId}-configuration-panel`"
        role="tabpanel"
        :aria-labelledby="`${viewId}-configuration-tab`"
      >
        <section v-show="!props.embedded || props.view !== 'options'" class="config-section">
          <div class="section-title">{{ t('gnssLib.rtknavi.engine') }}</div>
          <div class="file-row">
            <label>rtkrcv</label>
            <el-input
              v-model="store.settings.executablePath"
              :disabled="store.running.value"
              :placeholder="t('gnssLib.rtknavi.executablePlaceholder')"
              clearable
            />
            <el-button :disabled="store.running.value" @click="chooseExecutable"
              ><el-icon><FolderOpened /></el-icon
            ></el-button>
          </div>
          <div class="section-title spaced">{{ t('gnssLib.rtknavi.output') }}</div>
          <div class="file-row">
            <label>.pos</label>
            <el-input v-model="store.settings.outputPath" :disabled="store.running.value" />
            <el-button :disabled="store.running.value" @click="chooseOutput"
              ><el-icon><FolderOpened /></el-icon
            ></el-button>
          </div>
          <div class="field-hint">{{ t('gnssLib.rtknavi.outputHint') }}</div>
        </section>

        <div v-show="!props.embedded || props.view !== 'options'" class="section-title spaced">
          {{ t('gnssLib.rtknavi.inputs') }}
        </div>
        <section
          v-for="(stream, index) in store.settings.inputs"
          v-show="!props.embedded || props.view !== 'options'"
          :key="index"
          class="config-section stream-section"
        >
          <div class="stream-heading">
            <strong>{{ t(`gnssLib.rtknavi.${inputNames[index]}`) }}</strong>
            <el-switch
              v-model="stream.enabled"
              :disabled="store.running.value || index === 0"
              :aria-label="t('gnssLib.rtknavi.enabled')"
            />
          </div>
          <div class="stream-grid">
            <label>
              <span>{{ t('gnssLib.rtknavi.streamType') }}</span>
              <el-select v-model="stream.type" :disabled="store.running.value || !stream.enabled">
                <el-option :label="t('gnssLib.rtknavi.typeSerial')" value="serial" />
                <el-option :label="t('gnssLib.rtknavi.typeFile')" value="file" />
                <el-option :label="t('gnssLib.rtknavi.typeTcpServer')" value="tcpsvr" />
                <el-option :label="t('gnssLib.rtknavi.typeTcpClient')" value="tcpcli" />
                <el-option :label="t('gnssLib.rtknavi.typeNtripClient')" value="ntripcli" />
              </el-select>
            </label>
            <label>
              <span>{{ t('gnssLib.rtknavi.format') }}</span>
              <el-select v-model="stream.format" :disabled="store.running.value || !stream.enabled">
                <el-option
                  v-for="format in inputFormats"
                  :key="format"
                  :label="format"
                  :value="format"
                />
              </el-select>
            </label>
          </div>
          <div class="file-row stream-path">
            <label>{{
              t(stream.type === 'file' ? 'gnssLib.rtknavi.filePath' : 'gnssLib.rtknavi.path')
            }}</label>
            <el-input
              v-model="stream.path"
              :disabled="store.running.value || !stream.enabled"
              :placeholder="streamHint(stream.type)"
            />
            <el-button
              v-if="stream.type === 'file'"
              :disabled="store.running.value || !stream.enabled"
              @click="chooseInputFile(index)"
            >
              …
            </el-button>
          </div>
          <div v-if="stream.type === 'file'" class="replay-row">
            <el-checkbox
              v-model="stream.timeTag"
              :disabled="store.running.value || !stream.enabled"
            >
              {{ t('gnssLib.rtknavi.timeTag') }}
            </el-checkbox>
            <label>
              <span>{{ t('gnssLib.rtknavi.replaySpeed') }}</span>
              <el-input-number
                v-model="stream.replaySpeed"
                :disabled="store.running.value || !stream.enabled"
                :min="0.01"
                :max="1000"
                :precision="2"
                controls-position="right"
              />
            </label>
          </div>
          <div v-else class="field-hint">{{ streamHint(stream.type) }}</div>
        </section>

        <section v-show="!props.embedded || props.view === 'options'" class="config-section">
          <div class="section-title">{{ t('gnssLib.rtknavi.processingOptions') }}</div>
          <div class="option-grid">
            <label class="option-field wide">
              <span>{{ t('gnssLib.rtknavi.positioningMode') }}</span>
              <el-select v-model="store.settings.options.mode" :disabled="store.running.value">
                <el-option
                  v-for="mode in positioningModes"
                  :key="mode.value"
                  :label="mode.label"
                  :value="mode.value"
                />
              </el-select>
            </label>
            <label class="option-field">
              <span>{{ t('gnssLib.rtknavi.frequency') }}</span>
              <el-select v-model="store.settings.options.frequency" :disabled="store.running.value">
                <el-option label="L1" :value="1" />
                <el-option label="L1 + L2" :value="2" />
                <el-option label="L1 + L2 + L5" :value="3" />
              </el-select>
            </label>
            <label class="option-field">
              <span>{{ t('gnssLib.rtknavi.elevationMask') }}</span>
              <el-input-number
                v-model="store.settings.options.elevationMaskDeg"
                :disabled="store.running.value"
                :min="0"
                :max="90"
                :precision="1"
                controls-position="right"
              />
            </label>
            <label class="option-field">
              <span>{{ t('gnssLib.rtknavi.ambiguityResolution') }}</span>
              <el-select
                v-model="store.settings.options.ambiguityResolution"
                :disabled="store.running.value"
              >
                <el-option :label="t('gnssLib.rtknavi.off')" value="off" />
                <el-option :label="t('gnssLib.rtknavi.continuous')" value="continuous" />
                <el-option :label="t('gnssLib.rtknavi.instantaneous')" value="instantaneous" />
                <el-option :label="t('gnssLib.rtknavi.fixAndHold')" value="fix-and-hold" />
              </el-select>
            </label>
          </div>
          <div class="constellation-field">
            <span>{{ t('gnssLib.rtknavi.constellations') }}</span>
            <el-checkbox-group
              v-model="store.settings.options.constellations"
              :disabled="store.running.value"
            >
              <el-checkbox value="G">GPS</el-checkbox>
              <el-checkbox value="R">GLONASS</el-checkbox>
              <el-checkbox value="E">Galileo</el-checkbox>
              <el-checkbox value="C">BDS</el-checkbox>
              <el-checkbox value="J">QZSS</el-checkbox>
              <el-checkbox value="I">NavIC</el-checkbox>
            </el-checkbox-group>
          </div>
          <div class="option-grid base-position-grid">
            <label class="option-field">
              <span>{{ t('gnssLib.rtknavi.basePosition') }}</span>
              <el-select
                v-model="store.settings.options.basePositionMode"
                :disabled="store.running.value"
              >
                <el-option :label="t('gnssLib.rtknavi.positionRtcm')" value="rtcm" />
                <el-option :label="t('gnssLib.rtknavi.positionRinex')" value="rinexhead" />
                <el-option :label="t('gnssLib.rtknavi.positionLlh')" value="llh" />
              </el-select>
            </label>
            <template v-if="store.settings.options.basePositionMode === 'llh'">
              <label class="option-field">
                <span>{{ t('gnssLib.rtknavi.latitude') }}</span>
                <el-input-number
                  v-model="store.settings.options.baseLatitudeDeg"
                  :disabled="store.running.value"
                  :min="-90"
                  :max="90"
                  :precision="8"
                  controls-position="right"
                />
              </label>
              <label class="option-field">
                <span>{{ t('gnssLib.rtknavi.longitude') }}</span>
                <el-input-number
                  v-model="store.settings.options.baseLongitudeDeg"
                  :disabled="store.running.value"
                  :min="-180"
                  :max="180"
                  :precision="8"
                  controls-position="right"
                />
              </label>
              <label class="option-field">
                <span>{{ t('gnssLib.rtknavi.height') }}</span>
                <el-input-number
                  v-model="store.settings.options.baseHeightM"
                  :disabled="store.running.value"
                  :precision="4"
                  controls-position="right"
                />
              </label>
            </template>
          </div>
          <div class="file-row base-config-row">
            <label>{{ t('gnssLib.rtknavi.baseConfig') }}</label>
            <el-input
              v-model="store.settings.options.baseConfigPath"
              :disabled="store.running.value"
              placeholder="rtkrcv.conf"
              clearable
            />
            <el-button :disabled="store.running.value" @click="chooseBaseConfig"
              ><el-icon><FolderOpened /></el-icon
            ></el-button>
          </div>
          <div class="field-hint">{{ t('gnssLib.rtknavi.baseConfigHint') }}</div>
        </section>
      </section>

      <section
        v-show="activeTab === 'log'"
        :id="`${viewId}-log-panel`"
        role="tabpanel"
        :aria-labelledby="`${viewId}-log-tab`"
      >
        <pre v-if="store.logText.value" class="run-log">{{ store.logText.value }}</pre>
        <div v-else class="empty-monitor">{{ t('gnssLib.rtknavi.emptyLog') }}</div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderOpened } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import { useRtkNavi } from '@/composables/useRtkNavi'
import type { RtkNaviStreamType } from '@/core/gnsslib/RtkNavi'

const store = useRtkNavi()
const props = defineProps<{ embedded?: boolean; view?: string }>()
const localTab = ref('monitor')
const activeTab = computed({
  get: () => (props.embedded ? 'configuration' : localTab.value),
  set: (value) => {
    localTab.value = value
  },
})
const viewId = `rtknavi-${useId()}`
const tabs = computed(() => [
  { name: 'monitor', label: t('gnssLib.rtknavi.monitor') },
  { name: 'configuration', label: t('gnssLib.rtknavi.configuration') },
  { name: 'log', label: t('gnssLib.rtknavi.log') },
])
const desktopAvailable = Boolean(window.electronAPI?.rtkNaviStart)
const rootElement = ref<HTMLElement>()
watch(activeTab, () => {
  void nextTick(() => rootElement.value?.scrollTo({ top: 0, behavior: 'smooth' }))
})
const inputNames = ['rover', 'base', 'correction'] as const
const inputFormats = [
  'rtcm2',
  'rtcm3',
  'oem4',
  'ubx',
  'swift',
  'hemis',
  'skytraq',
  'javad',
  'nvs',
  'binex',
  'rt17',
  'sbf',
  'sp3',
]

const positioningModes = computed(() => [
  { value: 0, label: t('gnssRaw.rtkpost.modeSingle') },
  { value: 1, label: t('gnssRaw.rtkpost.modeDgps') },
  { value: 2, label: t('gnssRaw.rtkpost.modeKinematic') },
  { value: 3, label: t('gnssRaw.rtkpost.modeStatic') },
  { value: 4, label: t('gnssRaw.rtkpost.modeStaticStart') },
  { value: 5, label: t('gnssRaw.rtkpost.modeMovingBase') },
  { value: 6, label: t('gnssRaw.rtkpost.modeFixed') },
  { value: 7, label: t('gnssRaw.rtkpost.modePppKinematic') },
  { value: 8, label: t('gnssRaw.rtkpost.modePppStatic') },
  { value: 9, label: t('gnssRaw.rtkpost.modePppFixed') },
])
const currentOutputPath = computed(
  () => store.status.value.outputPath || store.settings.outputPath || 'rtknavi-current.pos',
)
const statusText = computed(() => t(`gnssLib.rtknavi.${store.status.value.state}`))
const qualityText = computed(() => {
  const quality = store.latestSolution.value?.quality
  return quality !== undefined && quality >= 1 && quality <= 6
    ? t(`gnssLib.rtknavi.quality${quality}`)
    : t('gnssLib.rtknavi.qualityOther')
})
const qualityClass = computed(() => {
  const quality = store.latestSolution.value?.quality
  return quality === 1 ? 'fixed' : quality === 2 ? 'float' : ''
})
const otherQualityCount = computed(() =>
  Object.entries(store.qualityCounts.value)
    .filter(([quality]) => ![1, 2, 5].includes(Number(quality)))
    .reduce((sum, [, count]) => sum + count, 0)
    .toLocaleString(),
)
const trackGeometry = computed(() => {
  const values = store.solutions.value
  if (values.length < 2) return { points: '', scale: '1 m' }
  const latest = values[values.length - 1]
  const latitudeScale = 110_540
  const longitudeScale = 111_320 * Math.cos((latest.latitude * Math.PI) / 180)
  const points = values.map((solution) => ({
    x: (solution.longitude - latest.longitude) * longitudeScale,
    y: (solution.latitude - latest.latitude) * latitudeScale,
  }))
  const extent = Math.max(
    0.001,
    ...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]),
  )
  const scale = Math.min(95 / extent, 1000)
  return {
    points: points.map((point) => `${200 + point.x * scale},${110 - point.y * scale}`).join(' '),
    scale: `${(95 / scale).toFixed(extent < 10 ? 2 : 0)} m`,
  }
})
const trackPoints = computed(() => trackGeometry.value.points)
const trackScale = computed(() => trackGeometry.value.scale)

onMounted(() => {
  void store.refreshStatus()
})

function qualityCount(quality: number): string {
  return (store.qualityCounts.value[quality] ?? 0).toLocaleString()
}

function switchTabWithKeyboard(event: KeyboardEvent): void {
  const index = tabs.value.findIndex((tab) => tab.name === activeTab.value)
  const count = tabs.value.length
  let next: number
  if (event.key === 'ArrowRight') next = (index + 1) % count
  else if (event.key === 'ArrowLeft') next = (index + count - 1) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  else return
  event.preventDefault()
  activeTab.value = tabs.value[next].name
  const buttons = (
    event.currentTarget as HTMLElement
  ).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  buttons?.[next]?.focus()
}

function formatOptional(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value.toFixed(2)}${suffix}`
}

function streamHint(type: RtkNaviStreamType): string {
  if (type === 'serial') return t('gnssLib.rtknavi.serialHint')
  if (type === 'tcpsvr') return t('gnssLib.rtknavi.tcpServerHint')
  if (type === 'tcpcli') return t('gnssLib.rtknavi.tcpClientHint')
  if (type === 'ntripcli') return t('gnssLib.rtknavi.ntripHint')
  return ''
}

async function chooseExecutable(): Promise<void> {
  const path = await chooseFile('executable', [
    { name: 'rtkrcv', extensions: ['exe'] },
    { name: t('gnssLib.rtknavi.allFiles'), extensions: ['*'] },
  ])
  if (path) store.settings.executablePath = path
}

async function chooseInputFile(index: number): Promise<void> {
  const path = await chooseFile(`input-${index + 1}`, [
    { name: 'GNSS Data', extensions: ['rtcm', 'rtcm2', 'rtcm3', 'ubx', 'bin', 'log', 'sp3'] },
    { name: t('gnssLib.rtknavi.allFiles'), extensions: ['*'] },
  ])
  if (path) store.settings.inputs[index].path = path
}

async function chooseBaseConfig(): Promise<void> {
  const path = await chooseFile('config', [
    { name: 'rtkrcv.conf', extensions: ['conf'] },
    { name: t('gnssLib.rtknavi.allFiles'), extensions: ['*'] },
  ])
  if (path) store.settings.options.baseConfigPath = path
}

async function chooseOutput(): Promise<void> {
  const api = window.electronAPI?.rtkNaviChooseOutput
  if (!api) {
    ElMessage.info(t('gnssLib.rtknavi.desktopOnly'))
    return
  }
  const path = await api(store.settings.outputPath || undefined)
  if (path) store.settings.outputPath = path
}

async function chooseFile(
  scope: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const api = window.electronAPI?.openFileDialog
  if (!api) {
    ElMessage.info(t('gnssLib.rtknavi.desktopOnly'))
    return null
  }
  const paths = await api({ scope: `gnsslib-rtknavi-${scope}`, filters })
  return paths?.[0] ?? null
}

async function start(): Promise<void> {
  try {
    await store.start()
    if (store.status.value.state === 'running') activeTab.value = 'monitor'
    else if (store.status.value.state === 'error') ElMessage.error(store.errorText.value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function stop(): Promise<void> {
  try {
    await store.stop()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}
</script>

<style scoped>
.rtknavi {
  height: 100%;
  overflow: auto;
  padding: 8px;
  color: var(--el-text-color-primary);
  font-size: 12px;
}
.run-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.run-state {
  font-weight: 600;
}
.run-state.running {
  color: var(--el-color-success);
}
.run-state.stopping {
  color: var(--el-color-warning);
}
.run-state.error {
  color: var(--el-color-danger);
}
.desktop-alert,
.error-alert {
  margin-bottom: 8px;
}
.monitor-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.output-path {
  min-width: 0;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.monitor-heading .el-button {
  margin-left: auto;
  flex: none;
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(70px, 1fr));
  gap: 6px;
}
.summary-card {
  padding: 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.summary-value {
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.summary-label {
  margin-top: 2px;
  color: var(--el-text-color-secondary);
}
.section-title {
  margin: 12px 0 6px;
  font-weight: 600;
}
.section-title.spaced {
  margin-top: 14px;
}
.solution-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 1fr));
  gap: 6px;
}
.solution-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.solution-item.wide {
  grid-column: 1 / -1;
}
.solution-item span {
  color: var(--el-text-color-secondary);
}
.solution-item strong {
  font-variant-numeric: tabular-nums;
}
.quality-text.fixed {
  color: var(--el-color-success);
}
.quality-text.float {
  color: var(--el-color-warning);
}
.track-panel {
  position: relative;
  height: 230px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.track-panel svg {
  width: 100%;
  height: 100%;
}
.track-axis {
  stroke: var(--el-border-color);
  stroke-dasharray: 4 4;
  stroke-width: 1;
}
.track-line {
  fill: none;
  stroke: var(--el-color-primary);
  stroke-width: 2;
}
.track-origin {
  fill: var(--el-color-danger);
}
.track-scale {
  position: absolute;
  right: 8px;
  bottom: 6px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
.empty-monitor {
  padding: 32px 8px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
.config-section {
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.stream-section {
  margin-bottom: 8px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.file-row > label {
  flex: 0 0 118px;
  color: var(--el-text-color-regular);
}
.file-row .el-button {
  flex: none;
  margin-left: 0;
}
.field-hint {
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.stream-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.stream-grid,
.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(150px, 1fr));
  gap: 8px;
}
.stream-grid {
  margin-bottom: 8px;
}
.stream-grid label,
.option-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stream-grid label > span,
.option-field > span {
  color: var(--el-text-color-regular);
}
.stream-grid .el-select,
.option-grid .el-select,
.option-grid .el-input-number {
  width: 100%;
}
.stream-path {
  margin-top: 6px;
}
.replay-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.replay-row > label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.option-grid {
  grid-template-columns: repeat(3, minmax(140px, 1fr));
}
.option-field.wide {
  grid-column: span 1;
}
.constellation-field {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}
.constellation-field > span {
  flex: 0 0 100px;
  color: var(--el-text-color-regular);
}
.constellation-field :deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
}
.constellation-field :deep(.el-checkbox) {
  margin-right: 0;
}
.base-position-grid {
  margin-top: 10px;
}
.base-config-row {
  margin-top: 12px;
}
.run-log {
  box-sizing: border-box;
  width: 100%;
  max-height: 360px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font:
    11px/1.5 Consolas,
    'Courier New',
    monospace;
  white-space: pre;
}
@media (max-width: 700px) {
  .solution-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
  .option-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
  .file-row > label {
    flex-basis: 90px;
  }
}
</style>
<style scoped src="./gnssLib.css"></style>
<style scoped>
@media (max-width: 480px) {
  .rtknavi .view-tab {
    padding-inline: 10px;
  }
}
</style>
