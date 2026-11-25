<template>
  <div class="rtklib-ex-options solver-option-editor">
    <div class="options-toolbar">
      <div class="solver-config-actions">
        <el-button
          size="small"
          :icon="FolderOpened"
          class="keep-action-label"
          :disabled="disabled || busy"
          @click="load"
        >
          {{ t('gnssLib.configWorkspace.loadConf') }}
        </el-button>
        <el-button
          size="small"
          :icon="Download"
          class="keep-action-label"
          :disabled="disabled || busy"
          @click="save"
        >
          {{ t('gnssLib.configWorkspace.saveConf') }}
        </el-button>
      </div>
      <el-input
        v-model="query"
        class="options-search"
        size="small"
        :prefix-icon="Search"
        spellcheck="false"
        clearable
        :placeholder="t('gnssLib.rtklibEx.search')"
        :aria-label="t('gnssLib.rtklibEx.search')"
      />
    </div>
    <div v-if="configPath" class="ex-config-path" :title="configPath">{{ configPath }}</div>
    <div class="options-layout">
      <nav
        class="options-categories"
        role="tablist"
        aria-orientation="vertical"
        :aria-label="t('gnssRaw.solverOptions.categoriesLabel')"
      >
        <button
          v-for="(category, index) in categories"
          :id="`${viewId}-${category}-tab`"
          :key="category"
          :data-category="category"
          class="options-category"
          type="button"
          role="tab"
          :tabindex="activeCategory === category ? 0 : -1"
          :aria-selected="activeCategory === category && !searching"
          :aria-controls="`${viewId}-panel`"
          @click="selectCategory(category)"
          @keydown="switchCategory($event, index)"
        >
          {{ categoryLabel(category) }}
        </button>
      </nav>
      <div class="options-category-picker">
        <el-select
          :model-value="activeCategory"
          :aria-label="t('gnssRaw.solverOptions.categoriesLabel')"
          @update:model-value="selectCategory"
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
          <button v-if="searching" class="options-clear" type="button" @click="query = ''">
            {{ t('gnssRaw.solverOptions.back') }}
          </button>
        </div>
        <p v-if="!groups.length" class="options-empty" role="status">
          {{ t('gnssLib.rtklibEx.noMatches') }}
        </p>
        <section v-for="group in groups" :key="group.id" class="options-group">
          <h4 v-if="searching" class="options-group-title">{{ categoryLabel(group.id) }}</h4>
          <div class="options-field-grid">
            <div
              v-for="field in group.fields"
              :key="field.key"
              class="option-field"
              :class="{ 'is-wide': field.group === 'file' }"
              :data-ex-option="field.key"
            >
              <label :for="`${viewId}-${field.key}`" :title="field.detail" class="ex-field-key">
                {{ field.key }}
                <small
                  v-if="field.format === 1 && field.detail.length > 0 && field.detail.length < 12"
                >
                  {{ field.detail }}
                </small>
              </label>
              <el-select
                v-if="field.choices.length"
                :id="`${viewId}-${field.key}`"
                :model-value="valueOf(field)"
                :aria-label="field.key"
                :disabled="disabled || busy"
                @update:model-value="(value: string) => change(field, value)"
              >
                <el-option
                  v-for="choice in field.choices"
                  :key="choice.code"
                  :label="choice.label"
                  :value="choice.label"
                />
              </el-select>
              <el-input
                v-else
                :id="`${viewId}-${field.key}`"
                :model-value="draftValues[field.key] ?? valueOf(field)"
                :aria-label="field.key"
                :disabled="disabled || busy"
                :title="field.detail"
                spellcheck="false"
                @update:model-value="(value: string) => (draftValues[field.key] = value)"
                @change="(value: string) => change(field, value)"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, FolderOpened, Search } from '@element-plus/icons-vue'
import {
  parseRtkLibExConfig,
  RTKLIB_EX_OPTIONS,
  validateRtkLibExParameters,
  type RtkLibExOption,
  type RtkLibExParameters,
} from '@/core/gnsslib/RtkLibExConfig'
import { t } from '@/i18n'

const props = defineProps<{
  modelValue: RtkLibExParameters
  configPath: string
  disabled: boolean
  saveConfig(): Promise<string | null>
}>()
const emit = defineEmits<{
  'update:modelValue': [parameters: RtkLibExParameters]
  'update:configPath': [path: string]
}>()

const query = ref('')
const busy = ref(false)
const draftValues = reactive<RtkLibExParameters>({})
const viewId = useId()
const categories = [...new Set(RTKLIB_EX_OPTIONS.map(({ group }) => group))]
const activeCategory = ref(categories[0])
const searching = computed(() => !!query.value.trim())
const categoryLabel = (id: string) => t(`gnssLib.rtklibEx.groups.${id}`)
const groups = computed(() => {
  const matches = new Map<string, RtkLibExOption[]>()
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  for (const field of RTKLIB_EX_OPTIONS) {
    if (!searching.value && field.group !== activeCategory.value) continue
    const text = `${field.key} ${field.detail} ${categoryLabel(field.group)}`.toLowerCase()
    if (!terms.every((term) => text.includes(term))) continue
    const group = matches.get(field.group)
    if (group) group.push(field)
    else matches.set(field.group, [field])
  }
  return [...matches].map(([id, fields]) => ({ id, fields }))
})

const heading = computed(() =>
  searching.value
    ? t('gnssRaw.solverOptions.searchResults', {
        count: groups.value.reduce((sum, group) => sum + group.fields.length, 0),
      })
    : categoryLabel(activeCategory.value),
)

function selectCategory(category: string): void {
  activeCategory.value = category
  query.value = ''
}

function switchCategory(event: KeyboardEvent, index: number): void {
  const next =
    event.key === 'ArrowDown'
      ? (index + 1) % categories.length
      : event.key === 'ArrowUp'
        ? (index + categories.length - 1) % categories.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? categories.length - 1
            : -1
  if (next < 0) return
  event.preventDefault()
  selectCategory(categories[next])
  void nextTick(() => document.getElementById(`${viewId}-${categories[next]}-tab`)?.focus())
}

function valueOf(field: RtkLibExOption): string {
  return props.modelValue[field.key] ?? field.defaultValue
}

function change(field: RtkLibExOption, raw: string): void {
  try {
    const value = raw.trim() || (field.format === 2 ? '' : field.defaultValue)
    const parameters = validateRtkLibExParameters({ ...props.modelValue, [field.key]: value })
    emit('update:modelValue', parameters)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    delete draftValues[field.key]
  }
}

async function load(): Promise<void> {
  const api = window.electronAPI?.rtkPostReadConfig
  if (!api || !window.ipcRenderer?.invoke) {
    ElMessage.warning(t('gnssRaw.rtkpost.desktopOnly'))
    return
  }
  busy.value = true
  try {
    const paths = (await window.ipcRenderer.invoke('open-file-dialog', {
      scope: 'rtklib-ex-config',
      filters: [{ name: 'RTKLIB-EX', extensions: ['conf'] }],
    })) as string[] | null
    const path = paths?.[0]
    if (!path) return
    const parameters = parseRtkLibExConfig(await api(path))
    if (!Object.keys(parameters).length) throw new Error(t('gnssLib.rtklibEx.emptyConf'))
    emit('update:modelValue', parameters)
    emit('update:configPath', path)
    ElMessage.success(t('gnssRaw.rtkpost.configLoaded', { count: Object.keys(parameters).length }))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}

async function save(): Promise<void> {
  busy.value = true
  try {
    if (await props.saveConfig()) ElMessage.success(t('gnssRaw.rtkpost.configSaved'))
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.ex-config-path {
  flex: none;
  overflow: hidden;
  padding: 0 var(--ui-space-xs);
  color: var(--app-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-field.is-wide {
  grid-column: 1 / -1;
}

.ex-field-key {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--ui-space-xs);
}

.ex-field-key small {
  color: var(--app-text-muted);
  font-weight: 400;
}
</style>
<style scoped src="./solverOptionLayout.css"></style>
