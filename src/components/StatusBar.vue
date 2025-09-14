<template>
  <div 
    class="statusbar"
    :class="[`statusbar-${position}`, { 'statusbar-dragging': isDragging }]"
    :style="statusbarStyle"
    @mousedown="startDrag"
  >
    <div class="statusbar-handle">
      <span class="statusbar-title">Status View</span>
      <el-button
        type="text"
        @click="showStatusBar = false"
        class="remove-btn"
        title="移除卡片"
      >
        <el-icon><Close /></el-icon>
      </el-button>
    </div>
    <div class="statusbar-content">
      <div v-for="(statusValue, statusName) in getMonitorStatus()" :key="statusName" class="status-item">
        <div class="status-item-row">
          <span class="status-label">{{ statusName }}</span>
          <span class="status-indicator" :style="getStatusStyle(statusValue)">{{ getStatusValue(statusValue) }}</span>
        </div>
      </div>
      <!-- 暂时屏蔽计算属性功能 -->
      <div v-if="false && showComputedStatus">
        <div class="computed-section">
          <span>计算属性</span>
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
      >
      </div>
    </div>
  </div>

  <!-- 添加新状态的对话框 -->
  <el-dialog
    v-model="showAddDialog"
    title="添加新状态属性"
    width="600px"
    @close="resetDialog"
  >
    <div class="dialog-content">
      <div class="available-fields">
        <h4>可用数据字段</h4>
        <div class="fields-list">
          <div 
            v-for="field in availableFields" 
            :key="field"
            class="field-item"
            @click="selectField(field)"
          >
            {{ field }}
          </div>
        </div>
      </div>
      
      <div class="config-section">
        <h4>属性配置</h4>
        <el-form :model="newStatusConfig" label-width="80px">
          <el-form-item label="字段名">
            <el-input v-model="newStatusConfig.fieldName" placeholder="选择或输入字段名"></el-input>
          </el-form-item>
          <el-form-item label="显示名称">
            <el-input v-model="newStatusConfig.displayName" placeholder="设置显示名称"></el-input>
          </el-form-item>
          <el-form-item label="小数位数">
            <el-input-number v-model="newStatusConfig.decimalPlaces" :min="0" :max="10" :step="1"></el-input-number>
          </el-form-item>
          <el-form-item label="颜色">
            <el-color-picker v-model="newStatusConfig.color" show-alpha></el-color-picker>
          </el-form-item>
        </el-form>
      </div>
      
      <div class="code-section">
        <h4>高级代码定义（可选）</h4>
        <div class="code-editor">
          <el-input
            type="textarea"
            v-model="newStatusConfig.code"
            placeholder="输入JavaScript代码定义新属性值，例如：
    'flowData.' + fieldName + '[flowData.' + fieldName + '.length - 1] * 2'
    或复杂计算：'Math.sqrt(flowData.x[flowData.x.length - 1] * flowData.x[flowData.x.length - 1] + flowData.y[flowData.y.length - 1] * flowData.y[flowData.y.length - 1])'"
            :rows="4"
          ></el-input>
          <p class="code-hint">提示：使用'flowData'访问所有可用数据，'fieldName'为当前选择的字段名</p>
        </div>
      </div>
    </div>
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="addNewStatus">确定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch, type Ref } from 'vue'
import { getMonitorStatus, showStatusBar } from '@/composables/useStatusManager'
import { navMode } from '@/settings/config'
import { useFlow } from '@/composables/flow/useFlow'
import { useFlowStore } from '@/stores/flow'
import { Plus, Close } from '@element-plus/icons-vue'
import { ElDialog, ElButton, ElInput, ElForm, ElFormItem, ElColorPicker, ElInputNumber } from 'element-plus'

const showComputedStatus = computed(() => {
  return navMode.funcMode === 'flow'
})

const commonStyle = {
  trueStyle: 'color: #00b894; background: rgba(0, 184, 148, 0.1); font-weight: 700;',
  falseStyle: 'color: #ff6b6b; background: rgba(255, 107, 107, 0.1); font-weight: 700;'
}

const getStatusStyle = (status: any) => {
  if (typeof status === 'boolean') {
    return status ? commonStyle.trueStyle : commonStyle.falseStyle
  }
  return ''
}

const getStatusValue = (status: any) => {
  if (typeof status === 'boolean') {
    return status ? 'True' : 'False'
  }
  if (typeof status === 'number') {
    return status.toFixed(2)
  }
  return status
}

// Flow相关
const { flowData } = useFlow()
const flowStore = useFlowStore()

// 对话框相关
const showAddDialog = ref(false)
const availableFields = computed(() => {
  // 获取flowData中除了元数据外的所有数组字段
  const fields: string[] = []
  Object.keys(flowData.value).forEach(key => {
    if (key !== 'timestamps' && 
        key !== 'timestamp' && 
        key !== 'isBatchData' && 
        key !== 'rawString' && 
        Array.isArray(flowData.value[key])) {
      fields.push(key)
    }
  })
  console.log(fields)
  return fields
})

const newStatusConfig = ref({
  fieldName: '',
  displayName: '',
  decimalPlaces: 2,
  color: '#2c3e50',
  code: ''
})

const selectField = (field: string) => {
  newStatusConfig.value.fieldName = field
  // 默认使用字段名作为显示名称，用户可以修改
  if (!newStatusConfig.value.displayName) {
    newStatusConfig.value.displayName = field
  }
}

const addNewStatus = () => {
  if (!newStatusConfig.value.displayName) {
    // 至少需要设置显示名称
    return
  }
  
  // 创建配置对象
  const config = {
    ...newStatusConfig.value,
    // 如果有代码定义，则标记为代码类型
    isCodeDefinition: !!newStatusConfig.value.code
  }
  
  // 调用flowStore的方法添加新状态
  if (flowStore.addCustomStatus) {
    flowStore.addCustomStatus(config)
  }
  
  // 关闭对话框并重置
  showAddDialog.value = false
  resetDialog()
}

const resetDialog = () => {
  newStatusConfig.value = {
    fieldName: '',
    displayName: '',
    decimalPlaces: 2,
    color: '#2c3e50',
    code: ''
  }
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
  position: 'right' as const
})

const statusbarStyle = computed(() => {
  return {
    left: `${statusbarRect.value.x}px`,
    top: `${statusbarRect.value.y}px`
  }
})

const getDockZoneStyle = (zone: 'left' | 'right') => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const toolbarWidth = toolbarSize?.value?.width || 40
  
  switch (zone) {
    case 'left':
      // 当toolbar也在左边时，dock-zone应该从toolbar右侧开始
      const leftOffset = toolbarPosition?.value === 'left' ? toolbarWidth : 0
      return {
        top: '0px',
        left: `${leftOffset}px`,
        width: `${dockWidth}px`,
        height: `${windowHeight}px`
      }
    case 'right':
      // 当toolbar也在右边时，dock-zone应该从toolbar左侧开始
      const rightOffset = toolbarPosition?.value === 'right' ? toolbarWidth : 0
      return {
        top: '0px',
        left: `${windowWidth - dockWidth - rightOffset}px`,
        width: `${dockWidth}px`,
        height: `${windowHeight}px`
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
    position: position.value as typeof originalState.value.position
  }

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
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
    { zone: 'right' as const, distance: windowWidth - x - dockWidth }
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
      y: originalState.value.y
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
    { zone: 'right', distance: windowWidth - x - dockWidth }
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
const toolbarSize = inject<Ref<{width: number, height: number}>>('toolbarSize')

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

onMounted(() => {
  snapToEdge()
  window.addEventListener('resize', snapToEdge)
  
  // 监听工具栏位置变化
  watch([toolbarPosition, toolbarSize], () => {
    snapToEdge()
  }, { immediate: true })
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
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 999;
  border: 3px solid rgb(210, 210, 210);
  border-top: 2px solid rgb(210, 210, 210);
  border-radius: 0;
  padding: 0;
  margin: 0;
  width: 200px;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: auto;
  user-select: none;        /* 现代浏览器 */
  -webkit-user-select: none;/* Safari */
  -moz-user-select: none;   /* Firefox */
  -ms-user-select: none;    /* IE11/Edge 旧版 */
}

.statusbar:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.statusbar-left {
  left: 0;
  top: 0;
  border-radius: 0;
}

.statusbar-right {
  right: 0;
  top: 0;
  border-radius: 0;
}

.statusbar-handle {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  cursor: grab;
  padding: 0 8px;
  margin: 0 auto;
  text-align: center;
  background-color: #f8f9fa;
  border-bottom: 2px solid #dee2e6;
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  border-radius: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.statusbar-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
}

.statusbar-content h3 {
  margin: 0;
  padding: 4px 0;
  font-size: 12px;
  text-align: center;
  border-bottom: 1px solid #34495e;
  margin-bottom: 4px;
}

.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  transition: all 0.3s ease;
  margin: 4px 0;
}

.status-item:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  background: rgba(233, 236, 239, 0.8);
  transform: translateY(-2px);
}

.status-label {
  color: #6c757d;
  font-weight: 600;
  font-size: 12px;
  line-height: 1.5;
  box-sizing: border-box;
  text-align: left;
  min-width: 60px;
}

.status-indicator {
  color: #2c3e50;
  font-weight: 600;
  font-size: 14px;
  padding: 4px 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
  text-align: right;
  flex-grow: 1;
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
  z-index: 998;
}

.statusbar-dragging .statusbar-dock-zones {
  opacity: 1;
  pointer-events: auto;
}

.status-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.dock-zone {
  position: fixed;
  background: rgba(52, 152, 219, 0.2);
  border: 2px dashed #3498db;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3498db;
  font-size: 12px;
  font-weight: bold;
  z-index: 999;
  transition: all 0.3s;
  box-sizing: border-box;
}

.dock-zone:hover {
  background: rgba(52, 152, 219, 0.4);
}

.statusbar-title {
  margin: 0 auto;
}

.remove-btn {
  color: #6c757d;
}

/* 计算属性区域样式 */
.computed-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background-color: #f8f9fa;
  border-radius: 4px;
  margin-top: 8px;
}

.add-btn {
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
}

/* 对话框内容样式 */
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.available-fields h4,
.config-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
}

.fields-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.field-item {
  padding: 6px 12px;
  background-color: #fff;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.field-item:hover {
  background-color: #e3f2fd;
  border-color: #3498db;
}

.config-section {
  margin-top: 10px;
}

.code-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
}

.code-editor {
  margin-top: 10px;
}

.code-editor textarea {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
}

.code-hint {
  margin-top: 5px;
  font-size: 12px;
  color: #909399;
  font-style: italic;
}
</style>
