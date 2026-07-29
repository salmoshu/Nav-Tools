<template>
  <el-dialog
    :model-value="modelValue"
    class="app-dialog plot-config-dialog"
    :width="
      viewLayout === 'double' || yAxisConfig === 'double'
        ? 'min(710px, calc(100vw - 24px))'
        : 'min(440px, calc(100vw - 24px))'
    "
    destroy-on-close
    title="Plot 配置"
    :append-to-body="true"
    :z-index="8000"
    align-center
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #header>
      <AppDialogTitle
        :icon="Setting"
        title="Plot 配置"
        description="选择布局、Y 轴和曲线数据源"
      />
    </template>

    <div class="mode-row">
      <span>布局方式：</span>
      <el-radio-group :model-value="viewLayout" @update:model-value="$emit('update:viewLayout', $event)">
        <el-radio-button label="single">单图</el-radio-button>
        <el-radio-button label="double">双图</el-radio-button>
      </el-radio-group>
    </div>
    <div class="mode-row">
      <span>Y轴配置：</span>
      <el-radio-group :model-value="yAxisConfig" @update:model-value="$emit('update:yAxisConfig', $event)">
        <el-radio-button label="single">单Y轴</el-radio-button>
        <el-radio-button label="double">双Y轴</el-radio-button>
      </el-radio-group>
    </div>

    <div class="chart-config-grid" :class="{ 'is-single': activeGroups.length === 1 }">
      <section v-for="group in activeGroups" :key="group.prefix" class="chart-config-section">
        <h4>{{ group.title }}（最多4个）</h4>
        <div v-for="index in 4" :key="index" class="source-row">
          <el-select
            :model-value="
              getConfigValue(
                group.config,
                plotConfigFieldKey(group.prefix, 'source', index),
              )
            "
            popper-class="app-dialog-select-popper"
            placeholder="选择数据"
            @update:model-value="
              setConfigValue(
                group.config,
                plotConfigFieldKey(group.prefix, 'source', index),
                $event,
              )
            "
          >
            <el-option label="<None>" value="" />
            <el-option v-for="source in availableSources" :key="source" :label="source" :value="source" />
          </el-select>
          <el-color-picker
            :model-value="
              getConfigValue(
                group.config,
                plotConfigFieldKey(group.prefix, 'color', index),
              )
            "
            @update:model-value="
              setConfigValue(
                group.config,
                plotConfigFieldKey(group.prefix, 'color', index),
                $event,
              )
            "
          />
          <el-checkbox
            :model-value="
              getConfigValue(
                group.config,
                plotConfigFieldKey(group.prefix, 'useArea', index),
              )
            "
            @update:model-value="
              setConfigValue(
                group.config,
                plotConfigFieldKey(group.prefix, 'useArea', index),
                $event,
              )
            "
          >
            填充
          </el-checkbox>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="config-dialog-footer">
        <div class="config-dialog-footer__secondary">
          <input
            ref="fileInput"
            type="file"
            accept=".json"
            hidden
            @change="handleConfigFileUpload"
          />
          <el-button @click="fileInput?.click()">导入配置</el-button>
          <el-button @click="exportConfigFile">导出配置</el-button>
        </div>
        <div class="config-dialog-footer__primary">
          <el-button @click="$emit('update:modelValue', false)">取消</el-button>
          <el-button type="primary" @click="$emit('apply')">应用配置</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import AppDialogTitle from '@/components/AppDialogTitle.vue'
import { plotConfigFieldKey } from './plotConfigFields'

type LayoutMode = 'single' | 'double'
type AxisMode = 'single' | 'double'
type ConfigRecord = Record<string, { value: unknown }>

const props = defineProps<{
  modelValue: boolean
  viewLayout: LayoutMode
  yAxisConfig: AxisMode
  availableSources: string[]
  singleChartConfig: ConfigRecord
  singleChartDoubleYConfig: ConfigRecord
  doubleChartConfig: ConfigRecord
  doubleChartDoubleYConfig: ConfigRecord
  validateAndApplyConfig: (config: unknown) => void
  exportConfigFile: () => void
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  'update:viewLayout': [value: LayoutMode]
  'update:yAxisConfig': [value: AxisMode]
  apply: []
}>()

const fileInput = ref<HTMLInputElement>()
const activeGroups = computed(() => {
  if (props.viewLayout === 'single' && props.yAxisConfig === 'single') {
    return [{ title: '单图表数据源', prefix: '', config: props.singleChartConfig }]
  }
  if (props.viewLayout === 'single') {
    return [
      { title: '左Y轴数据', prefix: 'left', config: props.singleChartDoubleYConfig },
      { title: '右Y轴数据', prefix: 'right', config: props.singleChartDoubleYConfig },
    ]
  }
  if (props.yAxisConfig === 'single') {
    return [
      { title: '上图表数据源', prefix: 'upper', config: props.doubleChartConfig },
      { title: '下图表数据源', prefix: 'lower', config: props.doubleChartConfig },
    ]
  }
  return [
    { title: '上图左Y轴数据', prefix: 'upperLeft', config: props.doubleChartDoubleYConfig },
    { title: '上图右Y轴数据', prefix: 'upperRight', config: props.doubleChartDoubleYConfig },
    { title: '下图左Y轴数据', prefix: 'lowerLeft', config: props.doubleChartDoubleYConfig },
    { title: '下图右Y轴数据', prefix: 'lowerRight', config: props.doubleChartDoubleYConfig },
  ]
})

function getConfigValue(config: ConfigRecord, key: string): unknown {
  return config[key]?.value
}

function setConfigValue(config: ConfigRecord, key: string, value: unknown): void {
  if (config[key]) config[key].value = value
}

function handleConfigFileUpload(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = loadEvent => {
    try {
      props.validateAndApplyConfig(JSON.parse(String(loadEvent.target?.result ?? '')))
      ElMessage({ message: '配置导入成功', type: 'success', placement: 'bottom-right', offset: 50 })
    } catch {
      ElMessage({ message: '配置文件解析失败，请检查格式是否正确', type: 'error', placement: 'bottom-right', offset: 50 })
    }
  }
  reader.readAsText(file)
  target.value = ''
}
</script>

<style scoped>
.mode-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}

.mode-row > span {
  width: 88px;
}

.chart-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.chart-config-grid.is-single {
  grid-template-columns: minmax(0, 1fr);
}

.chart-config-section {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}

.chart-config-section h4 {
  margin: 0 0 10px;
  color: var(--app-text);
}

.source-row {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) 32px auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.source-row:last-child {
  margin-bottom: 0;
}

.config-dialog-footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.config-dialog-footer__secondary,
.config-dialog-footer__primary {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-dialog-footer .el-button + .el-button {
  margin-left: 0;
}

@media (max-width: 680px) {
  .mode-row {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .mode-row > span {
    width: auto;
  }

  .mode-row :deep(.el-radio-group) {
    display: flex;
  }

  .mode-row :deep(.el-radio-button) {
    flex: 1;
  }

  .mode-row :deep(.el-radio-button__inner) {
    width: 100%;
  }

  .chart-config-grid {
    grid-template-columns: 1fr;
  }

  .config-dialog-footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .config-dialog-footer__secondary,
  .config-dialog-footer__primary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .config-dialog-footer .el-button {
    width: 100%;
  }
}
</style>
