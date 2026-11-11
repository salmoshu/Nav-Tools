<template>
  <div class="gnss-solver">
    <div class="solver-toolbar">
      <el-radio-group
        :model-value="solver.mode.value"
        :disabled="solver.busy.value"
        size="small"
        :aria-label="t('gnssLib.solver.mode')"
        @update:model-value="solver.setMode($event as GnssSolverMode)"
      >
        <el-radio-button value="post">{{ t('gnssLib.solver.post') }}</el-radio-button>
        <el-radio-button value="realtime">{{ t('gnssLib.solver.realtime') }}</el-radio-button>
      </el-radio-group>
      <el-button v-if="!solver.busy.value" type="primary" size="small" @click="execute">{{
        t(solver.mode.value === 'post' ? 'gnssRaw.rtkpost.execute' : 'gnssLib.rtknavi.start')
      }}</el-button>
      <el-button
        v-else
        type="danger"
        plain
        size="small"
        :disabled="solver.state.value !== 'running'"
        :loading="solver.state.value === 'stopping'"
        @click="solver.stop"
        >{{
          t(solver.mode.value === 'post' ? 'gnssRaw.rtkpost.cancel' : 'gnssLib.rtknavi.stop')
        }}</el-button
      >
    </div>
    <div class="view-tabs solver-tabs" role="tablist" :aria-label="t('gnssLib.solver.workspace')">
      <button
        v-for="tab in tabs"
        :id="`${viewId}-${tab.name}-tab`"
        :key="tab.name"
        class="view-tab"
        role="tab"
        type="button"
        :tabindex="activeView === tab.name ? 0 : -1"
        :aria-selected="activeView === tab.name"
        :aria-controls="`${viewId}-${tab.name}-panel`"
        @click="activeView = tab.name"
        @keydown="switchTab"
      >
        {{ tab.label }}
      </button>
    </div>
    <el-alert
      v-if="!desktopAvailable"
      class="solver-alert"
      type="info"
      :closable="false"
      :title="t('gnssLib.solver.desktopOnly')"
    />
    <div class="solver-body">
      <section
        v-show="activeView !== 'result'"
        :id="`${viewId}-${activeView === 'options' ? 'options' : 'inputs'}-panel`"
        class="solver-form"
        role="tabpanel"
        :aria-labelledby="`${viewId}-${activeView === 'options' ? 'options' : 'inputs'}-tab`"
      >
        <RtkPost
          v-if="solver.mode.value === 'post'"
          embedded
          :view="activeView === 'inputs' ? 'processing' : 'options'"
        />
        <RtkNavi v-else embedded :view="activeView" />
      </section>
      <section
        v-show="activeView === 'result'"
        :id="`${viewId}-result-panel`"
        class="solver-result"
        role="tabpanel"
        :aria-labelledby="`${viewId}-result-tab`"
      >
        <div v-if="solver.outputPath.value" class="result-path" :title="solver.outputPath.value">
          {{ solver.outputPath.value }}
        </div>
        <div class="summary-cards">
          <div v-for="card in cards" :key="card.label" class="summary-card">
            <div class="summary-value">{{ card.value.toLocaleString() }}</div>
            <div class="summary-label">{{ card.label }}</div>
          </div>
        </div>
        <div v-if="solver.session.currentSolution.value" class="solver-latest">
          <div>{{ solver.session.currentSolution.value.time }}</div>
          <div>
            {{ solver.session.currentSolution.value.latitude.toFixed(9) }}°,
            {{ solver.session.currentSolution.value.longitude.toFixed(9) }}°
          </div>
          <div>
            {{ solver.session.currentSolution.value.height.toFixed(4) }} m · Q={{
              solver.session.currentSolution.value.quality
            }}
            · {{ solver.session.currentSolution.value.satellites }}
            {{ t('gnssLib.rtknavi.satellites') }}
          </div>
        </div>
        <el-alert
          v-if="solver.post.result.value?.warnings?.length && solver.session.mode.value === 'post'"
          type="warning"
          :closable="false"
          :title="t('gnssRaw.rtkpost.engineWarnings')"
          :description="solver.post.result.value.warnings.join('\n')"
        />
        <div class="solver-result-hint">{{ t('gnssLib.solver.resultHint') }}</div>
      </section>
    </div>
    <footer
      class="solver-statusbar"
      role="status"
      :aria-label="t('gnssLib.solver.status')"
      aria-live="polite"
    >
      <div class="progress-caption">
        <span class="solver-state" :class="solver.state.value">{{ progressLabel }}</span>
        <span v-if="solver.session.runId.value" class="solver-run-metrics"
          >{{ solver.elapsedSeconds.value }} s · {{ solver.session.epochs.value.toLocaleString() }}
          {{ t('gnssRaw.rtkpost.epochs') }}</span
        >
        <span v-else>{{
          t(solver.mode.value === 'post' ? 'gnssLib.solver.post' : 'gnssLib.solver.realtime')
        }}</span>
      </div>
      <el-progress
        v-if="solver.session.runId.value && solver.session.mode.value === 'post'"
        :percentage="percentage ?? (solver.busy.value ? 30 : 0)"
        :show-text="percentage !== null"
        :indeterminate="solver.busy.value && percentage === null"
        :status="progressStatus"
        :stroke-width="6"
      >
        <template #default="{ percentage: value }">
          <span class="solver-percentage">{{ Math.round(value) }}<span>%</span></span>
        </template>
      </el-progress>
      <div
        v-if="solver.session.mode.value === 'post' && solver.post.progress.value?.processingMessage"
        class="processing-message"
        :title="solver.post.progress.value.processingMessage"
      >
        {{ solver.post.progress.value.processingMessage }}
      </div>
      <div v-if="solver.errorText.value" class="solver-error">{{ solver.errorText.value }}</div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import { t } from '@/i18n'
import { useGnssSolver } from '@/composables/useGnssSolver'
import type { GnssSolverMode } from '@/composables/useGnssSolverSession'
import RtkPost from './RtkPost.vue'
import RtkNavi from './RtkNavi.vue'

const solver = useGnssSolver()
onMounted(() => {
  void solver.refresh().catch(() => undefined)
})
const viewId = `solver-${useId()}`
const activeView = ref('inputs')
const desktopAvailable =
  typeof window.electronAPI?.rtkPostRun === 'function' &&
  typeof window.electronAPI?.rtkNaviStart === 'function'
const tabs = computed(() => [
  { name: 'inputs', label: t('gnssLib.solver.inputs') },
  { name: 'options', label: t('gnssRaw.rtkpost.options') },
  { name: 'result', label: t('gnssLib.solver.summary') },
])
const stateLabel = computed(() =>
  t(`gnssLib.solver.state${solver.state.value[0].toUpperCase()}${solver.state.value.slice(1)}`),
)
const progressLabel = computed(() => {
  if (solver.state.value !== 'running' || solver.mode.value !== 'post') return stateLabel.value
  const phase = solver.post.progress.value?.phase ?? 'preparing'
  return t(`gnssRaw.rtkpost.progress${phase[0].toUpperCase()}${phase.slice(1)}`)
})
const percentage = computed(() =>
  solver.state.value === 'success'
    ? 100
    : solver.state.value === 'loading'
      ? 99
      : solver.post.progress.value?.percentage === null
        ? null
        : Math.min(99, solver.post.progress.value?.percentage ?? 0),
)
const progressStatus = computed(() =>
  solver.state.value === 'success'
    ? 'success'
    : solver.state.value === 'error'
      ? 'exception'
      : solver.state.value === 'cancelled'
        ? 'warning'
        : undefined,
)
const cards = computed(() => [
  { label: t('gnssRaw.rtkpost.epochs'), value: solver.session.epochs.value },
  { label: t('gnssRaw.rtkpost.fixed'), value: solver.session.qualityCounts.value[1] ?? 0 },
  { label: t('gnssRaw.rtkpost.float'), value: solver.session.qualityCounts.value[2] ?? 0 },
  { label: t('gnssRaw.rtkpost.single'), value: solver.session.qualityCounts.value[5] ?? 0 },
])
async function execute(): Promise<void> {
  await solver.start()
  if (solver.state.value === 'success' || solver.mode.value === 'realtime')
    activeView.value = 'result'
}
function switchTab(event: KeyboardEvent): void {
  const index = tabs.value.findIndex((tab) => tab.name === activeView.value)
  const count = tabs.value.length
  const next =
    event.key === 'ArrowRight'
      ? (index + 1) % count
      : event.key === 'ArrowLeft'
        ? (index + count - 1) % count
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? count - 1
            : -1
  if (next < 0) return
  event.preventDefault()
  activeView.value = tabs.value[next].name
  ;(event.currentTarget as HTMLElement).parentElement
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    [next]?.focus()
}
</script>

<style scoped>
.gnss-solver {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 10px;
  background: var(--app-surface-muted);
  color: var(--app-text);
  font-size: 12px;
}
.solver-toolbar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.solver-toolbar > .el-button {
  margin-left: auto;
}
.solver-state {
  color: var(--app-text-secondary);
  font-size: 11px;
}
.solver-state.running,
.solver-state.success {
  color: var(--el-color-success);
}
.solver-state.error,
.solver-error {
  color: var(--el-color-danger);
}
.solver-tabs {
  align-self: flex-start;
  flex: none;
}
.solver-statusbar {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  margin: 0 -10px -10px;
  padding: 8px 10px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
  text-align: left;
}
.progress-caption {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px;
  font-size: 10px;
}
.solver-run-metrics {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.solver-statusbar :deep(.el-progress__text) {
  min-width: 42px;
  margin-left: 8px;
  text-align: right;
}
.solver-percentage {
  color: var(--app-text-secondary);
  font:
    500 12px/1.2 'Segoe UI',
    system-ui,
    sans-serif;
  font-variant-numeric: tabular-nums;
}
.solver-percentage > span {
  margin-left: 1px;
  font-size: 10px;
}
.processing-message {
  overflow: hidden;
  color: var(--app-text-secondary);
  font:
    10px/1.4 Consolas,
    monospace;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.solver-error {
  max-height: 64px;
  overflow: auto;
  font-size: 11px;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.solver-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.solver-form,
.solver-result {
  height: 100%;
  overflow: auto;
}
.solver-form :deep(.rtkpost),
.solver-form :deep(.rtknavi) {
  padding: 0;
  background: transparent;
}
.solver-result .summary-cards {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.solver-latest {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  line-height: 1.8;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.solver-result-hint {
  padding: 12px 0;
  color: var(--app-text-secondary);
  font-size: 11px;
}
.solver-alert {
  flex: none;
}
</style>
<style scoped src="./gnssLib.css"></style>
