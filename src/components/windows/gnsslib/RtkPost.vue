<template>
  <div class="rtkpost">
    <div class="run-toolbar">
      <div class="gl-title">
        <strong>RTKPOST</strong>
        <small class="engine-name">Robo-GNSS · rnx2rtkp</small>
      </div>
      <div class="gl-actions">
        <el-button type="primary" :loading="store.running.value" @click="execute">
          {{ t('gnssRaw.rtkpost.execute') }}
        </el-button>
        <el-button v-if="store.running.value" type="danger" plain @click="cancel">
          {{ t('gnssRaw.rtkpost.cancel') }}
        </el-button>
        <el-button plain @click="optionsVisible = !optionsVisible">
          {{ t('gnssRaw.rtkpost.options') }}
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!desktopAvailable"
      class="desktop-alert"
      type="info"
      :closable="false"
      :title="t('gnssRaw.rtkpost.desktopOnly')"
    />

    <section class="form-section">
      <div class="section-title">{{ t('gnssRaw.rtkpost.engine') }}</div>
      <div class="file-row">
        <label>rnx2rtkp</label>
        <el-input
          v-model="store.settings.executablePath"
          :disabled="store.running.value"
          :placeholder="t('gnssRaw.rtkpost.executablePlaceholder')"
          clearable
        />
        <el-button :disabled="store.running.value" @click="chooseExecutable"
          ><el-icon><FolderOpened /></el-icon
        ></el-button>
      </div>

      <div class="section-title">{{ t('gnssRaw.rtkpost.inputs') }}</div>
      <div class="file-row">
        <label>{{ t('gnssRaw.rtkpost.roverObs') }}</label>
        <el-input
          v-model="store.settings.roverObsPath"
          :disabled="store.running.value"
          placeholder="RINEX OBS"
          @change="store.suggestOutput"
        />
        <el-button :disabled="store.running.value" @click="chooseRover"
          ><el-icon><FolderOpened /></el-icon
        ></el-button>
      </div>
      <div class="file-row">
        <label>
          {{ t('gnssRaw.rtkpost.baseObs') }}
          <span v-if="relativeMode" class="required">*</span>
        </label>
        <el-input
          v-model="store.settings.baseObsPath"
          :disabled="store.running.value"
          :placeholder="
            relativeMode ? t('gnssRaw.rtkpost.baseRequired') : t('gnssRaw.rtkpost.baseOptional')
          "
        />
        <el-button :disabled="store.running.value" @click="chooseBase"
          ><el-icon><FolderOpened /></el-icon
        ></el-button>
      </div>
      <div v-for="(_, index) in store.settings.navPaths" :key="index" class="file-row">
        <label>
          {{ t('gnssRaw.rtkpost.navFile') }}
          {{ store.settings.navPaths.length > 1 ? index + 1 : '' }}
        </label>
        <el-input
          v-model="store.settings.navPaths[index]"
          :disabled="store.running.value"
          placeholder="NAV / CLK / SP3 / FCB / IONEX / SBAS"
        />
        <el-button :disabled="store.running.value" @click="chooseNav(index)"
          ><el-icon><FolderOpened /></el-icon
        ></el-button>
        <el-button
          v-if="store.settings.navPaths.length > 1"
          class="remove-nav"
          text
          :disabled="store.running.value"
          @click="store.settings.navPaths.splice(index, 1)"
        >
          ×
        </el-button>
      </div>
      <el-button
        class="add-nav"
        text
        type="primary"
        :disabled="store.running.value || store.settings.navPaths.length >= 14"
        @click="store.settings.navPaths.push('')"
      >
        + {{ t('gnssRaw.rtkpost.addNav') }}
      </el-button>

      <div class="section-title">{{ t('gnssRaw.rtkpost.output') }}</div>
      <div class="file-row">
        <label>{{ t('gnssRaw.rtkpost.solutionFile') }}</label>
        <el-input
          v-model="store.settings.outputPath"
          :disabled="store.running.value"
          placeholder=".pos"
        />
        <el-button :disabled="store.running.value" @click="chooseOutput"
          ><el-icon><FolderOpened /></el-icon
        ></el-button>
      </div>
    </section>

    <section v-show="optionsVisible" class="options-section">
      <div class="section-title">{{ t('gnssRaw.rtkpost.processingOptions') }}</div>
      <div class="option-grid">
        <label class="option-field wide">
          <span>{{ t('gnssRaw.rtkpost.positioningMode') }}</span>
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
          <span>{{ t('gnssRaw.rtkpost.frequency') }}</span>
          <el-select v-model="store.settings.options.frequency" :disabled="store.running.value">
            <el-option label="L1" :value="1" />
            <el-option label="L1 + L2" :value="2" />
            <el-option label="L1 + L2 + L5" :value="3" />
          </el-select>
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.solutionType') }}</span>
          <el-select v-model="store.settings.options.solutionType" :disabled="store.running.value">
            <el-option :label="t('gnssRaw.rtkpost.forward')" :value="0" />
            <el-option :label="t('gnssRaw.rtkpost.backward')" :value="1" />
            <el-option :label="t('gnssRaw.rtkpost.combined')" :value="2" />
          </el-select>
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.ambiguityResolution') }}</span>
          <el-select
            v-model="store.settings.options.ambiguityResolution"
            :disabled="store.running.value"
          >
            <el-option :label="t('gnssRaw.rtkpost.continuous')" value="continuous" />
            <el-option :label="t('gnssRaw.rtkpost.instantaneous')" value="instantaneous" />
            <el-option :label="t('gnssRaw.rtkpost.fixAndHold')" value="fix-and-hold" />
          </el-select>
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.elevationMask') }}</span>
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
          <span>{{ t('gnssRaw.rtkpost.ratioThreshold') }}</span>
          <el-input-number
            v-model="store.settings.options.ratioThreshold"
            :disabled="store.running.value"
            :min="0"
            :max="999"
            :precision="1"
            controls-position="right"
          />
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.interval') }}</span>
          <el-input-number
            :model-value="store.settings.options.intervalS"
            :disabled="store.running.value"
            :min="0.000001"
            :max="86400"
            :precision="3"
            :placeholder="t('gnssRaw.rtkpost.allEpochs')"
            controls-position="right"
            @update:model-value="store.settings.options.intervalS = $event ?? null"
          />
        </label>
      </div>

      <div class="constellation-field">
        <span>{{ t('gnssRaw.rtkpost.constellations') }}</span>
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

      <div class="option-grid time-grid">
        <label class="option-field wide">
          <span>{{ t('gnssRaw.rtkpost.startTime') }}</span>
          <el-input
            v-model="store.settings.options.startTime"
            :disabled="store.running.value"
            placeholder="2024-07-30T00:00:00"
          />
        </label>
        <label class="option-field wide">
          <span>{{ t('gnssRaw.rtkpost.endTime') }}</span>
          <el-input
            v-model="store.settings.options.endTime"
            :disabled="store.running.value"
            placeholder="2024-07-30T23:59:59"
          />
        </label>
      </div>
      <div class="field-hint">{{ t('gnssRaw.rtkpost.timeHint') }}</div>

      <div class="section-title">{{ t('gnssRaw.rtkpost.outputOptions') }}</div>
      <div class="option-grid">
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.outputFormat') }}</span>
          <el-select v-model="store.settings.options.outputFormat" :disabled="store.running.value">
            <el-option label="Lat / Lon / Height" value="llh" />
            <el-option label="X / Y / Z (ECEF)" value="xyz" />
            <el-option label="E / N / U" value="enu" />
            <el-option label="NMEA-0183 GGA" value="nmea" />
          </el-select>
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.timeSystem') }}</span>
          <el-select v-model="store.settings.options.timeSystem" :disabled="store.running.value">
            <el-option label="GPST" value="gpst" />
            <el-option label="UTC" value="utc" />
          </el-select>
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.timeFormat') }}</span>
          <el-select v-model="store.settings.options.timeFormat" :disabled="store.running.value">
            <el-option :label="t('gnssRaw.rtkpost.calendarTime')" value="hms" />
            <el-option :label="t('gnssRaw.rtkpost.timeOfWeek')" value="tow" />
          </el-select>
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.timeDecimals') }}</span>
          <el-input-number
            v-model="store.settings.options.timeDecimals"
            :disabled="store.running.value"
            :min="0"
            :max="9"
            :step="1"
            step-strictly
            controls-position="right"
          />
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.outputStatus') }}</span>
          <el-select v-model="store.settings.options.outputStatus" :disabled="store.running.value">
            <el-option :label="t('gnssRaw.rtkpost.off')" :value="0" />
            <el-option :label="t('gnssRaw.rtkpost.states')" :value="1" />
            <el-option :label="t('gnssRaw.rtkpost.residuals')" :value="2" />
          </el-select>
        </label>
        <label class="option-field">
          <span>{{ t('gnssRaw.rtkpost.traceLevel') }}</span>
          <el-input-number
            v-model="store.settings.options.traceLevel"
            :disabled="store.running.value"
            :min="0"
            :max="5"
            :step="1"
            step-strictly
            controls-position="right"
          />
        </label>
      </div>
      <div class="file-row config-row">
        <label>{{ t('gnssRaw.rtkpost.configFile') }}</label>
        <el-input
          v-model="store.settings.configPath"
          :disabled="store.running.value"
          :placeholder="t('gnssRaw.rtkpost.configOptional')"
          clearable
        />
        <el-button :disabled="store.running.value" @click="chooseConfig"
          ><el-icon><FolderOpened /></el-icon
        ></el-button>
      </div>
      <div class="field-hint">{{ t('gnssRaw.rtkpost.configHint') }}</div>
    </section>

    <div v-if="store.status.value !== 'idle'" class="run-status" :class="store.status.value">
      <span>{{ statusLabel }}</span>
      <span v-if="store.errorText.value" class="status-detail">{{ store.errorText.value }}</span>
    </div>

    <el-tabs v-model="activeTab" class="output-tabs">
      <el-tab-pane :label="t('gnssRaw.rtkpost.result')" name="result">
        <template v-if="solution">
          <div class="result-path" :title="store.result.value?.outputPath">
            {{ store.result.value?.outputPath }}
          </div>
          <div class="summary-cards">
            <div v-for="card in summaryCards" :key="card.label" class="summary-card">
              <div class="summary-value">{{ card.value.toLocaleString() }}</div>
              <div class="summary-label">{{ card.label }}</div>
            </div>
          </div>
          <div class="preview-heading">
            <span>{{ t('gnssRaw.rtkpost.preview') }}</span>
            <span>{{ formatBytes(solution.sizeBytes) }}</span>
          </div>
          <pre v-if="solution.preview" class="solution-preview">{{ solution.preview }}</pre>
          <div v-else class="empty-output">{{ t('gnssRaw.rtkpost.noSolutionRows') }}</div>
        </template>
        <div v-else class="empty-output">{{ t('gnssRaw.rtkpost.emptyResult') }}</div>
      </el-tab-pane>
      <el-tab-pane :label="t('gnssRaw.rtkpost.log')" name="log">
        <div class="log-actions">
          <el-button text size="small" :disabled="!store.logText.value" @click="store.clearResult">
            {{ t('gnssRaw.rtkpost.clear') }}
          </el-button>
        </div>
        <pre v-if="store.logText.value" class="run-log">{{ store.logText.value }}</pre>
        <div v-else class="empty-output">{{ t('gnssRaw.rtkpost.emptyLog') }}</div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderOpened } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import { useRtkPost } from '@/composables/useRtkPost'

const store = useRtkPost()
const optionsVisible = ref(false)
const activeTab = ref('result')
const desktopAvailable = Boolean(window.electronAPI?.rtkPostRun)

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
const relativeMode = computed(
  () => store.settings.options.mode >= 1 && store.settings.options.mode <= 6,
)
const solution = computed(() => store.result.value?.solution)
const summaryCards = computed(() => {
  const value = solution.value
  if (!value) return []
  return [
    { label: t('gnssRaw.rtkpost.epochs'), value: value.epochs },
    { label: t('gnssRaw.rtkpost.fixed'), value: value.fixed },
    { label: t('gnssRaw.rtkpost.float'), value: value.float },
    { label: t('gnssRaw.rtkpost.single'), value: value.single },
    {
      label: t('gnssRaw.rtkpost.other'),
      value: value.sbas + value.dgps + value.ppp + value.other,
    },
  ]
})
const statusLabel = computed(() => {
  if (store.status.value === 'running') return t('gnssRaw.rtkpost.running')
  if (store.status.value === 'success') return t('gnssRaw.rtkpost.success')
  if (store.status.value === 'cancelled') return t('gnssRaw.rtkpost.cancelled')
  return t('gnssRaw.rtkpost.failed')
})

watch(
  () => store.settings.options.outputFormat,
  () => store.suggestOutput(),
)

async function chooseRover(): Promise<void> {
  const path = await chooseFile('rover-obs', obsFilters())
  if (path) {
    store.settings.roverObsPath = path
    store.suggestOutput()
  }
}

async function chooseBase(): Promise<void> {
  const path = await chooseFile('base-obs', obsFilters())
  if (path) store.settings.baseObsPath = path
}

async function chooseNav(index: number): Promise<void> {
  const path = await chooseFile('nav', [
    {
      name: 'NAV / CLK / SP3',
      extensions: ['nav', 'rnx', 'n', 'p', 'g', 'h', 'q', 'sp3', 'eph', 'clk'],
    },
    { name: t('gnssRaw.rtkpost.allFiles'), extensions: ['*'] },
  ])
  if (path) store.settings.navPaths[index] = path
}

async function chooseExecutable(): Promise<void> {
  const path = await chooseFile('executable', [
    { name: 'rnx2rtkp', extensions: ['exe'] },
    { name: t('gnssRaw.rtkpost.allFiles'), extensions: ['*'] },
  ])
  if (path) store.settings.executablePath = path
}

async function chooseConfig(): Promise<void> {
  const path = await chooseFile('config', [
    { name: 'RTKLIB Options', extensions: ['conf'] },
    { name: t('gnssRaw.rtkpost.allFiles'), extensions: ['*'] },
  ])
  if (path) store.settings.configPath = path
}

async function chooseOutput(): Promise<void> {
  store.suggestOutput()
  const api = window.electronAPI?.rtkPostChooseOutput
  if (!api) {
    ElMessage.info(t('gnssRaw.rtkpost.desktopOnly'))
    return
  }
  const path = await api({
    defaultPath: store.settings.outputPath,
    outputFormat: store.settings.options.outputFormat,
  })
  if (path) store.settings.outputPath = path
}

async function chooseFile(
  scope: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const api = window.electronAPI?.openFileDialog
  if (!api) {
    ElMessage.info(t('gnssRaw.rtkpost.desktopOnly'))
    return null
  }
  const paths = await api({ scope: `gnssraw-rtkpost-${scope}`, filters })
  return paths?.[0] ?? null
}

async function execute(): Promise<void> {
  activeTab.value = 'log'
  try {
    await store.execute()
    if (store.status.value === 'success') {
      activeTab.value = 'result'
      ElMessage.success(t('gnssRaw.rtkpost.success'))
    } else if (store.status.value === 'error') {
      ElMessage.error(store.errorText.value || t('gnssRaw.rtkpost.failed'))
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function cancel(): Promise<void> {
  try {
    await store.cancel()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

function obsFilters(): { name: string; extensions: string[] }[] {
  return [
    { name: 'RINEX OBS', extensions: ['obs', 'rnx', 'crx', 'o', 'd', 'gz', 'z'] },
    { name: t('gnssRaw.rtkpost.allFiles'), extensions: ['*'] },
  ]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
</script>

<style scoped>
.rtkpost {
  height: 100%;
  overflow: auto;
  padding: 8px;
  color: var(--el-text-color-primary);
  font-size: 12px;
}
.run-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.run-toolbar .el-button + .el-button {
  margin-left: 0;
}
.engine-name {
  margin-left: auto;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.desktop-alert {
  margin-bottom: 8px;
}
.form-section,
.options-section {
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.options-section {
  margin-top: 8px;
}
.section-title {
  margin: 4px 0 6px;
  font-weight: 600;
}
.section-title:not(:first-child) {
  margin-top: 12px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.file-row > label {
  flex: 0 0 142px;
  color: var(--el-text-color-regular);
}
.file-row .el-button {
  flex-shrink: 0;
  margin-left: 0;
}
.file-row .remove-nav {
  width: 24px;
  padding: 0;
  font-size: 18px;
}
.required {
  color: var(--el-color-danger);
}
.add-nav {
  margin: -2px 0 2px 148px;
  padding: 0;
}
.option-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 8px;
}
.option-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--el-text-color-regular);
}
.option-field .el-select,
.option-field .el-input-number {
  width: 100%;
}
.time-grid {
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  margin-top: 10px;
}
.constellation-field {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}
.constellation-field > span {
  flex: 0 0 130px;
  color: var(--el-text-color-regular);
}
.constellation-field :deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 0 12px;
}
.constellation-field :deep(.el-checkbox) {
  margin-right: 0;
}
.field-hint {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.config-row {
  margin-top: 10px;
}
.run-status {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.run-status.running {
  color: var(--el-color-primary);
}
.run-status.success {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}
.run-status.error {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
.run-status.cancelled {
  color: var(--el-color-warning);
}
.status-detail {
  min-width: 0;
  overflow-wrap: anywhere;
}
.output-tabs {
  margin-top: 8px;
}
.output-tabs :deep(.el-tabs__header) {
  margin-bottom: 6px;
}
.output-tabs :deep(.el-tabs__item) {
  height: 32px;
  font-size: 12px;
}
.result-path {
  overflow: hidden;
  margin-bottom: 8px;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(70px, 1fr));
  gap: 6px;
}
.summary-card {
  padding: 7px 9px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.summary-value {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.summary-label {
  margin-top: 2px;
  color: var(--el-text-color-secondary);
}
.preview-heading {
  display: flex;
  justify-content: space-between;
  margin: 10px 0 4px;
  color: var(--el-text-color-secondary);
}
.solution-preview,
.run-log {
  box-sizing: border-box;
  width: 100%;
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font:
    11px/1.5 Consolas,
    'Courier New',
    monospace;
  white-space: pre;
}
.log-actions {
  display: flex;
  justify-content: flex-end;
  height: 24px;
}
.empty-output {
  padding: 20px 8px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
@media (max-width: 760px) {
  .option-grid,
  .time-grid {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
  .file-row > label {
    flex-basis: 110px;
  }
  .add-nav {
    margin-left: 116px;
  }
  .engine-name {
    display: none;
  }
}
</style>
<style scoped src="./gnssLib.css"></style>
