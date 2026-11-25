<template>
  <div class="rtkpost">
    <div v-if="!props.embedded" class="run-toolbar">
      <div class="view-tabs" role="tablist" :aria-label="t('gnssRaw.rtkpost.workspace')">
        <button
          v-for="tab in views"
          :id="`${viewId}-${tab.name}-tab`"
          :key="tab.name"
          class="view-tab"
          type="button"
          role="tab"
          :aria-selected="activeView === tab.name"
          :aria-controls="`${viewId}-${tab.name}-panel`"
          :tabindex="activeView === tab.name ? 0 : -1"
          @click="activeView = tab.name"
          @keydown="switchViewWithKeyboard"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="gl-actions">
        <el-button
          type="primary"
          :loading="store.running.value"
          :disabled="
            store.timeRangeBlocked.value ||
            store.hasPendingOptions.value ||
            store.configSaving.value ||
            (store.isOpenGnss.value && store.configStatus.value === 'loading')
          "
          :title="store.hasPendingOptions.value ? t('gnssRaw.rtkpost.optionsPending') : undefined"
          @click="execute"
        >
          {{ t('gnssRaw.rtkpost.execute') }}
        </el-button>
        <el-button v-if="store.running.value" type="danger" plain @click="cancel">
          {{ t('gnssRaw.rtkpost.cancel') }}
        </el-button>
      </div>
      <div v-if="store.progress.value" class="processing-progress" aria-live="polite">
        <div class="progress-caption run-status" :class="store.status.value">
          <span>{{ progressLabel }}</span>
          <span v-if="store.errorText.value" class="status-detail">{{
            store.errorText.value
          }}</span>
        </div>
        <el-progress
          :percentage="store.progress.value.percentage ?? (store.running.value ? 30 : 0)"
          :indeterminate="store.running.value && store.progress.value.percentage === null"
          :show-text="store.progress.value.percentage !== null"
          :status="progressStatus"
          :stroke-width="8"
        />
        <div
          v-if="store.progress.value.processingMessage"
          class="processing-message"
          :title="store.progress.value.processingMessage"
        >
          {{ store.progress.value.processingMessage }}
        </div>
      </div>
    </div>

    <el-alert
      v-if="!props.embedded && !desktopAvailable"
      class="desktop-alert"
      type="info"
      :closable="false"
      :title="t('gnssRaw.rtkpost.desktopOnly')"
    />

    <div class="workspace-content">
      <div
        v-show="activeView === 'processing'"
        :id="`${viewId}-processing-panel`"
        class="workspace-page processing-view"
        :inert="store.configSaving.value || undefined"
        role="tabpanel"
        :aria-labelledby="`${viewId}-processing-tab`"
      >
        <section class="form-section">
          <div class="file-row">
            <label :for="`${viewId}-engine`">{{ t('gnssRaw.rtkpost.engine') }}</label>
            <el-select
              :id="`${viewId}-engine`"
              v-model="store.settings.engine"
              :disabled="store.running.value"
            >
              <el-option
                v-for="engine in RTK_POST_ENGINES"
                :key="engine"
                :value="engine"
                :label="RTK_POST_ENGINE_LABELS[engine]"
              />
            </el-select>
          </div>
          <div class="file-row">
            <label :for="`${viewId}-executable`">{{ t('gnssRaw.rtkpost.executable') }}</label>
            <el-input
              :id="`${viewId}-executable`"
              v-model="store.engineFiles.value.executablePath"
              spellcheck="false"
              :disabled="store.running.value"
              :placeholder="
                t(
                  store.isStarRtk.value
                    ? 'gnssRaw.rtkpost.starRtkExecutable'
                    : store.isRtkLibEx.value
                      ? 'gnssLib.rtklibEx.executable'
                      : 'gnssRaw.rtkpost.executablePlaceholder',
                )
              "
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
              spellcheck="false"
              :disabled="store.running.value"
              placeholder="RINEX OBS"
              @change="store.suggestOutput(true)"
            />
            <el-button :disabled="store.running.value" @click="chooseRover"
              ><el-icon><FolderOpened /></el-icon
            ></el-button>
          </div>
          <div v-if="store.isOpenGnss.value || relativeMode" class="file-row">
            <label>
              {{ t('gnssRaw.rtkpost.baseObs') }}
              <span v-if="relativeMode" class="required">*</span>
            </label>
            <el-input
              v-model="store.settings.baseObsPath"
              spellcheck="false"
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
              {{ store.isStarRtk.value ? 'RINEX NAV' : t('gnssRaw.rtkpost.navFile') }}
              {{ store.settings.navPaths.length > 1 ? index + 1 : '' }}
            </label>
            <el-input
              v-model="store.settings.navPaths[index]"
              spellcheck="false"
              :disabled="store.running.value"
              :placeholder="
                store.isStarRtk.value ? 'RINEX NAV' : 'NAV / CLK / SP3 / FCB / IONEX / SBAS'
              "
            />
            <el-button :disabled="store.running.value" @click="chooseNav(index)"
              ><el-icon><FolderOpened /></el-icon
            ></el-button>
            <el-button
              v-if="!store.isStarRtk.value && store.settings.navPaths.length > 1"
              class="remove-nav"
              text
              :disabled="store.running.value"
              @click="store.settings.navPaths.splice(index, 1)"
            >
              ×
            </el-button>
          </div>
          <el-button
            v-if="!store.isStarRtk.value"
            class="add-nav"
            text
            type="primary"
            :disabled="store.running.value || store.settings.navPaths.length >= 14"
            @click="store.settings.navPaths.push('')"
          >
            + {{ t('gnssRaw.rtkpost.addNav') }}
          </el-button>
          <div class="field-hint nav-hint">
            {{
              t(
                !store.isStarRtk.value
                  ? 'gnssRaw.rtkpost.navHint'
                  : relativeMode
                    ? 'gnssRaw.rtkpost.starRtkInputs'
                    : 'gnssRaw.rtkpost.starRtkSppInputs',
              )
            }}
          </div>

          <div class="observation-time-section">
            <div class="observation-time-heading">
              <div>
                <strong>{{ t('gnssRaw.rtkpost.observationTime') }}</strong>
                <span v-if="store.observationStatus.value === 'ready'">{{ timeRangeSource }}</span>
              </div>
              <div class="observation-time-actions">
                <el-button
                  v-if="store.settings.roverObsPath.trim()"
                  text
                  size="small"
                  :disabled="store.running.value || store.observationStatus.value === 'loading'"
                  @click="store.refreshObservationSpan"
                  >{{ t('gnssRaw.rtkpost.timeRefresh') }}</el-button
                >
                <el-button
                  v-if="store.observationSpan.value"
                  text
                  size="small"
                  :disabled="
                    store.running.value ||
                    (!store.settings.options.startTime && !store.settings.options.endTime)
                  "
                  @click="resetObservationTime"
                  >{{ t('gnssRaw.rtkpost.timeReset') }}</el-button
                >
              </div>
            </div>
            <template v-if="store.observationSpan.value">
              <el-slider
                v-model="selectedTimeOffsets"
                class="observation-time-slider"
                range
                :min="0"
                :max="timeRangeDuration"
                :step="1"
                :format-tooltip="timeTooltip"
                :range-start-label="t('gnssRaw.rtkpost.startTime')"
                :range-end-label="t('gnssRaw.rtkpost.endTime')"
                :disabled="store.running.value"
              />
              <div class="observation-time-selected">
                <div>
                  <span>{{ t('gnssRaw.rtkpost.startTime') }}</span
                  ><strong>{{ selectedTimeLabel(0) }}</strong>
                </div>
                <div>
                  <span>{{ t('gnssRaw.rtkpost.endTime') }}</span
                  ><strong>{{ selectedTimeLabel(1) }}</strong>
                </div>
              </div>
              <div
                v-if="store.timeSelectionError.value"
                class="observation-time-error"
                role="alert"
              >
                {{ store.timeSelectionError.value }}
              </div>
            </template>
            <div
              v-else-if="store.observationStatus.value === 'loading'"
              class="observation-time-hint"
              role="status"
            >
              {{ t('gnssRaw.rtkpost.timeLoading') }}
            </div>
            <div
              v-else-if="store.observationStatus.value === 'no-overlap'"
              class="observation-time-error"
              role="alert"
            >
              <div>{{ t('gnssRaw.rtkpost.timeNoOverlap') }}</div>
              <div v-if="store.roverObservationSpan.value">
                {{ t('gnssRaw.rtkpost.timeRover') }}:
                {{ formatTimeLabel(store.roverObservationSpan.value.start) }} –
                {{ formatTimeLabel(store.roverObservationSpan.value.end) }}
              </div>
              <div v-if="store.baseObservationSpan.value">
                {{ t('gnssRaw.rtkpost.timeBase') }}:
                {{ formatTimeLabel(store.baseObservationSpan.value.start) }} –
                {{ formatTimeLabel(store.baseObservationSpan.value.end) }}
              </div>
            </div>
            <div
              v-else-if="store.observationStatus.value === 'unavailable'"
              class="observation-time-hint"
              :title="store.observationError.value"
            >
              {{ t('gnssRaw.rtkpost.timeUnavailable') }}
            </div>
            <div v-else class="observation-time-hint">
              {{ t('gnssRaw.rtkpost.timeSelectRover') }}
            </div>
          </div>

          <div class="section-title">{{ t('gnssRaw.rtkpost.output') }}</div>
          <div class="file-row">
            <label>{{ t('gnssRaw.rtkpost.solutionFile') }}</label>
            <el-input
              v-model="store.settings.outputPath"
              spellcheck="false"
              :disabled="store.running.value"
              :placeholder="store.activeOptions.value.outputFormat === 'nmea' ? '.nmea' : '.pos'"
            />
            <el-button :disabled="store.running.value" @click="chooseOutput"
              ><el-icon><FolderOpened /></el-icon
            ></el-button>
          </div>
        </section>
      </div>

      <section
        v-show="activeView === 'options'"
        :id="`${viewId}-options-panel`"
        class="workspace-page options-section solver-config-workspace"
        role="tabpanel"
        :aria-labelledby="`${viewId}-options-tab`"
      >
        <header class="solver-config-heading">
          <strong>{{ RTK_POST_ENGINE_LABELS[store.settings.engine] }}</strong>
          <code>{{ store.isStarRtk.value ? 'YAML' : '.conf' }}</code>
        </header>
        <template v-if="store.isStarRtk.value">
          <div class="file-row solver-config-output">
            <label :for="`${viewId}-star-output`">{{ t('gnssRaw.rtkpost.outputFormat') }}</label>
            <el-select
              :id="`${viewId}-star-output`"
              v-model="store.settings.starRtk.outputFormat"
              :disabled="store.running.value"
            >
              <el-option value="llh" label="POS (LLH / GPST)" />
              <el-option value="nmea" label="NMEA" />
            </el-select>
          </div>
          <StarRtkOptions
            v-model="store.settings.starRtk.processing"
            :disabled="store.running.value"
            :apply-config="store.applyStarRtkConfig"
            :export-config="store.exportStarRtkConfig"
          />
        </template>
        <RtkLibExOptions
          v-else-if="store.isRtkLibEx.value"
          v-model="store.settings.rtklibEx.parameters"
          v-model:config-path="store.settings.rtklibEx.configPath"
          :disabled="store.running.value"
          :save-config="store.saveRtkLibExConfig"
        />
        <template v-else>
          <section class="config-file-panel solver-config-source">
            <div class="solver-config-file-toolbar">
              <div class="file-row config-file-row">
                <label :for="`${viewId}-config-file`">{{ t('gnssRaw.rtkpost.configFile') }}</label>
                <el-input
                  :id="`${viewId}-config-file`"
                  v-model="store.draftConfigPath.value"
                  spellcheck="false"
                  :disabled="
                    store.running.value ||
                    store.configSaving.value ||
                    store.configStatus.value === 'loading'
                  "
                  :placeholder="t('gnssRaw.rtkpost.configOptional')"
                  clearable
                  @change="loadConfig"
                  @clear="clearConfig"
                />
              </div>
              <div class="solver-config-actions">
                <el-button
                  size="small"
                  :icon="FolderOpened"
                  class="keep-action-label"
                  :disabled="
                    store.running.value ||
                    store.configSaving.value ||
                    store.configStatus.value === 'loading'
                  "
                  @click="chooseConfig"
                  >{{ t('gnssLib.configWorkspace.loadConf') }}</el-button
                >
                <el-button
                  size="small"
                  :icon="Download"
                  class="keep-action-label"
                  :aria-label="t('gnssRaw.rtkpost.optionsSave')"
                  :disabled="store.running.value || store.configStatus.value === 'loading'"
                  :loading="store.configSaving.value"
                  @click="saveOptions"
                  >{{ t('gnssLib.configWorkspace.saveConf') }}</el-button
                >
              </div>
            </div>
            <div
              v-if="configSummary"
              class="config-status"
              :class="`is-${store.configStatus.value}`"
              :title="store.configDetail.value || t('gnssRaw.rtkpost.configHint')"
              role="status"
              aria-live="polite"
            >
              {{ configSummary }}
            </div>
          </section>
          <GnssSolverOptions
            mode="post"
            :options="store.draftOptions"
            :modified-keys="store.manualModifiedKeys.value"
            :disabled="
              store.running.value ||
              store.configSaving.value ||
              store.configStatus.value === 'loading'
            "
            @change="updateOption"
          />
          <footer class="options-actions">
            <span v-if="store.hasPendingOptions.value">{{
              t('gnssRaw.rtkpost.optionsDraftHint')
            }}</span>
            <div>
              <el-button
                :disabled="
                  store.running.value ||
                  store.configSaving.value ||
                  store.configStatus.value === 'loading' ||
                  (!store.hasPendingOptions.value && store.configStatus.value !== 'error')
                "
                @click="store.cancelOptions()"
                >{{ t('gnssRaw.rtkpost.optionsDiscard') }}</el-button
              >
              <el-button
                type="primary"
                :disabled="
                  store.running.value ||
                  store.configSaving.value ||
                  store.configStatus.value === 'loading'
                "
                @click="confirmOptions"
                >{{ t('gnssRaw.rtkpost.optionsConfirm') }}</el-button
              >
            </div>
          </footer>
        </template>
      </section>

      <section
        v-show="activeView === 'result'"
        :id="`${viewId}-result-panel`"
        class="workspace-page result-view"
        role="tabpanel"
        :aria-labelledby="`${viewId}-result-tab`"
      >
        <el-alert
          v-if="store.result.value?.ok && store.result.value.warnings?.length"
          class="engine-warnings"
          type="warning"
          :closable="false"
          :title="t('gnssRaw.rtkpost.engineWarnings')"
          :description="store.result.value.warnings.join('\n')"
        />
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
      </section>

      <section
        v-show="activeView === 'log'"
        :id="`${viewId}-log-panel`"
        class="workspace-page log-view"
        role="tabpanel"
        :aria-labelledby="`${viewId}-log-tab`"
      >
        <div class="log-actions">
          <el-button text size="small" :disabled="!store.logText.value" @click="store.clearResult">
            {{ t('gnssRaw.rtkpost.clear') }}
          </el-button>
        </div>
        <pre v-if="store.logText.value" class="run-log">{{ store.logText.value }}</pre>
        <div v-else class="empty-output">{{ t('gnssRaw.rtkpost.emptyLog') }}</div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, FolderOpened } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import { useRtkPost } from '@/composables/useRtkPost'
import { formatRtkPostTime, parseCalendarTime } from '@/core/gnsslib/RtkPostProgress'
import { isStarRtkExecutable } from '@/core/gnsslib/StarRtkConfig'
import GnssSolverOptions from './GnssSolverOptions.vue'
import StarRtkOptions from './StarRtkOptions.vue'
import RtkLibExOptions from './RtkLibExOptions.vue'
import { RTK_POST_ENGINES, RTK_POST_ENGINE_LABELS } from '@/core/gnsslib/RtkPost'
import type { SolverOptionKey, SolverOptionValue } from '@/core/gnsslib/GnssSolverOptions'

const store = useRtkPost()
const props = defineProps<{ embedded?: boolean; view?: string }>()
const viewId = `rtkpost-${useId()}`
const localView = ref('processing')
const activeView = computed({
  get: () => (props.embedded ? (props.view ?? 'processing') : localView.value),
  set: (value) => {
    localView.value = value
  },
})
const views = computed(() => [
  { name: 'processing', label: t('gnssRaw.rtkpost.processing') },
  { name: 'options', label: t('gnssRaw.rtkpost.options') },
  { name: 'result', label: t('gnssRaw.rtkpost.result') },
  { name: 'log', label: t('gnssRaw.rtkpost.log') },
])
const desktopAvailable = Boolean(window.electronAPI?.rtkPostRun)
const configSummary = computed(() => {
  if (store.configStatus.value === 'loading') return t('gnssRaw.rtkpost.configLoading')
  const detail = store.configDetail.value
  const name = store.draftConfigPath.value.trim().split(/[\\/]/).at(-1)
  return store.configStatus.value === 'ready' && name
    ? [name, detail].filter(Boolean).join(' · ')
    : detail
})

const relativeMode = store.relativeMode
const timeRangeDuration = computed(() => {
  const span = store.observationSpan.value
  return span ? Math.max(1, Math.round(span.end - span.start)) : 1
})
const timeRangeSource = computed(() =>
  store.baseObservationSpan.value
    ? t('gnssRaw.rtkpost.timeOverlap')
    : relativeMode.value && !store.settings.baseObsPath.trim()
      ? t('gnssRaw.rtkpost.timeRoverAwaitBase')
      : t('gnssRaw.rtkpost.timeRover'),
)
const selectedTimeOffsets = computed<number[]>({
  get: () => {
    const span = store.observationSpan.value
    if (!span) return [0, 0]
    const start = parseCalendarTime(store.settings.options.startTime) ?? span.start
    const end = parseCalendarTime(store.settings.options.endTime) ?? span.end
    const clamp = (value: number) =>
      Math.max(0, Math.min(timeRangeDuration.value, Math.round(value - span.start)))
    return [clamp(start), clamp(end)]
  },
  set: (offsets) => {
    const span = store.observationSpan.value
    if (!span || offsets.length !== 2) return
    store.settings.options.startTime = formatRtkPostTime(span.start + offsets[0])
    store.settings.options.endTime = formatRtkPostTime(span.start + offsets[1])
  },
})
function formatTimeLabel(value: number): string {
  return formatRtkPostTime(value).replace('T', ' ')
}
function selectedTimeLabel(index: number): string {
  const span = store.observationSpan.value
  return span ? formatTimeLabel(span.start + selectedTimeOffsets.value[index]) : '—'
}
function timeTooltip(offset: number): string {
  return store.observationSpan.value
    ? formatTimeLabel(store.observationSpan.value.start + offset)
    : ''
}
function resetObservationTime(): void {
  store.settings.options.startTime = ''
  store.settings.options.endTime = ''
}
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
const progressLabel = computed(() => {
  if (!store.running.value) return statusLabel.value
  const phase = store.progress.value?.phase ?? 'preparing'
  return t(`gnssRaw.rtkpost.progress${phase[0].toUpperCase()}${phase.slice(1)}`)
})
const progressStatus = computed(() => {
  if (store.status.value === 'success') return 'success'
  if (store.status.value === 'error') return 'exception'
  if (store.status.value === 'cancelled') return 'warning'
  return undefined
})

watch([() => store.settings.engine, () => store.activeOptions.value.outputFormat], () =>
  store.suggestOutput(),
)

function switchViewWithKeyboard(event: KeyboardEvent): void {
  const index = views.value.findIndex((view) => view.name === activeView.value)
  const count = views.value.length
  let next: number
  if (event.key === 'ArrowRight') next = (index + 1) % count
  else if (event.key === 'ArrowLeft') next = (index + count - 1) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = views.value.length - 1
  else return
  event.preventDefault()
  activeView.value = views.value[next].name
  const tabs = (
    event.currentTarget as HTMLElement
  ).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  tabs?.[next]?.focus()
}

async function chooseRover(): Promise<void> {
  const path = await chooseFile('rover-obs', obsFilters())
  if (path) {
    store.settings.roverObsPath = path
    store.suggestOutput(true)
  }
}

async function chooseBase(): Promise<void> {
  const path = await chooseFile('base-obs', obsFilters())
  if (path) store.settings.baseObsPath = path
}

async function chooseNav(index: number): Promise<void> {
  const starRtk = store.isStarRtk.value
  const path = await chooseFile('nav', [
    {
      name: starRtk ? 'RINEX NAV' : 'NAV / CLK / SP3',
      extensions: [
        'nav',
        'rnx',
        'n',
        'p',
        'g',
        'h',
        'q',
        ...(starRtk ? [] : ['sp3', 'eph', 'clk']),
      ],
    },
    { name: t('gnssRaw.rtkpost.allFiles'), extensions: ['*'] },
  ])
  if (path) store.settings.navPaths[index] = path
}

async function chooseExecutable(): Promise<void> {
  const engine = store.settings.engine
  const files = store.engineFiles.value
  const scope = engine === 'rnx2rtkp' ? 'executable' : `${engine}-executable`
  const path = await chooseFile(scope, [
    { name: RTK_POST_ENGINE_LABELS[engine], extensions: ['exe'] },
    { name: t('gnssRaw.rtkpost.allFiles'), extensions: ['*'] },
  ])
  if (path && isStarRtkExecutable(path)) {
    store.settings.engine = 'starrtk'
    store.settings.starRtk.executablePath = path
  } else if (path) {
    files.executablePath = path
  }
}

async function chooseConfig(): Promise<void> {
  const path = await chooseFile('config', [
    { name: 'OpenGNSS Options', extensions: ['conf'] },
    { name: t('gnssRaw.rtkpost.allFiles'), extensions: ['*'] },
  ])
  if (path) {
    store.draftConfigPath.value = path
    await loadConfig()
  }
}

async function loadConfig(): Promise<void> {
  const ok = await store.loadConfig()
  if (!ok) {
    ElMessage.error(store.configDetail.value || t('gnssRaw.rtkpost.configEmpty'))
  } else if (store.draftConfigPath.value) {
    ElMessage.success(store.configDetail.value)
  }
}

function clearConfig(): void {
  void store.loadConfig('')
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
    outputFormat: store.activeOptions.value.outputFormat,
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
  try {
    await store.execute()
    if (store.status.value === 'success') {
      activeView.value = 'result'
      ElMessage.success(t('gnssRaw.rtkpost.success'))
    } else if (store.status.value === 'error') {
      activeView.value = 'log'
      ElMessage.error(store.errorText.value || t('gnssRaw.rtkpost.failed'))
    }
  } catch (error) {
    activeView.value = 'log'
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
    {
      name: 'RINEX OBS',
      extensions: store.isStarRtk.value
        ? ['obs', 'rnx', 'o']
        : ['obs', 'rnx', 'crx', 'o', 'd', 'gz', 'z'],
    },
    { name: t('gnssRaw.rtkpost.allFiles'), extensions: ['*'] },
  ]
}

function updateOption(key: SolverOptionKey, value: SolverOptionValue): void {
  store.updateOption(key, value)
}

function confirmOptions(): void {
  try {
    store.confirmOptions()
    ElMessage.success(t('gnssRaw.rtkpost.optionsApplied'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

async function saveOptions(): Promise<void> {
  try {
    if (await store.saveOptions()) ElMessage.success(t('gnssRaw.rtkpost.configSaved'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
</script>

<style scoped>
.rtkpost {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 8px;
  color: var(--el-text-color-primary);
  font-size: 12px;
}
.run-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-md);
  margin-bottom: 8px;
}
.run-toolbar .el-button + .el-button {
  margin-left: 0;
}
.rtkpost .run-toolbar {
  position: relative;
  top: auto;
  flex: none;
}
.workspace-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.workspace-page {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--app-border-strong) transparent;
}
.rtkpost .options-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-lg);
  margin-top: 0;
  overflow-y: auto;
  padding: 12px;
}
.rtkpost .options-section :deep(.solver-option-editor) {
  flex: 1 0 250px;
  min-height: 250px;
}
.result-view,
.log-view {
  display: flex;
  flex-direction: column;
}
.result-view > *,
.log-view > * {
  flex-shrink: 0;
}
.rtkpost .solution-preview,
.rtkpost .run-log {
  flex: 1;
  min-height: 48px;
  max-height: none;
  text-align: left;
}
.result-view .empty-output,
.log-view .empty-output {
  display: grid;
  flex: 1;
  place-items: center;
}
.desktop-alert {
  flex: none;
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
  gap: var(--ui-space-sm);
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
.observation-time-section {
  margin: 12px 0;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.observation-time-heading,
.observation-time-heading > div,
.observation-time-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-md);
}
.observation-time-heading > div {
  justify-content: flex-start;
  flex-wrap: wrap;
  min-width: 0;
}
.observation-time-actions {
  flex: none;
}
.observation-time-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.observation-time-heading span,
.observation-time-hint {
  color: var(--el-text-color-secondary);
}
.observation-time-slider {
  width: calc(100% - 20px);
  margin: 0 10px;
}
.observation-time-selected {
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.observation-time-selected > div {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-xs) var(--ui-space-md);
}
.observation-time-selected span {
  color: var(--el-text-color-secondary);
}
.observation-time-selected strong {
  font-weight: 600;
}
.observation-time-hint,
.observation-time-error {
  margin-top: 6px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.observation-time-error {
  color: var(--el-color-danger);
}
.field-hint {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.config-file-panel {
  flex: none;
  min-width: 0;
}
.config-file-row {
  margin: 0;
}
.config-status {
  margin: var(--ui-space-xs) 0 0;
  color: var(--app-text-secondary);
  font-size: 10px;
  line-height: 1.5;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.config-status.is-error {
  white-space: normal;
  overflow-wrap: anywhere;
  color: var(--el-color-danger);
}
.options-actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-md) var(--ui-space-lg);
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.options-actions > span {
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}
.options-actions > div {
  display: flex;
  margin-inline-start: auto;
  flex-wrap: wrap;
  gap: var(--ui-space-sm);
}
.options-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.run-status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-md);
  margin-bottom: 10px;
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
  white-space: pre-line;
}
.processing-progress {
  box-sizing: border-box;
  flex: 0 0 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-surface);
}
.progress-caption {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ui-space-xs) var(--ui-space-lg);
  margin-bottom: 8px;
  color: var(--app-text);
  font-size: 11px;
}
.processing-progress .run-status {
  margin: 0 0 8px;
  padding: 0;
  border: 0;
  background: transparent;
}
.processing-message {
  overflow: hidden;
  margin-top: 6px;
  color: var(--app-text-secondary);
  font:
    11px/1.4 Consolas,
    'Courier New',
    monospace;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.engine-warnings {
  margin-bottom: 10px;
  white-space: pre-line;
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
  gap: var(--ui-space-sm);
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
  .file-row > label {
    flex-basis: 110px;
  }
  .add-nav {
    margin-left: 116px;
  }
}
@media (max-width: 480px) {
  .observation-time-selected > div {
    width: 100%;
  }
  .rtkpost .view-tab {
    padding-inline: 10px;
  }
}
</style>
<style scoped src="./gnssLib.css"></style>
<style scoped src="./solverOptionLayout.css"></style>
