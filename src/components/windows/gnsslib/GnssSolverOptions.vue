<template>
  <div class="solver-options solver-option-editor">
    <div class="options-toolbar">
      <el-input
        v-model="query"
        size="small"
        class="options-search"
        :prefix-icon="Search"
        :placeholder="t('gnssRaw.solverOptions.search')"
        :aria-label="t('gnssRaw.solverOptions.search')"
        spellcheck="false"
        clearable
      />
      <button
        class="options-modified"
        type="button"
        :aria-pressed="showModified"
        :disabled="!modifiedCount && !showModified"
        :title="
          t(
            modifiedKeys
              ? 'gnssRaw.solverOptions.manualModifiedHint'
              : 'gnssRaw.solverOptions.modifiedHint',
          )
        "
        @click="showModified = !showModified"
      >
        {{ t('gnssRaw.solverOptions.modified', { count: modifiedCount }) }}
      </button>
    </div>

    <div class="options-layout">
      <nav
        class="options-categories"
        role="tablist"
        aria-orientation="vertical"
        :aria-label="t('gnssRaw.solverOptions.categoriesLabel')"
      >
        <button
          v-for="(category, index) in categories"
          :id="`${viewId}-${category.id}-tab`"
          :key="category.id"
          :data-category="category.id"
          class="options-category"
          type="button"
          role="tab"
          :aria-selected="activeCategory === category.id && !searching"
          :aria-controls="`${viewId}-panel`"
          :tabindex="activeCategory === category.id ? 0 : -1"
          @click="selectCategory(category.id)"
          @keydown="switchCategory($event, index)"
        >
          <span>{{ categoryLabel(category.id) }}</span>
          <span
            v-if="category.modified"
            class="modified-count"
            :title="t('gnssRaw.solverOptions.modified', { count: category.modified })"
            >{{ category.modified }}</span
          >
        </button>
      </nav>
      <div class="options-category-picker">
        <el-select
          :model-value="activeCategory"
          :aria-label="t('gnssRaw.solverOptions.categoriesLabel')"
          @update:model-value="selectCategory($event as SolverOptionCategory)"
        >
          <el-option
            v-for="category in categories"
            :key="category.id"
            :value="category.id"
            :label="
              categoryLabel(category.id) + (category.modified ? ` · ${category.modified}` : '')
            "
          />
        </el-select>
      </div>

      <div
        :id="`${viewId}-panel`"
        ref="contentElement"
        class="options-form"
        role="tabpanel"
        :aria-label="heading"
      >
        <div class="options-heading">
          <h3>{{ heading }}</h3>
          <button v-if="searching" class="options-clear" type="button" @click="clearSearch">
            {{ t('gnssRaw.solverOptions.back') }}
          </button>
        </div>
        <p v-if="hiddenModifiedCount && !searching" class="options-retained">
          {{ t('gnssRaw.solverOptions.retained', { count: hiddenModifiedCount }) }}
          <button type="button" @click="showModified = true">
            {{ t('gnssRaw.solverOptions.review') }}
          </button>
        </p>
        <p v-if="!groups.length" class="options-empty" role="status">
          {{
            t(searching ? 'gnssRaw.solverOptions.noMatches' : 'gnssRaw.solverOptions.noApplicable')
          }}
        </p>
        <section v-for="group in groups" :key="group.id" class="options-group">
          <button
            v-if="group.foldable && !searching"
            class="options-group-toggle"
            type="button"
            :aria-expanded="isGroupOpen(group)"
            :aria-controls="`${viewId}-${group.id}`"
            @click="toggleGroup(group.id)"
          >
            <el-icon :class="{ expanded: isGroupOpen(group) }"><ArrowRight /></el-icon>
            <span>{{ group.label }}</span>
            <span v-if="group.modified" class="modified-count">{{ group.modified }}</span>
          </button>
          <h4 v-else-if="searching || activeCategory !== 'common'" class="options-group-title">
            {{ group.label }}
          </h4>
          <div v-if="isGroupOpen(group)" :id="`${viewId}-${group.id}`" class="options-field-grid">
            <div
              v-for="field in group.fields"
              :key="field.key"
              class="option-field"
              :class="{
                'is-wide': field.control === 'systems',
                'is-inactive': !!field.inactiveReason,
              }"
              :data-option="field.key"
            >
              <label
                :id="`${viewId}-${field.key}-label`"
                :for="field.control === 'systems' ? undefined : `${viewId}-${field.key}`"
                :title="field.configKeys.join(' / ')"
              >
                {{ t(field.labelKey) }}
                <span
                  v-if="field.modified"
                  class="option-modified-dot"
                  aria-hidden="true"
                  :title="
                    t(
                      modifiedKeys
                        ? 'gnssRaw.solverOptions.manualModifiedValue'
                        : 'gnssRaw.solverOptions.modifiedValue',
                    )
                  "
                />
              </label>
              <el-select
                v-if="field.control === 'select'"
                :id="`${viewId}-${field.key}`"
                :model-value="selectValue(field)"
                :disabled="disabled || !!field.inactiveReason"
                @update:model-value="updateValue(field, $event)"
              >
                <el-option
                  v-for="choice in field.choices"
                  :key="choice.value"
                  :value="choice.value"
                  :label="choice.labelKey ? t(choice.labelKey) : choice.label"
                />
              </el-select>
              <el-input-number
                v-else-if="field.control === 'number'"
                :id="`${viewId}-${field.key}`"
                :model-value="numberValue(field)"
                :min="field.min"
                :max="field.max"
                :precision="field.precision"
                :step="field.step"
                :step-strictly="field.precision === 0"
                :placeholder="
                  field.key === 'intervalS' ? t('gnssRaw.rtkpost.allEpochs') : undefined
                "
                :disabled="disabled || !!field.inactiveReason"
                controls-position="right"
                @update:model-value="updateValue(field, $event)"
              />
              <el-switch
                v-else-if="field.control === 'switch'"
                :id="`${viewId}-${field.key}`"
                :model-value="!!solverOptionValue(options, field.key)"
                :disabled="disabled || !!field.inactiveReason"
                :aria-label="t(field.labelKey)"
                @update:model-value="updateValue(field, $event)"
              />
              <el-checkbox-group
                v-else
                :model-value="systemValues(field)"
                :disabled="disabled || !!field.inactiveReason"
                :aria-labelledby="`${viewId}-${field.key}-label`"
                @update:model-value="updateValue(field, $event)"
              >
                <el-checkbox v-for="system in systems" :key="system.value" :value="system.value">{{
                  system.label
                }}</el-checkbox>
              </el-checkbox-group>
              <span
                v-if="mode === 'realtime' && field.control === 'systems'"
                class="option-inactive-reason"
              >
                {{ t('gnssLib.rtknavi.systemSupportHint') }}
              </span>
              <code v-if="query.trim()" class="option-config-key">{{
                field.configKeys.join(' / ')
              }}</code>
              <span v-if="field.inactiveReason" class="option-inactive-reason">{{
                t(field.inactiveReason)
              }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { Search, ArrowRight } from '@element-plus/icons-vue'
import { i18n, t, type AppLocale } from '@/i18n'
import {
  SOLVER_OPTION_CATEGORIES,
  isSolverOptionModified,
  solverOptionFields,
  solverOptionInactiveReason,
  solverOptionValue,
  type SolverOptionCategory,
  type SolverOptionField,
  type SolverOptionKey,
  type SolverOptions,
  type SolverOptionsMode,
  type SolverOptionValue,
} from '@/core/gnsslib/GnssSolverOptions'

const props = defineProps<{
  mode: SolverOptionsMode
  options: SolverOptions
  disabled?: boolean
  modifiedKeys?: readonly SolverOptionKey[]
}>()
const emit = defineEmits<{ change: [key: SolverOptionKey, value: SolverOptionValue] }>()
const viewId = `solver-options-${useId()}`
const activeCategory = ref<SolverOptionCategory>('common')
const query = ref('')
const showModified = ref(false)
const contentElement = ref<HTMLElement>()
const expandedGroups = ref(new Set(['filter-measurement']))
const translateAt = i18n.global.t as unknown as (
  key: string,
  named: Record<string, unknown>,
  options: { locale: AppLocale },
) => string
const systems = [
  { value: 'G', label: 'GPS' },
  { value: 'R', label: 'GLONASS' },
  { value: 'E', label: 'Galileo' },
  { value: 'C', label: 'BDS' },
  { value: 'J', label: 'QZSS' },
  { value: 'I', label: 'NavIC' },
]
const categoryLabel = (category: SolverOptionCategory) =>
  t(`gnssRaw.solverOptions.categories.${category}`)
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim()
const fields = computed(() =>
  solverOptionFields(props.mode).map((field) => ({
    ...field,
    modified: props.modifiedKeys
      ? props.modifiedKeys.includes(field.key)
      : isSolverOptionModified(props.mode, props.options, field.key),
    inactiveReason: solverOptionInactiveReason(field, props.options),
    searchText: normalize(
      [
        field.key,
        ...field.configKeys,
        t(field.labelKey),
        translateAt(field.labelKey, {}, { locale: 'en-US' }),
        translateAt(field.labelKey, {}, { locale: 'zh-CN' }),
      ].join(' '),
    ),
  })),
)
type DisplayField = (typeof fields.value)[number]
interface DisplayGroup {
  id: string
  label: string
  foldable: boolean
  modified: number
  fields: DisplayField[]
}

const categories = computed(() =>
  SOLVER_OPTION_CATEGORIES.filter((id) => fields.value.some((field) => field.category === id)).map(
    (id) => ({
      id,
      modified: fields.value.filter((field) => field.category === id && field.modified).length,
    }),
  ),
)
const modifiedCount = computed(() => fields.value.filter((field) => field.modified).length)
const searching = computed(() => !!query.value.trim() || showModified.value)
const hiddenModifiedCount = computed(
  () =>
    fields.value.filter(
      (field) => field.category === activeCategory.value && field.modified && field.inactiveReason,
    ).length,
)
const displayedFields = computed(() => {
  const tokens = normalize(query.value).split(/\s+/).filter(Boolean)
  return fields.value.filter((field) => {
    if (showModified.value && !field.modified) return false
    if (tokens.length) return tokens.every((token) => field.searchText.includes(token))
    return showModified.value || (field.category === activeCategory.value && !field.inactiveReason)
  })
})
const heading = computed(() =>
  query.value.trim()
    ? t('gnssRaw.solverOptions.searchResults', { count: displayedFields.value.length })
    : showModified.value
      ? t('gnssRaw.solverOptions.modifiedTitle')
      : categoryLabel(activeCategory.value),
)
const groups = computed(() => {
  const result: DisplayGroup[] = []
  for (const field of displayedFields.value) {
    const id = `${field.category}-${field.group}`
    let group = result.find((entry) => entry.id === id)
    if (!group) {
      const groupLabel = t(`gnssRaw.solverOptions.groups.${field.group}`)
      group = {
        id,
        label: searching.value ? `${categoryLabel(field.category)} · ${groupLabel}` : groupLabel,
        foldable: field.category === 'filter',
        modified: 0,
        fields: [],
      }
      result.push(group)
    }
    group.fields.push(field)
    if (field.modified) group.modified++
  }
  return result
})

function isGroupOpen(group: DisplayGroup): boolean {
  return searching.value || !group.foldable || expandedGroups.value.has(group.id)
}
function toggleGroup(id: string): void {
  if (expandedGroups.value.has(id)) expandedGroups.value.delete(id)
  else expandedGroups.value.add(id)
}
function selectCategory(category: SolverOptionCategory): void {
  activeCategory.value = category
  clearSearch()
}
function clearSearch(): void {
  query.value = ''
  showModified.value = false
}
function selectValue(field: SolverOptionField): string | number | undefined {
  const value = solverOptionValue(props.options, field.key)
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}
function numberValue(field: SolverOptionField): number | undefined {
  const value = solverOptionValue(props.options, field.key)
  return typeof value === 'number' ? value : undefined
}
function systemValues(field: SolverOptionField): string[] {
  const value = solverOptionValue(props.options, field.key)
  return Array.isArray(value) ? value : []
}
function updateValue(field: SolverOptionField, value: unknown): void {
  if (props.disabled || solverOptionInactiveReason(field, props.options)) return
  if (field.control === 'number') {
    if (field.key === 'intervalS' && (value === undefined || value === null))
      emit('change', field.key, null)
    else if (typeof value === 'number' && Number.isFinite(value)) emit('change', field.key, value)
  } else if (field.control === 'systems') {
    if (
      Array.isArray(value) &&
      value.every((item) => systems.some((system) => system.value === item))
    )
      emit('change', field.key, value)
  } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    emit('change', field.key, value)
}
function switchCategory(event: KeyboardEvent, index: number): void {
  const count = categories.value.length
  const next =
    event.key === 'ArrowDown' || event.key === 'ArrowRight'
      ? (index + 1) % count
      : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? (index + count - 1) % count
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? count - 1
            : -1
  if (next < 0) return
  event.preventDefault()
  selectCategory(categories.value[next].id)
  const tabs = (
    event.currentTarget as HTMLElement
  ).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  void nextTick(() => tabs?.[next]?.focus())
}
watch([activeCategory, query, showModified], () => {
  if (contentElement.value) contentElement.value.scrollTop = 0
})
</script>

<style scoped>
.options-modified {
  flex: none;
  height: 28px;
  padding: 0 var(--ui-space-md);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font: inherit;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}

.options-modified[aria-pressed='true'] {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.options-modified:disabled {
  opacity: 0.6;
  cursor: default;
}

.modified-count {
  flex: none;
  min-width: 17px;
  padding: 1px var(--ui-space-xs);
  border-radius: 5px;
  background: var(--app-surface-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.options-retained {
  margin: 0 0 var(--ui-space-lg);
  color: var(--app-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.options-retained button {
  padding: 0;
  margin-inline-start: var(--ui-space-sm);
  border: 0;
  background: transparent;
  color: var(--el-color-primary);
  font: inherit;
  cursor: pointer;
}

.option-field.is-wide {
  grid-column: 1 / -1;
}

.option-field :deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-xs) var(--ui-space-xl);
}

.option-field :deep(.el-checkbox) {
  margin-right: 0;
}

.option-modified-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-inline-start: var(--ui-space-xs);
  border-radius: 50%;
  background: var(--el-color-primary);
  vertical-align: middle;
}

.option-config-key,
.option-inactive-reason {
  color: var(--app-text-secondary);
  font-size: 10px;
  overflow-wrap: anywhere;
}

.option-inactive-reason {
  line-height: 1.5;
}
</style>
<style scoped src="./solverOptionLayout.css"></style>
