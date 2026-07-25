<template>
  <div
    class="statusbar"
    :class="[`statusbar-${position}`, { 'statusbar-dragging': isDragging }]"
    :style="statusbarStyle"
    @mousedown="startDrag"
  >
    <div class="statusbar-handle">
      <div class="statusbar-heading">
        <span class="statusbar-title-icon">
          <el-icon><DataAnalysis /></el-icon>
        </span>
        <span class="statusbar-heading-copy">
          <strong class="statusbar-title">Status View</strong>
          <small :class="{ active: hasMonitorStatus }">
            <i></i>
            {{ hasMonitorStatus ? `${statusCount} live metrics` : 'Waiting for data' }}
          </small>
        </span>
      </div>
      <el-button type="text" @click="showStatusBar = false" class="remove-btn" title="移除卡片">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>
    <div class="statusbar-content">
      <draggable
        :list="orderedEntries"
        item-key="0"
        handle=".status-drag-handle"
        class="status-draggable"
        :animation="200"
        easing="cubic-bezier(0.22, 1, 0.36, 1)"
        :force-fallback="true"
        :fallback-on-body="true"
        :fallback-tolerance="4"
        ghost-class="status-ghost"
        drag-class="status-drag-clone"
        @end="onSortEnd"
      >
        <template #item="{ element }">
          <div class="status-item" :class="getStatusClass(element[1])">
            <div class="status-item-row">
              <span class="status-drag-handle" @mousedown.stop>
                <el-icon><Rank /></el-icon>
              </span>
              <!-- 为字段名添加点击进入编辑模式的功能 -->
              <span
                class="status-label"
                :title="String(element[0])"
                @click="showComputedStatusDialog(element[0])"
              >
                {{ formatStatusName(String(element[0])) }}
              </span>
              <span class="status-state-dot" aria-hidden="true"></span>
              <div class="status-value-row">
                <!-- 为值添加点击进入编辑模式的功能 -->
                <span
                  class="status-indicator"
                  :title="String(getStatusValue(element[1], String(element[0])))"
                  @click="showComputedStatusDialog(element[0])"
                  >{{ getStatusValue(element[1], String(element[0])) }}</span
                >
                <!-- 只为自定义属性显示删除按钮 -->
                <template
                  v-if="
                    showComputedStatus &&
                    flowStore.customStatusConfigs.some((config) => config.fieldName === element[0]) &&
                    (!flowData.value ||
                      typeof flowData.value !== 'object' ||
                      !('rawDataKeys' in flowData.value) ||
                      !Array.isArray(flowData.value.rawDataKeys) ||
                      !flowData.value.rawDataKeys.includes(element[0]))
                  "
                >
                  <el-button
                    type="text"
                    size="small"
                    @click="deleteCustomStatus(element[0])"
                    title="删除"
                    class="delete-status-btn"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </template>
              </div>
            </div>
          </div>
        </template>
      </draggable>
      <div v-if="!hasMonitorStatus" class="status-empty">
        <span class="status-empty-icon"><el-icon><DataAnalysis /></el-icon></span>
        <strong>暂无状态数据</strong>
        <small>连接数据源后，实时指标将在这里呈现</small>
      </div>
      <div v-if="showComputedStatus">
        <div class="computed-section">
          <span>
            <strong>Add metric</strong>
            <small>Custom computed value</small>
          </span>
          <el-button type="primary" size="small" @click="showAddDialog = true" class="add-btn">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <div class="statusbar-dock-zones" v-if="isDragging && activeDockZone">
      <div
        :class="['dock-zone', `dock-zone-${activeDockZone}`]"
        :style="getDockZoneStyle(activeDockZone)"
      ></div>
    </div>
  </div>

  <el-dialog
    v-model="showAddDialog"
    class="app-dialog status-property-dialog"
    width="min(600px, calc(100vw - 24px))"
    :append-to-body="true"
    :z-index="8000"
    align-center
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    @opened="createCodeEditor1"
    @close="resetDialog"
    :title="isEditMode ? '编辑自定义属性' : '添加自定义属性'"
  >
    <template #header>
      <AppDialogTitle
        :icon="isEditMode ? Edit : Plus"
        :title="isEditMode ? '编辑自定义属性' : '添加自定义属性'"
        description="从数据字段创建状态栏显示项"
      />
    </template>

    <!-- 可用字段列表 -->
    <div class="dialog-content">
      <div class="available-fields">
        <div class="status-section-heading">
          <div>
            <h4>可用字段</h4>
            <p>点击字段即可快速填入名称</p>
          </div>
          <el-tag size="small" type="info">{{ availableFields.length }} 项</el-tag>
        </div>
        <div v-if="availableFields.length > 0" class="fields-list">
          <div
            v-for="field in availableFields"
            :key="field"
            class="field-item"
            @click="selectField(field)"
          >
            {{ field }}
          </div>
        </div>
        <div v-else class="fields-empty">
          <el-icon><InfoFilled /></el-icon>
          <span>连接数据源后，可在这里快速选择字段</span>
        </div>
      </div>

      <!-- 配置区域 -->
      <div class="config-section">
        <!-- 表单内容保持不变，但根据编辑模式使用不同的数据 -->
        <el-form
          :model="isEditMode ? editStatusConfig : newStatusConfig"
          label-position="top"
          @submit.prevent
        >
          <el-form-item label="字段名" prop="fieldName" :disabled="isEditMode">
            <!-- 编辑模式 -->
            <el-input
              v-if="isEditMode"
              v-model="editStatusConfig.fieldName"
              placeholder="选择或输入字段名"
              required
            ></el-input>
            <!-- 新增模式 -->
            <el-input
              v-else
              v-model="newStatusConfig.fieldName"
              placeholder="选择或输入字段名"
              :disabled="availableFields.length === 0"
              required
            ></el-input>
          </el-form-item>

          <!-- 计算公式表单项 -->
          <el-form-item label="计算公式" prop="code">
            <!-- 编辑模式 -->
            <el-input
              v-if="isEditMode"
              v-show="false"
              v-model="editStatusConfig.code"
              type="textarea"
              placeholder="请在下方编辑公式"
              :rows="1"
              readonly
              required
            ></el-input>
            <!-- 新增模式 -->
            <el-input
              v-else
              v-show="false"
              v-model="newStatusConfig.code"
              type="textarea"
              placeholder="请在下方编辑公式"
              :rows="1"
              :disabled="availableFields.length === 0"
              readonly
              required
            ></el-input>
            <div class="code-editor-container">
              <div ref="editorRef" class="code-editor"></div>
            </div>
            <div class="code-hint">
              说明：直接使用字段名访问数据（如camera_angle），支持常用数学函数或常量（如abs、sqrt、sin、cos、max、min、PI、E等）
            </div>
          </el-form-item>

          <!-- 小数位数表单项 -->
          <el-form-item label="小数位数" prop="decimalPlaces">
            <!-- 编辑模式 -->
            <el-input-number
              v-if="isEditMode"
              v-model="editStatusConfig.decimalPlaces"
              :min="0"
              :max="10"
              :step="1"
            ></el-input-number>
            <!-- 新增模式 -->
            <el-input-number
              v-else
              v-model="newStatusConfig.decimalPlaces"
              :min="0"
              :max="10"
              :step="1"
              :disabled="availableFields.length === 0"
            ></el-input-number>
          </el-form-item>

          <!-- 颜色选择表单项 -->
          <!-- 颜色选择功能以后再增加 -->
          <el-form-item v-if="false" label="颜色" prop="color">
            <!-- 编辑模式 -->
            <el-color-picker
              v-if="isEditMode"
              v-model="editStatusConfig.color"
              show-alpha
              :predefine="[
                '#ff4500',
                '#ff8c00',
                '#ffd700',
                '#90ee90',
                '#00ced1',
                '#1e90ff',
                '#c71585',
                '#2c3e50',
              ]"
            ></el-color-picker>
            <!-- 新增模式 -->
            <el-color-picker
              v-else
              v-model="newStatusConfig.color"
              show-alpha
              :predefine="[
                '#ff4500',
                '#ff8c00',
                '#ffd700',
                '#90ee90',
                '#00ced1',
                '#1e90ff',
                '#c71585',
                '#2c3e50',
              ]"
            ></el-color-picker>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 对话框底部的操作按钮 -->
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="resetDialog">取消</el-button>
        <el-button type="primary" @click="addNewStatus">
          {{ isEditMode ? '保存修改' : '添加属性' }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch, type Ref } from 'vue'
import draggable from 'vuedraggable'
import {
  editorRef,
  isEditMode,
  showStatusBar,
  newStatusConfig,
  editStatusConfig,
  getMonitorStatus,
  statusOrder,
  setStatusOrder,
  createCodeEditor,
} from '@/composables/useStatusManager'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { useFlow } from '@/composables/flow/useFlow'
import { useFlowStore } from '@/stores/flow'
// 4. 导入需要的图标
import { Plus, Close, Delete, Edit, InfoFilled, DataAnalysis, Rank } from '@element-plus/icons-vue'
import AppDialogTitle from '@/components/AppDialogTitle.vue'
import {
  ElMessage,
  ElDialog,
  ElButton,
  ElInput,
  ElForm,
  ElFormItem,
  ElColorPicker,
  ElInputNumber,
  ElMessageBox,
} from 'element-plus'

const { activeDataModes } = useApplicationSelector()
const monitorStatus = computed(() => getMonitorStatus())
const hasMonitorStatus = computed(() => Object.keys(monitorStatus.value).length > 0)
const statusCount = computed(() => Object.keys(monitorStatus.value).length)

// 按用户自定义顺序展示状态项
const orderedEntries = ref<[string, any][]>([])

watch(
  monitorStatus,
  (status) => {
    const entryMap = new Map(Object.entries(status))
    const existingKeys = new Set(orderedEntries.value.map(([key]) => key))
    const nextEntries: [string, any][] = []

    // 保留用户已调整的顺序
    for (const [key, value] of orderedEntries.value) {
      if (entryMap.has(key)) nextEntries.push([key, entryMap.get(key)])
    }
    // 追加新增字段
    for (const [key, value] of entryMap) {
      if (!existingKeys.has(key)) nextEntries.push([key, value])
    }

    orderedEntries.value = nextEntries
  },
  { immediate: true, deep: true },
)

function onSortEnd() {
  setStatusOrder(orderedEntries.value.map(([key]) => key))
}

// 添加编辑自定义状态的方法
const editCustomStatus = (fieldName: string) => {
  // 查找对应的自定义配置
  const config = flowStore.customStatusConfigs.find((c) => c.fieldName === fieldName)
  if (config) {
    // 复制配置到编辑对象
    editStatusConfig.value = { ...config }
    isEditMode.value = true
    showAddDialog.value = true
  }
}

const showComputedStatus = computed(() => {
  return activeDataModes.value.includes('flow')
})

const showComputedStatusDialog = (statusName: string) => {
  return showComputedStatus.value &&
    flowStore.customStatusConfigs.some((config) => config.fieldName === statusName) &&
    (!flowData.value ||
      typeof flowData.value !== 'object' ||
      !('rawDataKeys' in flowData.value) ||
      !Array.isArray(flowData.value.rawDataKeys) ||
      !flowData.value.rawDataKeys.includes(statusName))
    ? editCustomStatus(statusName)
    : undefined
}

const getStatusClass = (status: unknown) => ({
  'status-positive': status === true,
  'status-negative': status === false,
  'status-empty-value': status === '' || status === null || status === undefined,
})

const formatStatusName = (name: string) =>
  name
    .replace(/^([^.]+)\./, '$1 · ')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const getStatusValue = (status: unknown, statusName = '') => {
  if (typeof status === 'boolean') {
    return status ? 'ON' : 'OFF'
  }
  if (typeof status === 'number') {
    if (!Number.isFinite(status)) return '—'
    if (/latitude|longitude/i.test(statusName)) return status.toFixed(6)
    return Number.isInteger(status) ? status.toLocaleString() : status.toFixed(2)
  }
  if (status === '' || status === null || status === undefined) return '—'
  return String(status)
}

// Flow相关
const { flowData } = useFlow()
const flowStore = useFlowStore()

// 对话框相关
const showAddDialog = ref(false)
const availableFields = computed(() => {
  // 获取flowData中除了元数据外的所有数组字段
  const fields: string[] = []
  Object.keys(flowData.value).forEach((key) => {
    if (
      key !== 'plotTime' &&
      key !== 'timestamp' &&
      key !== 'isBatchData' &&
      key !== 'rawString' &&
      key !== 'rawDataKeys' &&
      Array.isArray(flowData.value[key])
    ) {
      fields.push(key)
    }
  })
  return fields
})

const selectField = (field: string) => {
  newStatusConfig.value.fieldName = field
}

const addNewStatus = () => {
  let config
  if (isEditMode.value && editStatusConfig.value) {
    // 编辑模式
    config = editStatusConfig.value
  } else {
    // 新增模式
    // 检查字段名是否为空
    if (!newStatusConfig.value.fieldName) {
      ElMessage({
        message: `请输入字段名`,
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
      return
    }

    // 检查代码是否为空（设为必填项）
    if (!newStatusConfig.value.code) {
      ElMessage({
        message: `请输入自定义计算代码`,
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
      return
    }

    if (
      flowData.value &&
      flowData.value.rawDataKeys &&
      flowData.value.rawDataKeys.includes(newStatusConfig.value.fieldName)
    ) {
      ElMessage({
        message: `自定义字段名称与原始字段名重复`,
        type: 'error',
        placement: 'bottom-right',
        offset: 50,
      })
      return
    }

    config = {
      fieldName: newStatusConfig.value.fieldName,
      decimalPlaces: newStatusConfig.value.decimalPlaces,
      color: newStatusConfig.value.color,
      isCodeDefinition: true,
      code: newStatusConfig.value.code,
    }
  }

  // 调用store的方法添加或更新配置
  flowStore.addNewStatus({
    fieldName: config.fieldName,
    decimalPlaces: config.decimalPlaces,
    color: config.color,
    isCodeDefinition: config.isCodeDefinition !== false,
    code: config.code,
  })

  // 显示成功消息
  ElMessage({
    message: `状态${isEditMode.value ? '更新' : '添加'}成功`,
    type: 'success',
    placement: 'bottom-right',
    offset: 50,
  })

  // 关闭对话框并重置
  showAddDialog.value = false
  resetDialog()
}

// 4. 修改 resetDialog 函数
const resetDialog = () => {
  if (isEditMode.value) {
    editStatusConfig.value = null
    isEditMode.value = false
  } else {
    newStatusConfig.value = {
      fieldName: '',
      decimalPlaces: 2,
      color: '#2c3e50',
      code: '',
    }
  }
  showAddDialog.value = false
}

const deleteCustomStatus = (fieldName: string) => {
  // 弹出确认对话框
  ElMessageBox.confirm(`确定要删除自定义属性 "${fieldName}" 吗？`, '确认删除', {
    confirmButtonText: '确定',
    confirmButtonClass: 'el-button--danger',
    cancelButtonText: '取消',
    type: 'warning',
    customClass: 'app-message-box',
    closeOnClickModal: true,
    closeOnPressEscape: true,
  })
    .then(() => {
      // 调用store的方法删除配置
      flowStore.removeCustomStatus(fieldName)
      // 显示成功消息
      ElMessage({
        message: `自定义属性删除成功`,
        type: 'success',
        placement: 'bottom-right',
        offset: 50,
      })
    })
    .catch(() => {
      // 用户取消删除
      ElMessage({
        message: `已取消删除`,
        type: 'info',
        placement: 'bottom-right',
        offset: 50,
      })
    })
}

const dockWidth = 200
const position = ref<'left' | 'right'>('right')
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const statusbarRect = ref({ x: 0, y: 0 })
const activeDockZone = ref<'left' | 'right' | null>(null)

const emit = defineEmits<{
  positionChange: [position: 'left' | 'right']
}>()

const originalState = ref({
  x: 0,
  y: 0,
  position: 'right' as const,
})

const statusbarStyle = computed(() => {
  return {
    left: `${statusbarRect.value.x}px`,
    top: `${statusbarRect.value.y}px`,
  }
})

const getDockZoneStyle = (zone: 'left' | 'right') => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const toolbarWidth = toolbarSize?.value?.width || 40

  switch (zone) {
    case 'left': {
      // 当toolbar也在左边时，dock-zone应该从toolbar右侧开始
      const leftOffset = toolbarPosition?.value === 'left' ? toolbarWidth : 0
      return {
        top: '0px',
        left: `${leftOffset}px`,
        width: `${dockWidth}px`,
        height: `${windowHeight}px`,
      }
    }
    case 'right': {
      // 当toolbar也在右边时，dock-zone应该从toolbar左侧开始
      const rightOffset = toolbarPosition?.value === 'right' ? toolbarWidth : 0
      return {
        top: '0px',
        left: `${windowWidth - dockWidth - rightOffset}px`,
        width: `${dockWidth}px`,
        height: `${windowHeight}px`,
      }
    }
    default:
      return {}
  }
}

const startDrag = (event: MouseEvent) => {
  const handle = (event.target as HTMLElement).closest('.statusbar-handle')
  if (!handle) return

  isDragging.value = true
  activeDockZone.value = null

  originalState.value = {
    x: statusbarRect.value.x,
    y: statusbarRect.value.y,
    position: position.value as typeof originalState.value.position,
  }

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }

  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
}

const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false

  const threshold = 50
  const windowWidth = window.innerWidth
  const x = statusbarRect.value.x

  let shouldSnap = false
  let finalPosition = position.value

  // 只考虑左右两侧的吸附
  const distances = [
    { zone: 'left' as const, distance: x },
    { zone: 'right' as const, distance: windowWidth - x - dockWidth },
  ]

  let minDistance = Infinity
  distances.forEach(({ zone, distance }) => {
    if (distance < threshold && distance < minDistance) {
      minDistance = distance
      finalPosition = zone
      shouldSnap = true
    }
  })

  if (shouldSnap) {
    position.value = finalPosition
    emit('positionChange', finalPosition)
    snapToEdge()
  } else {
    statusbarRect.value = {
      x: originalState.value.x,
      y: originalState.value.y,
    }
    position.value = originalState.value.position
    emit('positionChange', originalState.value.position)
  }

  activeDockZone.value = null
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const handleDrag = (event: MouseEvent) => {
  if (!isDragging.value) return

  const x = event.clientX - dragOffset.value.x
  const y = event.clientY - dragOffset.value.y

  statusbarRect.value = { x, y }

  // 只检测左右两侧的吸附区域
  const threshold = 50
  const windowWidth = window.innerWidth

  let nearestZone: 'left' | 'right' | null = null
  let minDistance = Infinity

  const distances = [
    { zone: 'left', distance: x },
    { zone: 'right', distance: windowWidth - x - dockWidth },
  ]

  distances.forEach(({ zone, distance }) => {
    if (distance < threshold && distance < minDistance) {
      minDistance = distance
      nearestZone = zone as 'left' | 'right'
    }
  })

  activeDockZone.value = nearestZone
}

// 注入工具栏位置信息
const toolbarPosition = inject<Ref<'top' | 'right' | 'bottom' | 'left'>>('toolbarPosition')
const toolbarSize = inject<Ref<{ width: number; height: number }>>('toolbarSize')

// 计算状态栏高度（考虑工具栏位置）
const statusbarHeight = computed(() => {
  const toolbarHeight = toolbarSize?.value?.height || 40
  if (toolbarPosition?.value === 'top' || toolbarPosition?.value === 'bottom') {
    return `calc(100vh - ${toolbarHeight}px)`
  }
  return '100vh'
})

// 计算状态栏顶部偏移（工具栏在顶部时）
const statusbarTop = computed(() => {
  const toolbarHeight = toolbarSize?.value?.height || 40
  if (toolbarPosition?.value === 'top') {
    return `${toolbarHeight}px`
  }
  return '0'
})

const snapToEdge = () => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const toolbarHeight = toolbarSize?.value?.height || 40
  const toolbarWidth = toolbarSize?.value?.width || 40

  switch (position.value) {
    case 'left':
      // 当状态栏在左边时，考虑工具栏的位置
      if (toolbarPosition?.value === 'left') {
        // 如果工具栏也在左边，状态栏在工具栏右侧（toolbar宽度40px）
        statusbarRect.value = { x: toolbarWidth, y: 0 }
      } else if (toolbarPosition?.value === 'top') {
        // 如果工具栏在上边，状态栏从顶部偏移
        statusbarRect.value = { x: 0, y: toolbarHeight }
      } else {
        statusbarRect.value = { x: 0, y: 0 }
      }
      break
    case 'right':
      // 当状态栏在右边时，考虑工具栏的位置
      if (toolbarPosition?.value === 'right') {
        // 如果工具栏也在右边，状态栏在工具栏左侧（toolbar宽度40px）
        statusbarRect.value = { x: windowWidth - dockWidth - toolbarWidth, y: 0 }
      } else if (toolbarPosition?.value === 'top') {
        // 如果工具栏在上边，状态栏从顶部偏移
        statusbarRect.value = { x: windowWidth - dockWidth, y: toolbarHeight }
      } else {
        statusbarRect.value = { x: windowWidth - dockWidth, y: 0 }
      }
      break
  }

  emit('positionChange', position.value)
}

/**
 * 公式编辑
 */
import { addMonacoWords } from '@/composables/useStatusManager'
watch(availableFields, (newFields) => {
  newFields.forEach((field) => {
    addMonacoWords(field)
  })
})

function createCodeEditor1() {
  createCodeEditor()
}

onMounted(() => {
  snapToEdge()
  window.addEventListener('resize', snapToEdge)

  // 监听工具栏位置变化
  watch(
    [toolbarPosition, toolbarSize],
    () => {
      snapToEdge()
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('resize', snapToEdge)
})
</script>

<style scoped>
.statusbar {
  position: fixed;
  box-sizing: border-box;
  color: var(--app-text);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--el-color-primary) 4%, var(--app-surface)) 0,
      var(--app-surface) 150px
    );
  display: flex;
  flex-direction: column;
  align-items: stretch;
  z-index: 999;
  border: 1px solid var(--app-border);
  border-radius: 0;
  padding: 0;
  margin: 0;
  width: 200px;
  height: 100vh;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
  box-shadow: -8px 0 28px color-mix(in srgb, var(--app-shadow) 55%, transparent);
  user-select: none; /* 现代浏览器 */
  -webkit-user-select: none; /* Safari */
  -moz-user-select: none; /* Firefox */
  -ms-user-select: none; /* IE11/Edge 旧版 */
}

.statusbar-left {
  left: 0;
  top: v-bind(statusbarTop);
  border-radius: 0;
  height: calc(v-bind(statusbarHeight) - var(--app-header-height));
  margin-top: var(--app-header-height);
  box-shadow: 8px 0 28px color-mix(in srgb, var(--app-shadow) 55%, transparent);
}

.statusbar-right {
  right: 0;
  top: v-bind(statusbarTop);
  border-radius: 0;
  height: calc(v-bind(statusbarHeight) - var(--app-header-height));
  margin-top: var(--app-header-height);
}

.statusbar-handle {
  flex: 0 0 56px;
  color: var(--app-text);
  cursor: grab;
  padding: 0 10px 0 12px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface)) 0%,
      var(--app-surface-muted) 75%
    );
  border-bottom: 1px solid var(--app-border);
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.statusbar-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.statusbar-title-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 26%, var(--app-border));
  border-radius: 9px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
  box-shadow: 0 4px 12px color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}

.statusbar-heading-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.statusbar-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 720;
  letter-spacing: 0.01em;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.statusbar-heading-copy small {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--app-text-muted);
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
}

.statusbar-heading-copy small i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-border-strong);
}

.statusbar-heading-copy small.active i {
  background: var(--el-color-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-success) 14%, transparent);
}

.statusbar-content {
  display: flex;
  min-height: 0;
  flex-direction: column;
  flex: 1;
  gap: 7px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  font-size: 12px;
  padding: 10px 9px 12px;
  width: 100%;
  box-sizing: border-box;
}

.status-empty {
  display: flex;
  min-height: 170px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 18px 12px;
  color: var(--app-text-muted);
  text-align: center;
}

.status-empty-icon {
  display: grid;
  width: 42px;
  height: 42px;
  margin-bottom: 4px;
  place-items: center;
  border: 1px dashed color-mix(in srgb, var(--el-color-primary) 35%, var(--app-border));
  border-radius: 13px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 8%, var(--app-surface));
  font-size: 19px;
}

.status-empty strong {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.status-empty small {
  max-width: 145px;
  font-size: 11px;
  line-height: 1.55;
}

.statusbar-content h3 {
  margin: 0;
  padding: 4px 0;
  font-size: 12px;
  text-align: center;
  border-bottom: 1px solid var(--app-border-strong);
  margin-bottom: 4px;
}

.status-item {
  position: relative;
  flex: 0 0 auto;
  min-height: 58px;
  box-sizing: border-box;
  padding: 9px 10px 10px;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-surface-muted));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--app-shadow) 22%, transparent);
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    transform 140ms ease;
}

.status-item:hover {
  border-color: color-mix(in srgb, var(--el-color-primary) 38%, var(--app-border));
  background: color-mix(in srgb, var(--el-color-primary) 4%, var(--app-surface));
  transform: translateY(-1px);
}

.status-item .status-indicator {
  min-width: 0;
  color: color-mix(in srgb, var(--el-color-primary) 82%, var(--app-text));
  font-weight: 400;
  font-size: 13px;
  letter-spacing: -0.015em;
  line-height: 1.3;
  padding: 3px 0 0;
  box-sizing: border-box;
  text-align: left;
  flex-grow: 1;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  white-space: normal;
}

.status-positive {
  border-color: color-mix(in srgb, var(--el-color-success) 30%, var(--app-border));
}

.status-positive .status-indicator,
.status-positive .status-state-dot {
  color: var(--el-color-success);
}

.status-positive .status-state-dot {
  background: var(--el-color-success);
}

.status-negative {
  border-color: color-mix(in srgb, var(--el-color-danger) 30%, var(--app-border));
}

.status-negative .status-indicator,
.status-negative .status-state-dot {
  color: var(--el-color-danger);
}

.status-negative .status-state-dot {
  background: var(--el-color-danger);
}

.status-empty-value .status-indicator {
  color: var(--app-text-muted);
}

.statusbar-dock-zones {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
  z-index: 9000;
}

.statusbar-dragging .statusbar-dock-zones {
  opacity: 1;
  pointer-events: auto;
}

.status-item-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.status-drag-handle {
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  color: var(--app-text-muted);
  cursor: grab;
  opacity: 0.55;
  transition: opacity 140ms ease;
}

.status-drag-handle:hover {
  opacity: 1;
  color: var(--el-color-primary);
}

.status-label {
  grid-column: 2;
  min-width: 0;
  color: var(--app-text-muted);
  font-weight: 650;
  font-size: 10px;
  letter-spacing: 0.045em;
  line-height: 1.25;
  box-sizing: border-box;
  text-align: left;
  text-transform: uppercase;
  overflow-wrap: anywhere;
  white-space: normal;
}

.status-state-dot {
  grid-column: 3;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-border-strong);
}

.status-value-row {
  display: flex;
  min-width: 0;
  grid-column: 1 / -1;
  align-items: flex-start;
  gap: 7px;
}

.status-draggable {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

/* 排序拖拽：落点占位槽（仿 iOS 桌面挤压效果） */
.status-ghost {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--el-color-primary) 45%, var(--app-border));
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  box-shadow: none;
  transition: none;
}

.status-ghost > * {
  opacity: 0;
}

/* 排序拖拽：跟随光标的悬浮克隆体（SortableJS 已内联 position/z-index/pointer-events，
   且其定位使用 inline transform，因此这里只做阴影与描边高亮，不可用 transform） */
.status-drag-clone {
  border-color: color-mix(in srgb, var(--el-color-primary) 60%, var(--app-border));
  background: var(--app-surface);
  box-shadow:
    0 16px 38px color-mix(in srgb, var(--app-shadow) 65%, transparent),
    0 0 0 1px color-mix(in srgb, var(--el-color-primary) 22%, transparent);
  cursor: grabbing;
  transition: none;
}

.dock-zone {
  position: fixed;
  background: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  border: 2px dashed var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: bold;
  z-index: 999;
  transition: all 0.3s;
  box-sizing: border-box;
}

.dock-zone:hover {
  background: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
}

.remove-btn {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  padding: 0;
  border-radius: 8px;
  color: var(--app-text-muted);
}

.remove-btn:hover {
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 9%, transparent);
}

.delete-status-btn {
  width: 22px;
  min-width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 6px;
  color: var(--el-color-danger);
}

/* 计算属性区域样式 */
.computed-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px dashed color-mix(in srgb, var(--el-color-primary) 40%, var(--app-border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--el-color-primary) 5%, var(--app-surface));
  margin-top: 2px;
}

.computed-section > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.computed-section strong {
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 680;
}

.computed-section small {
  overflow: hidden;
  max-width: 115px;
  color: var(--app-text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  font-size: 12px;
}

/* 对话框内容样式 */
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.available-fields h4,
.config-section h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.status-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.status-section-heading p {
  margin: 3px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.fields-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 132px;
  overflow-y: auto;
  padding: 10px;
  background-color: var(--app-surface-muted);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.fields-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  border: 1px dashed var(--app-border);
  border-radius: 8px;
  color: var(--app-text-muted);
  background: var(--app-surface-muted);
  font-size: 12px;
}

.fields-empty .el-icon {
  flex: none;
  color: var(--el-color-primary);
}

.field-item {
  padding: 6px 12px;
  background-color: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.field-item:hover {
  background-color: color-mix(in srgb, var(--el-color-primary) 12%, var(--app-surface));
  border-color: var(--el-color-primary);
}

.config-section {
  padding-top: 2px;
}

.code-editor-container {
  width: 100%;
  height: 100px;
  border: 1px solid var(--app-border);
  overflow: hidden;
  border-radius: 7px;
  margin-top: 4px;
  padding-left: 8px;
  font-size: 14px;
  transition: border-color 0.2s cubic-bezier(0.645, 0.045, 0.355, 1);
  box-sizing: border-box;
}

.code-editor {
  width: 100%;
  height: 96px;
}

.code-editor-container:hover {
  border-color: #c0c4cc;
}

.code-editor-container:focus-within {
  outline: none;
  border-color: #409eff;
}

.code-hint {
  margin-top: 7px;
  font-size: 12px;
  color: #909399;
  font-style: italic;
  text-align: left;
  line-height: 1.5;
}

:global(.status-property-dialog .el-form-item) {
  margin-bottom: 16px;
}

:global(.status-property-dialog .el-form-item:last-child) {
  margin-bottom: 0;
}

:global(.status-property-dialog .el-form-item__label) {
  height: auto;
  margin-bottom: 7px;
  color: var(--app-text-secondary);
  line-height: 1.35;
}

:deep(.monaco-editor .view-lines) {
  text-align: left !important;
}
</style>
