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
          <!-- 为字段名添加点击进入编辑模式的功能 -->
          <span 
            class="status-label"
            @click="showComputedStatus && flowStore.customStatusConfigs.some(config => config.fieldName === statusName) && (!flowData.value || typeof flowData.value !== 'object' || !('rawDataKeys' in flowData.value) || !Array.isArray(flowData.value.rawDataKeys) || !flowData.value.rawDataKeys.includes(statusName)) ? editCustomStatus(statusName) : undefined"
          >{{ statusName }}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- 为值添加点击进入编辑模式的功能 -->
            <span 
              class="status-indicator" 
              :style="getStatusStyle(statusValue)"
              @click="showComputedStatus && flowStore.customStatusConfigs.some(config => config.fieldName === statusName) && (!flowData.value || typeof flowData.value !== 'object' || !('rawDataKeys' in flowData.value) || !Array.isArray(flowData.value.rawDataKeys) || !flowData.value.rawDataKeys.includes(statusName)) ? editCustomStatus(statusName) : undefined"
            >{{ getStatusValue(statusValue) }}</span>
            <!-- 只为自定义属性显示删除按钮 -->
            <template v-if="showComputedStatus && 
                          flowStore.customStatusConfigs.some(config => config.fieldName === statusName) &&
                          (!flowData.value || typeof flowData.value !== 'object' || !('rawDataKeys' in flowData.value) || !Array.isArray(flowData.value.rawDataKeys) || !flowData.value.rawDataKeys.includes(statusName))">
              <el-button 
                type="text" 
                size="small" 
                @click="deleteCustomStatus(statusName)"
                title="删除"
                style="color: #f56c6c; padding: 0; min-width: 20px;"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </div>
        </div>
      </div>
      <div v-if="showComputedStatus">
        <div class="computed-section">
          <span class="status-label">Add new value</span>
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

  <el-dialog
    v-model="showAddDialog"
    width="600px"
    @opened="createCodeEditor"
    @close="resetDialog"
    :title="isEditMode ? '编辑自定义属性' : '添加自定义属性'"
  >
    <!-- 可用字段列表 -->
    <div class="dialog-content">
      <div class="available-fields">
        <h4>可用字段</h4>
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
      
      <!-- 配置区域 -->
      <div class="config-section">
        <!-- 表单内容保持不变，但根据编辑模式使用不同的数据 -->
        <el-form :model="isEditMode ? editStatusConfig : newStatusConfig" label-width="80px">
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
              v-model="newStatusConfig.code" 
              type="textarea" 
              placeholder="请在下方编辑公式" 
              :rows="1"
              :disabled="availableFields.length === 0"
              readonly
              required
            ></el-input>
            <div ref="editorRef" class="editor" style="width: 100%; height: 100px;border:1px solid #ccc;"></div>
            <div class="code-hint">
              说明：直接使用字段名访问数据（如camera_angle），支持常用数学函数或常量（如abs、sqrt、pow、sin、cos、tan、round、floor、ceil、max、min、PI、E）
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
              :predefine="['#ff4500', '#ff8c00', '#ffd700', '#90ee90', '#00ced1', '#1e90ff', '#c71585', '#2c3e50']"
            ></el-color-picker>
            <!-- 新增模式 -->
            <el-color-picker 
              v-else 
              v-model="newStatusConfig.color" 
              show-alpha
              :predefine="['#ff4500', '#ff8c00', '#ffd700', '#90ee90', '#00ced1', '#1e90ff', '#c71585', '#2c3e50']"
            ></el-color-picker>
          </el-form-item>
        </el-form>
      </div>
    </div>
    
    <!-- 对话框底部的操作按钮 -->
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="resetDialog">取消</el-button>
        <el-button type="primary" @click="addNewStatus">确认</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch, nextTick, type Ref } from 'vue'
import { getMonitorStatus, showStatusBar } from '@/composables/useStatusManager'
import { navMode } from '@/settings/config'
import { useFlow } from '@/composables/flow/useFlow'
import { useFlowStore } from '@/stores/flow'
// 4. 导入需要的图标
import { Plus, Close, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElDialog, ElButton, ElInput, ElForm, ElFormItem, ElColorPicker, ElInputNumber, ElMessageBox } from 'element-plus'
import * as monaco from 'monaco-editor'

const editStatusConfig = ref<any>(null)
const isEditMode = ref(false)

// 添加编辑自定义状态的方法
const editCustomStatus = (fieldName: string) => {
  // 查找对应的自定义配置
  const config = flowStore.customStatusConfigs.find(c => c.fieldName === fieldName)
  if (config) {
    // 复制配置到编辑对象
    editStatusConfig.value = { ...config }
    isEditMode.value = true
    showAddDialog.value = true
  }
}

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
    if (key !== 'plotTime' && 
        key !== 'timestamp' && 
        key !== 'isBatchData' && 
        key !== 'rawString' && 
        key !== 'rawDataKeys' &&
        Array.isArray(flowData.value[key])) {
      fields.push(key)
    }
  })
  return fields
})

// 1. 修改 newStatusConfig 定义
const newStatusConfig = ref({
  fieldName: '',
  decimalPlaces: 2,
  color: '#2c3e50',
  code: ''
})

// 2. 修改 selectField 函数
const selectField = (field: string) => {
  newStatusConfig.value.fieldName = field
}

// 3. 修改 addNewStatus 函数
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

    if (flowData.value && flowData.value.rawDataKeys && flowData.value.rawDataKeys.includes(newStatusConfig.value.fieldName)) {
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
      code: newStatusConfig.value.code
    }
  }

  // 调用store的方法添加或更新配置
  flowStore.addNewStatus({
    fieldName: config.fieldName,
    decimalPlaces: config.decimalPlaces,
    color: config.color,
    isCodeDefinition: config.isCodeDefinition !== false,
    code: config.code
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
      code: ''
    }
  }
  showAddDialog.value = false
}

const deleteCustomStatus = (fieldName: string) => {
  // 弹出确认对话框
  ElMessageBox.confirm(
    `确定要删除自定义属性 "${fieldName}" 吗？`,
    '确认删除',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    // 调用store的方法删除配置
    flowStore.removeCustomStatus(fieldName)
    // 显示成功消息
    ElMessage({
      message: `自定义属性删除成功`,
      type: 'success',
      placement: 'bottom-right',
      offset: 50,
    })
  }).catch(() => {
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

/**
 * 代码编辑区域
 */
const editorRef = ref<HTMLDivElement>()   // 容器
let editor: monaco.editor.IStandaloneEditor | null = null
let disposeListener: monaco.IDisposable | null = null
let provider: monaco.languages.CompletionItemProvider | null = null

monaco.languages.register({ id: 'mathjs' })
monaco.languages.setLanguageConfiguration('mathjs', {
  brackets: [['(', ')']],
  autoClosingPairs: [{ open: '(', close: ')' }],
  surroundingPairs: [{ open: '(', close: ')' }]
})
monaco.languages.registerCompletionItemProvider('mathjs', {
  // ① 加入字母触发器
  triggerCharacters: ['(', ',', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
                      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'],

  provideCompletionItems(model, position) {
    const text = model.getValue()
    const offset = model.getOffsetAt(position)

    // ② 向前找“合法前缀”：字母、数字、点
    let start = offset - 1
    while (start >= 0 && /[\w.]/.test(text[start])) start--
    const prefix = text.slice(start + 1, offset)

    // ③ 过滤你的词库
    const list = customHints.value.filter(it =>
      it.label.toLowerCase().startsWith(prefix.toLowerCase())
    )

    return {
      suggestions: list.map(it => ({
        ...it,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: new monaco.Range(
          position.lineNumber, position.column - prefix.length,
          position.lineNumber, position.column
        )
      }))
    }
  }
})

const MATHJS_FUNC_SNIPPETS = [
  { label: 'abs',    insertText: 'abs', kind: Function, doc: '绝对值' },
  { label: 'acos',   insertText: 'acos', kind: Function, doc: '反余弦（弧度）' },
  { label: 'acosh',  insertText: 'acosh', kind: Function, doc: '反双曲余弦' },
  { label: 'asin',   insertText: 'asin', kind: Function, doc: '反正弦（弧度）' },
  { label: 'asinh',  insertText: 'asinh', kind: Function, doc: '反双曲正弦' },
  { label: 'atan',   insertText: 'atan', kind: Function, doc: '反正切（弧度）' },
  { label: 'atan2',  insertText: 'atan2', kind: Function, doc: '双参反正切' },
  { label: 'atanh',  insertText: 'atanh', kind: Function, doc: '反双曲正切' },
  { label: 'ceil',   insertText: 'ceil', kind: Function, doc: '向上取整' },
  { label: 'cos',    insertText: 'cos', kind: Function, doc: '余弦' },
  { label: 'cosh',   insertText: 'cosh', kind: Function, doc: '双曲余弦' },
  { label: 'cube',   insertText: 'cube', kind: Function, doc: 'x³' },
  { label: 'exp',    insertText: 'exp', kind: Function, doc: 'e^x' },
  { label: 'floor',  insertText: 'floor', kind: Function, doc: '向下取整' },
  { label: 'gcd',    insertText: 'gcd', kind: Function, doc: '最大公约数' },
  { label: 'lcm',    insertText: 'lcm', kind: Function, doc: '最小公倍数' },
  { label: 'log',    insertText: 'log', kind: Function, doc: '自然对数' },
  { label: 'log10',  insertText: 'log10', kind: Function, doc: '10 为底对数' },
  { label: 'log2',   insertText: 'log2', kind: Function, doc: '2 为底对数' },
  { label: 'mean',   insertText: 'mean', kind: Function, doc: '算术平均' },
  { label: 'median', insertText: 'median', kind: Function, doc: '中位数' },
  { label: 'min',    insertText: 'min', kind: Function, doc: '最小值' },
  { label: 'max',    insertText: 'max', kind: Function, doc: '最大值' },
  { label: 'pow',    insertText: 'pow', kind: Function, doc: '幂运算' },
  { label: 'random', insertText: 'random', kind: Function, doc: '随机数' },
  { label: 'round',  insertText: 'round', kind: Function, doc: '四舍五入' },
  { label: 'sign',   insertText: 'sign', kind: Function, doc: '符号函数' },
  { label: 'sin',    insertText: 'sin', kind: Function, doc: '正弦' },
  { label: 'sinh',   insertText: 'sinh', kind: Function, doc: '双曲正弦' },
  { label: 'sqrt',   insertText: 'sqrt', kind: Function, doc: '平方根' },
  { label: 'square', insertText: 'square', kind: Function, doc: 'x²' },
  { label: 'tan',    insertText: 'tan', kind: Function, doc: '正切' },
  { label: 'tanh',   insertText: 'tanh', kind: Function, doc: '双曲正切' },
  { label: 'sum',    insertText: 'sum', kind: Function, doc: '求和' },
  { label: 'prod',   insertText: 'prod', kind: Function, doc: '连乘' },
  { label: 'std',    insertText: 'std', kind: Function, doc: '标准差' },
  { label: 'var',    insertText: 'var', kind: Function, doc: '方差' },
  { label: 'det',    insertText: 'det', kind: Function, doc: '矩阵行列式' },
  { label: 'transpose', insertText: 'transpose', kind: Function, doc: '矩阵转置' },
  { label: 'inv',    insertText: 'inv', kind: Function, doc: '矩阵求逆' }
]

monaco.languages.registerCompletionItemProvider('mathjs', {
  provideCompletionItems() {
    return {
      suggestions: MATHJS_FUNC_SNIPPETS.map(item => ({
        ...item,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: monaco.Range.fromPositions(position, position)
      }))
    }
  }
})

// 常量还需要完善
// const MATHJS_CONSTANTS = [
//   { label: 'PI',  insertText: 'PI',  kind: Constant, doc: '圆周率 π' },
//   { label: 'E',   insertText: 'E',   kind: Constant, doc: '自然底数 e' },
//   { label: 'LN2', insertText: 'LN2', kind: Constant, doc: 'ln(2)' },
//   { label: 'LN10',insertText: 'LN10',kind: Constant, doc: 'ln(10)' },
//   { label: 'LOG2E',insertText:'LOG2E',kind:Constant, doc: 'log2(e)' },
//   { label: 'LOG10E',insertText:'LOG10E',kind:Constant, doc: 'log10(e)' },
//   { label: 'SQRT1_2',insertText:'SQRT1_2',kind:Constant, doc: '√0.5' },
//   { label: 'SQRT2',insertText:'SQRT2',kind:Constant, doc: '√2' }
// ]

const customHints = ref([
  ...MATHJS_FUNC_SNIPPETS,
  // ...MATHJS_CONSTANTS,
])

monaco.languages.registerCompletionItemProvider('mathjs', {
  provideCompletionItems() {
    // 每次补全都会重新读取 dynamicWords.value
    return { suggestions: customHints.value }
  }
})

function addWord(label: string) {
  customHints.value.push({
    label,
    kind: monaco.languages.CompletionItemKind.Text,
    insertText: label
  })
}

watch(availableFields, (newFields) => {
  if(provider) {
    provider.dispose()
  }
  // 动态添加补全项
  newFields.forEach(field => {
    addWord(field)
  })
})

async function createCodeEditor() {
  // 必须等 DOM 真正插入完成
  await nextTick()
  await new Promise(r => requestAnimationFrame(r))

  if(editor) {
    editor.dispose();
    disposeListener?.dispose();
  }

  // 2. 创建编辑器
  editor = monaco.editor.create(editorRef.value!, {
    value: '',
    language: 'mathjs',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on'
  })

  disposeListener = editor.onDidChangeModelContent(() => {
    const newCode = editor!.getValue() // 最新全文

    if(isEditMode.value) {
      editStatusConfig.value.code = newCode;
    } else {
      newStatusConfig.value.code = newCode;
    }
  })
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
  text-align: left;
}

:deep(.monaco-editor .view-lines) {
  text-align: left !important;
}
</style>
