<template>
  <div class="advanced-options">
    <details class="option-group" open>
      <summary>{{ t('gnssRaw.rtkpost.settings2') }}</summary>
      <div class="option-group-content">
        <div class="option-grid advanced-grid">
          <label class="option-field">
            <span>{{ t('gnssRaw.rtkpost.gloArMode') }}</span>
            <el-select v-model="store.settings.options.gloArMode" :disabled="store.running.value">
              <el-option :label="t('gnssRaw.rtkpost.off')" value="off" />
              <el-option :label="t('gnssRaw.rtkpost.on')" value="on" />
              <el-option label="Auto Cal" value="autocal" />
              <el-option :label="t('gnssRaw.rtkpost.fixAndHold')" value="fix-and-hold" />
            </el-select>
          </label>
          <label class="option-field">
            <span>{{ t('gnssRaw.rtkpost.basePositionMode') }}</span>
            <el-select
              v-model="store.settings.options.basePositionMode"
              :disabled="store.running.value"
            >
              <el-option label="LLH" value="llh" />
              <el-option label="XYZ" value="xyz" />
              <el-option label="Single-point average" value="single" />
              <el-option label="Position file" value="posfile" />
              <el-option label="RINEX header" value="rinexhead" />
              <el-option label="RTCM" value="rtcm" />
              <el-option label="Raw" value="raw" />
            </el-select>
          </label>
          <label v-for="field in toggleFields" :key="field.key" class="option-field option-toggle">
            <span>{{ field.label }}</span>
            <el-switch
              v-model="store.settings.options[field.key]"
              :disabled="store.running.value"
              inline-prompt
              :active-text="t('gnssRaw.rtkpost.on')"
              :inactive-text="t('gnssRaw.rtkpost.off')"
            />
          </label>
        </div>
        <div class="option-grid advanced-grid">
          <label v-for="field in ambiguityFields" :key="field.key" class="option-field">
            <span>{{ field.label }}</span>
            <el-input-number
              :model-value="store.settings.options[field.key]"
              :disabled="store.running.value"
              :min="field.min"
              :max="field.max"
              :precision="field.precision"
              :step="field.step"
              controls-position="right"
              @update:model-value="updateNumber(field.key, $event)"
            />
          </label>
        </div>
      </div>
    </details>

    <details class="option-group" open>
      <summary>{{ t('gnssRaw.rtkpost.filterParameters') }}</summary>
      <div class="option-group-content">
        <div class="option-grid advanced-grid">
          <label v-for="field in filterFields" :key="field.key" class="option-field">
            <span>{{ field.label }}</span>
            <el-input-number
              :model-value="store.settings.options[field.key]"
              :disabled="store.running.value"
              :min="field.min"
              :max="field.max"
              :precision="field.precision"
              :step="field.step"
              controls-position="right"
              @update:model-value="updateNumber(field.key, $event)"
            />
          </label>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { useRtkPost } from '@/composables/useRtkPost'
import type { RtkPostOptions } from '@/core/gnsslib/RtkPost'

type NumericKey = {
  [K in keyof RtkPostOptions]: RtkPostOptions[K] extends number ? K : never
}[keyof RtkPostOptions]
type BooleanKey = 'bdsArEnabled' | 'arFilterEnabled' | 'syncSolutionEnabled'
interface NumericField {
  key: NumericKey
  label: string
  min: number
  max: number
  precision: number
  step: number
}

const store = useRtkPost()
const toggleFields = computed(() =>
  (['bdsArEnabled', 'arFilterEnabled', 'syncSolutionEnabled'] as BooleanKey[]).map((key) => ({
    key,
    label: t(`gnssRaw.rtkpost.${key}`),
  })),
)
const ambiguityFields = computed<NumericField[]>(() => [
  field('ratioMin', 0, 999, 2, 0.1),
  field('ratioMax', 0, 999, 2, 0.1),
  field('maxPosVar', 0, 1000, 4, 0.01),
  field('gloHwBiasM', -1000, 1000, 4, 0.01),
  field('minLockCount', 0, 10000, 0, 1),
  field('arElevationMaskDeg', 0, 90, 1, 1),
  field('minFixCount', 0, 10000, 0, 1),
  field('holdElevationMaskDeg', 0, 90, 1, 1),
  field('dopplerSlipThresholdHz', 0, 1000, 3, 0.01),
  field('gfSlipThresholdM', 0, 1000, 4, 0.01),
  field('maxAgeS', 0, 86400, 1, 1),
  field('arResetOutageEpochs', 0, 10000, 0, 1),
  field('codeOutlierM', 0, 10000, 2, 1),
  field('phaseOutlierM', 0, 10000, 2, 0.1),
  field('filterIterations', 1, 100, 0, 1),
  field('baselineLengthM', 0, 1000000, 3, 0.1),
  field('baselineSigmaM', 0, 10000, 4, 0.01),
  field('minFixSats', 0, 100, 0, 1),
  field('minHoldSats', 0, 100, 0, 1),
  field('minDropSats', 0, 100, 0, 1),
  field('holdAmbVar', 0, 1000, 4, 0.01),
  field('holdAmbGain', 0, 1000, 4, 0.01),
])
const filterFields = computed<NumericField[]>(() => [
  field('errorRatioL1', 0, 10000, 1, 10),
  field('errorRatioL2', 0, 10000, 1, 10),
  field('errorRatioL5', 0, 10000, 1, 10),
  field('phaseErrorM', 0, 1000, 4, 0.001),
  field('phaseElevationErrorM', 0, 1000, 4, 0.001),
  field('phaseBaselineErrorM', 0, 1000, 4, 0.001),
  field('phaseSnrErrorM', 0, 1000, 4, 0.001),
  field('snrMaxDbHz', 0, 100, 1, 1),
  field('receiverErrorM', 0, 1000, 4, 0.001),
  field('dopplerErrorHz', 0, 1000, 3, 0.1),
  field('initialBiasStdM', 0, 10000, 3, 0.1),
  field('initialIonoStdM', 0, 10000, 4, 0.01),
  field('initialTropStdM', 0, 10000, 4, 0.01),
  field('receiverAccelHorizontalMps2', 0, 1000, 2, 0.1),
  field('receiverAccelVerticalMps2', 0, 1000, 2, 0.1),
  field('processBiasM', 0, 1000, 6, 0.0001),
  field('processIonoM', 0, 1000, 6, 0.0001),
  field('processTropM', 0, 1000, 6, 0.0001),
  field('clockStabilitySps', 0, 1, 12, 1e-12),
])

function field(
  key: NumericKey,
  min: number,
  max: number,
  precision: number,
  step: number,
): NumericField {
  return { key, label: t(`gnssRaw.rtkpost.${key}`), min, max, precision, step }
}

function updateNumber(key: NumericKey, value: number | undefined): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    Object.assign(store.settings.options, { [key]: value })
  }
}
</script>

<style scoped>
.advanced-options {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.option-group {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.option-group > summary {
  padding: 9px 12px;
  color: var(--app-text);
  background: var(--app-surface-muted);
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.option-group > summary:hover {
  color: var(--el-color-primary);
}

.option-group > summary:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.option-group-content {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.advanced-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.option-toggle :deep(.el-switch) {
  align-self: flex-start;
  min-height: 30px;
}
</style>
<style scoped src="./gnssLib.css"></style>
