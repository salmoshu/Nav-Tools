<template>
  <div class="star-options">
    <div class="options-toolbar">
      <div class="star-config-actions">
        <el-button :disabled="disabled || busy" @click="loadConfig">
          {{ t('gnssLib.starRtk.loadYaml') }}
        </el-button>
        <el-button :disabled="disabled || busy" @click="saveConfig">
          {{ t('gnssLib.starRtk.saveYaml') }}
        </el-button>
      </div>
      <el-input
        v-model="query"
        class="options-search"
        :prefix-icon="Search"
        :placeholder="t('gnssRaw.solverOptions.search')"
        :aria-label="t('gnssRaw.solverOptions.search')"
        spellcheck="false"
        clearable
      />
    </div>

    <div class="options-layout">
      <nav class="options-categories" role="tablist" aria-orientation="vertical">
        <button
          v-for="category in categories"
          :id="`${viewId}-${category}-tab`"
          :key="category"
          :data-category="category"
          class="options-category"
          :class="{ 'is-active': activeCategory === category && !searching }"
          type="button"
          role="tab"
          :aria-selected="activeCategory === category && !searching"
          :aria-controls="`${viewId}-panel`"
          @click="selectCategory(category)"
        >
          {{ categoryLabel(category) }}
        </button>
      </nav>
      <div class="options-category-picker">
        <el-select
          :model-value="activeCategory"
          :aria-label="t('gnssRaw.solverOptions.categoriesLabel')"
          @update:model-value="selectCategory($event as StarCategory)"
        >
          <el-option
            v-for="category in categories"
            :key="category"
            :value="category"
            :label="categoryLabel(category)"
          />
        </el-select>
      </div>

      <div :id="`${viewId}-panel`" class="options-form" role="tabpanel" :aria-label="heading">
        <div class="options-heading">
          <h3>{{ heading }}</h3>
          <button v-if="searching" class="options-clear" type="button" @click="clearSearch">
            {{ t('gnssRaw.solverOptions.back') }}
          </button>
        </div>
        <p v-if="searching && visibleFieldCount === 0" class="options-empty" role="status">
          {{ t('gnssRaw.solverOptions.noMatches') }}
        </p>

        <section v-if="groupVisible('common-processing')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('common-processing')"
            @click="toggleGroup('common-processing')"
          >
            <el-icon :class="{ expanded: isGroupOpen('common-processing') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssRaw.solverOptions.groups.processing') }}</span>
          </button>
          <div v-if="isGroupOpen('common-processing')" class="options-field-grid">
            <label v-for="key in STAR_RTK_SWITCHES" v-show="matches(key)" :key="key">
              <span>{{ t(`gnssLib.starRtk.${key}`) }}</span>
              <el-switch
                v-model="processing[key]"
                :disabled="disabled"
                :data-testid="`starrtk-${key}`"
              />
            </label>
            <label v-show="matches('weighting')">
              <span>{{ t('gnssLib.starRtk.weighting') }}</span>
              <el-select v-model="processing.weighting" :disabled="disabled">
                <el-option value="elevation" :label="t('gnssLib.starRtk.elevation')" />
                <el-option value="signal_strength" :label="t('gnssLib.starRtk.signal_strength')" />
              </el-select>
            </label>
            <template v-if="timing">
              <label v-show="matches('cycle_ms')">
                <span>{{ t('gnssLib.starRtk.cycle_ms') }}</span>
                <el-input-number
                  v-model="timing.cycle_ms"
                  :disabled="disabled"
                  :min="1"
                  :max="1000"
                />
              </label>
              <label v-show="matches('max_base_age_s')">
                <span>{{ t('gnssLib.starRtk.max_base_age_s') }}</span>
                <el-input-number
                  v-model="timing.max_base_age_s"
                  :disabled="disabled"
                  :min="0"
                  :max="120"
                  :step="0.1"
                />
              </label>
            </template>
          </div>
        </section>

        <section v-if="groupVisible('common-frequencies')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('common-frequencies')"
            @click="toggleGroup('common-frequencies')"
          >
            <el-icon :class="{ expanded: isGroupOpen('common-frequencies') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssRaw.rtkpost.constellations') }}</span>
          </button>
          <div v-if="isGroupOpen('common-frequencies')">
            <table class="star-frequency-table">
              <thead>
                <tr>
                  <th scope="col">{{ t('gnssRaw.rtkpost.constellations') }}</th>
                  <th v-for="slot in 3" :key="slot" scope="col">
                    {{ t('gnssLib.starRtk.frequency', { slot }) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="system in STAR_RTK_SYSTEMS" :key="system">
                  <th scope="row">{{ satellites[system] }}</th>
                  <td v-for="slot in 3" :key="slot">
                    <el-checkbox
                      v-model="processing.frequencies[system][slot - 1]"
                      :aria-label="`${satellites[system]} ${t('gnssLib.starRtk.frequency', { slot })}`"
                      :disabled="disabled"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="star-frequency-hint">{{ t('gnssLib.starRtk.frequencyHint') }}</p>
            <p
              v-if="processing.combine_frequencies || processing.widelane_assist"
              class="star-frequency-hint"
            >
              {{ t('gnssLib.starRtk.widelaneHint') }}
            </p>
          </div>
        </section>

        <section v-if="groupVisible('ambiguity-resolution')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('ambiguity-resolution')"
            @click="toggleGroup('ambiguity-resolution')"
          >
            <el-icon :class="{ expanded: isGroupOpen('ambiguity-resolution') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssLib.starRtk.ambiguityResolution') }}</span>
          </button>
          <div v-if="isGroupOpen('ambiguity-resolution')" class="options-field-grid">
            <label v-show="matches('ambiguity_mode')">
              <span>{{ t('gnssLib.starRtk.ambiguity_mode') }}</span>
              <el-select
                v-model="processing.ambiguity_mode"
                :disabled="disabled"
                data-testid="starrtk-ambiguity-mode"
              >
                <el-option value="continuous" :label="t('gnssLib.starRtk.continuous')" />
                <el-option value="instantaneous" :label="t('gnssLib.starRtk.instantaneous')" />
                <el-option value="fix_and_hold" :label="t('gnssLib.starRtk.fixAndHold')" />
              </el-select>
            </label>
            <template v-if="processing.ambiguity_mode === 'fix_and_hold'">
              <label v-show="matches('min_fixed_epochs')">
                <span>{{ t('gnssLib.starRtk.min_fixed_epochs') }}</span>
                <el-input-number
                  v-model="processing.fix_hold.min_fixed_epochs"
                  :disabled="disabled"
                  :min="1"
                  :step="1"
                  :precision="0"
                  data-testid="starrtk-min-fixed-epochs"
                />
              </label>
              <label v-show="matches('min_satellites')">
                <span>{{ t('gnssLib.starRtk.min_satellites') }}</span>
                <el-input-number
                  v-model="processing.fix_hold.min_satellites"
                  :disabled="disabled"
                  :min="3"
                  :step="1"
                  :precision="0"
                  data-testid="starrtk-min-satellites"
                />
              </label>
              <label v-show="matches('min_elevation_deg')">
                <span>{{ t('gnssLib.starRtk.min_elevation_deg') }}</span>
                <el-input-number
                  v-model="processing.fix_hold.min_elevation_deg"
                  :disabled="disabled"
                  :min="0"
                  :max="90"
                  :step="1"
                  data-testid="starrtk-min-elevation"
                />
              </label>
              <label v-show="matches('variance_cycles')">
                <span>{{ t('gnssLib.starRtk.variance_cycles') }}</span>
                <el-input-number
                  v-model="processing.fix_hold.variance_cycles"
                  :disabled="disabled"
                  :min="0.00000001"
                  :step="0.001"
                  :precision="8"
                  data-testid="starrtk-variance-cycles"
                />
              </label>
            </template>
          </div>
        </section>

        <section v-if="groupVisible('ambiguity-ratio')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('ambiguity-ratio')"
            @click="toggleGroup('ambiguity-ratio')"
          >
            <el-icon :class="{ expanded: isGroupOpen('ambiguity-ratio') }"><ArrowRight /></el-icon>
            <span>{{ t('gnssLib.starRtk.ratioOptions') }}</span>
          </button>
          <div v-if="isGroupOpen('ambiguity-ratio')" class="options-field-grid">
            <label v-show="matches('adaptiveRatio')">
              <span>{{ t('gnssLib.starRtk.adaptiveRatio') }}</span>
              <el-switch
                v-model="processing.ratio.adaptive"
                :disabled="disabled"
                data-testid="starrtk-adaptive-ratio"
              />
            </label>
            <label v-show="matches('ratioNominal')">
              <span>{{ t('gnssLib.starRtk.ratioNominal') }}</span>
              <el-input-number
                v-model="processing.ratio.nominal"
                :disabled="disabled"
                :min="1.1"
                :step="0.1"
                :precision="2"
                data-testid="starrtk-ratio-nominal"
              />
            </label>
            <label v-show="matches('ratioMinimum')">
              <span>{{ t('gnssLib.starRtk.ratioMinimum') }}</span>
              <el-input-number
                v-model="processing.ratio.minimum"
                :disabled="disabled || !processing.ratio.adaptive"
                :min="1"
                :step="0.1"
                :precision="2"
                data-testid="starrtk-ratio-minimum"
              />
            </label>
            <label v-show="matches('ratioMaximum')">
              <span>{{ t('gnssLib.starRtk.ratioMaximum') }}</span>
              <el-input-number
                v-model="processing.ratio.maximum"
                :disabled="disabled || !processing.ratio.adaptive"
                :min="1"
                :step="0.1"
                :precision="2"
                data-testid="starrtk-ratio-maximum"
              />
            </label>
          </div>
        </section>

        <section v-if="groupVisible('output-diagnostics')" class="options-group">
          <button
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen('output-diagnostics')"
            @click="toggleGroup('output-diagnostics')"
          >
            <el-icon :class="{ expanded: isGroupOpen('output-diagnostics') }"
              ><ArrowRight
            /></el-icon>
            <span>{{ t('gnssRaw.solverOptions.categories.output') }}</span>
          </button>
          <div v-if="isGroupOpen('output-diagnostics')" class="options-field-grid">
            <label v-show="matches('trace_directory')">
              <span>{{ t('gnssLib.starRtk.trace_directory') }}</span>
              <div class="star-directory-field">
                <el-input
                  v-model="processing.trace_directory"
                  :disabled="disabled"
                  data-testid="starrtk-trace-directory"
                  clearable
                />
                <el-button
                  :disabled="disabled || busy"
                  :aria-label="t('gnssLib.starRtk.chooseTraceDirectory')"
                  :title="t('gnssLib.starRtk.chooseTraceDirectory')"
                  data-testid="starrtk-choose-trace-directory"
                  @click="chooseTraceDirectory"
                >
                  <el-icon><FolderOpened /></el-icon>
                </el-button>
              </div>
            </label>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight, FolderOpened, Search } from '@element-plus/icons-vue'
import { t } from '@/i18n'
import type { RtkPostSaveConfigRequest } from '@/core/gnsslib/RtkPost'
import {
  STAR_RTK_SWITCHES,
  STAR_RTK_SYSTEMS,
  type StarRtkConfiguration,
  type StarRtkProcessingOptions,
  type StarRtkTimingOptions,
} from '@/core/gnsslib/StarRtkConfig'

const props = defineProps<{
  disabled: boolean
  applyConfig: (config: StarRtkConfiguration) => void
  exportConfig: () => RtkPostSaveConfigRequest
}>()
const processing = defineModel<StarRtkProcessingOptions>({ required: true })
const timing = defineModel<StarRtkTimingOptions>('timing')
const busy = ref(false)
const viewId = `star-options-${useId()}`
const categories = ['common', 'ambiguity', 'output'] as const
type StarCategory = (typeof categories)[number]
type StarGroup =
  | 'common-processing'
  | 'common-frequencies'
  | 'ambiguity-resolution'
  | 'ambiguity-ratio'
  | 'output-diagnostics'
const activeCategory = ref<StarCategory>('common')
const query = ref('')
const collapsedGroups = ref(new Set<StarGroup>())
const searching = computed(() => !!query.value.trim())
const satellites = { gps: 'GPS', beidou: 'BeiDou', glonass: 'GLONASS', galileo: 'Galileo' }
const groupCategories: Record<StarGroup, StarCategory> = {
  'common-processing': 'common',
  'common-frequencies': 'common',
  'ambiguity-resolution': 'ambiguity',
  'ambiguity-ratio': 'ambiguity',
  'output-diagnostics': 'output',
}
const groupTerms: Record<StarGroup, string[]> = {
  'common-processing': [...STAR_RTK_SWITCHES, 'weighting', 'cycle_ms', 'max_base_age_s'],
  'common-frequencies': ['frequencies'],
  'ambiguity-resolution': [
    'ambiguity_mode',
    'min_fixed_epochs',
    'min_satellites',
    'min_elevation_deg',
    'variance_cycles',
  ],
  'ambiguity-ratio': ['adaptiveRatio', 'ratioNominal', 'ratioMinimum', 'ratioMaximum'],
  'output-diagnostics': ['trace_directory'],
}
const searchableFields = Object.values(groupTerms).flat()

function categoryLabel(category: StarCategory): string {
  return t(`gnssRaw.solverOptions.categories.${category}`)
}
function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim()
}
function matches(...terms: string[]): boolean {
  const tokens = normalize(query.value).split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const text = normalize([...terms, ...terms.map((term) => t(`gnssLib.starRtk.${term}`))].join(' '))
  return tokens.every((token) => text.includes(token))
}
function groupVisible(group: StarGroup): boolean {
  if (!searching.value && activeCategory.value !== groupCategories[group]) return false
  return !searching.value || groupTerms[group].some((term) => matches(term))
}
const visibleFieldCount = computed(() => searchableFields.filter((field) => matches(field)).length)
const heading = computed(() =>
  searching.value
    ? t('gnssRaw.solverOptions.searchResults', { count: visibleFieldCount.value })
    : categoryLabel(activeCategory.value),
)
function isGroupOpen(group: StarGroup): boolean {
  return searching.value || !collapsedGroups.value.has(group)
}
function toggleGroup(group: StarGroup): void {
  if (collapsedGroups.value.has(group)) collapsedGroups.value.delete(group)
  else collapsedGroups.value.add(group)
}
function selectCategory(category: StarCategory): void {
  activeCategory.value = category
  clearSearch()
}
function clearSearch(): void {
  query.value = ''
}

async function chooseTraceDirectory(): Promise<void> {
  const choose = window.electronAPI?.starRtkChooseDirectory
  if (!choose) {
    ElMessage.info(t('gnssLib.solver.desktopOnly'))
    return
  }
  busy.value = true
  try {
    const directory = await choose()
    if (directory && !props.disabled) processing.value.trace_directory = directory
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}

async function loadConfig(): Promise<void> {
  const api = window.electronAPI
  if (!api?.starRtkReadConfig || !api.openFileDialog) {
    ElMessage.info(t('gnssLib.solver.desktopOnly'))
    return
  }
  busy.value = true
  try {
    const files = await api.openFileDialog({
      scope: 'starrtk-config',
      filters: [{ name: 'StarRTK YAML', extensions: ['yaml', 'yml'] }],
    })
    if (!files?.[0]) return
    const config = await api.starRtkReadConfig(files[0])
    if (props.disabled) return
    props.applyConfig(config)
    ElMessage.success(t('gnssLib.starRtk.yamlLoaded'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}

async function saveConfig(): Promise<void> {
  const save = window.electronAPI?.rtkPostSaveConfig
  if (!save) {
    ElMessage.info(t('gnssLib.solver.desktopOnly'))
    return
  }
  busy.value = true
  try {
    if (await save(props.exportConfig())) ElMessage.success(t('gnssLib.starRtk.yamlSaved'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.star-options {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  container: star-options / inline-size;
  text-align: left;
}
.options-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
}
.star-config-actions {
  display: flex;
  flex: none;
  gap: 8px;
}
.star-config-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.options-search {
  flex: 1;
  min-width: 0;
}
.options-layout {
  display: grid;
  flex: 1;
  grid-template-columns: 142px minmax(0, 1fr);
  gap: 20px;
  min-height: 0;
}
.options-categories {
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow: auto;
  padding-right: 12px;
  border-right: 1px solid var(--app-border);
}
.options-category {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-secondary);
  text-align: left;
  font: inherit;
  line-height: 1.4;
  cursor: pointer;
}
.options-category:hover {
  background: var(--app-surface-muted);
  color: var(--app-text);
}
.options-category.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}
.options-category-picker {
  display: none;
}
.options-form {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 0 5px 12px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--app-border-strong) transparent;
}
.options-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.options-heading h3 {
  margin: 0;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}
.options-clear {
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-color-primary);
  font: inherit;
  cursor: pointer;
}
.options-empty {
  color: var(--app-text-secondary);
  line-height: 1.7;
}
.options-group + .options-group {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--app-border);
}
.options-group-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  margin: 0 0 12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text-secondary);
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.options-group-toggle .el-icon {
  transition: transform 0.15s;
}
.options-group-toggle .expanded {
  transform: rotate(90deg);
}
.options-field-grid,
.star-directory-field {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}
.options-field-grid > label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  color: var(--app-text);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.options-field-grid :deep(.el-input-number),
.options-field-grid :deep(.el-select) {
  width: 100%;
}
.options-field-grid :deep(.el-input-number .el-input__inner) {
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.options-field-grid :deep(.el-switch) {
  align-self: flex-start;
}
.star-directory-field {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}
.star-directory-field .el-input {
  min-width: 0;
}
.star-directory-field .el-button {
  margin-left: 0;
}
.star-frequency-table {
  width: 100%;
  max-width: 520px;
  border-collapse: collapse;
}
.star-frequency-table th,
.star-frequency-table td {
  padding: 3px 5px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: center;
}
.star-frequency-table th:first-child {
  text-align: start;
}
.star-frequency-hint {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
}
button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
@container star-options (max-width: 640px) {
  .options-layout {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .options-categories {
    display: none;
  }
  .options-category-picker {
    display: block;
    flex: none;
  }
  .options-category-picker .el-select {
    width: 100%;
  }
  .options-form {
    flex: 1;
  }
}
@container star-options (max-width: 440px) {
  .options-toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }
  .star-config-actions :deep(.el-button) {
    flex: 1;
  }
  .options-field-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
