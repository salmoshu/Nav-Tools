<template>
  <div class="motor-config-container">
    <div class="controls">
      <div class="file-controls">
        <!-- 左侧按钮 -->
        <div class="left-buttons">
          <el-button type="default" size="small" @click="showConfigDialog" class="config-btn">
            <el-icon><Setting /></el-icon>&nbsp;配置
          </el-button>
        </div>
      </div>
    </div>
    
    <!-- 配置内容区域 -->
    <div class="config-content">
      <!-- 指令下发控制区域 -->
      <div class="command-control">
        <el-tabs v-model="activeControlTab" type="card" class="control-tabs">
          <el-tab-pane name="read">
            <template #label>
              <span>
                <el-icon><Position /></el-icon>
                读指令
                <el-tag size="small" type="info" v-if="readCommands.length > 0">{{ readCommands.length }}</el-tag>
              </span>
            </template>
            <div class="command-list">
              <div v-for="cmd in readCommands" :key="cmd.name" class="command-item">
                <el-button 
                  type="primary" 
                  size="default"
                  @click="sendReadCommand(cmd)"
                  :disabled="!isConfigValid"
                  :class="{ 'is-active': activeReadCommands.has(cmd.name), 'command-btn': true }"
                >
                  <el-icon><Position /></el-icon>
                  {{ activeReadCommands.has(cmd.name) ? '停止' : cmd.name }}
                </el-button>
                <div class="frequency-input-wrapper">
                  <el-input-number
                    v-model="cmd.frequency"
                    placeholder="频率"
                    size="default"
                    :min="0"
                    :max="100"
                    :disabled="!isConfigValid || activeReadCommands.has(cmd.name)"
                    controls-position="right"
                    style="width: 100px;"
                  />
                  <span class="frequency-label">Hz</span>
                </div>
              </div>
              <el-empty v-if="readCommands.length === 0" description="暂无读指令配置" :image-size="48" />
            </div>
          </el-tab-pane>
          
          <el-tab-pane name="write">
            <template #label>
              <span>
                <el-icon><Edit /></el-icon>
                写指令
                <el-tag size="small" type="info" v-if="writeCommands.length > 0">{{ writeCommands.length }}</el-tag>
              </span>
            </template>
            <div class="command-list">
              <div v-for="cmd in writeCommands" :key="cmd.name" class="command-item">
                <el-button 
                  type="success" 
                  size="default"
                  @click="sendWriteCommand(cmd)"
                  :disabled="!isConfigValid"
                  class="command-btn"
                >
                  <el-icon><Edit /></el-icon>
                  {{ cmd.name }}
                </el-button>
                <div class="data-input-wrapper">
                  <!-- 单个输入框模式（兼容旧数据） -->
                  <div v-if="getDataCount(cmd) === 1" class="single-data-input">
                    <el-input
                      v-model="decimalInputs[cmd.name]"
                      placeholder=""
                      size="default"
                      :disabled="!isConfigValid || cmd.length===0"
                      @input="(value: string) => handleSingleDecimalInput(cmd, value)"
                    />
                    <span class="hex-display">{{ cmd.data }}</span>
                  </div>
                  <!-- 多个输入框模式 -->
                  <div v-else class="multi-data-inputs">
                    <div v-for="(dataItem, index) in splitData(cmd.data, getDataCount(cmd))" :key="index" class="multi-input-item">
                      <el-input
                        v-model="decimalInputs[getDataInputKey(cmd, index)]"
                        placeholder=""
                        size="default"
                        :disabled="!isConfigValid"
                        @input="(value: string) => updateDataValueWithDecimal(cmd, index, value)"
                      />
                      <span class="hex-display">{{ dataItem }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <el-empty v-if="writeCommands.length === 0" description="暂无写指令配置" :image-size="48" />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 配置对话框 -->
    <el-dialog
      v-model="configDialogVisible"
      title="电机驱动指令配置"
      width="800px"
      top="3vh"
      :close-on-click-modal="false"
      custom-class="motor-config-dialog"
    >
      <div class="dialog-content">
        <!-- 配置操作栏 -->
        <div class="config-actions">
          <el-upload
            ref="uploadRef"
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            accept=".json"
            :on-change="handleFileLoad"
          >
            <template #trigger>
              <el-button type="primary" :icon="Upload" size="default">
                载入配置
              </el-button>
            </template>
          </el-upload>
          
          <el-button type="success" :icon="Download" size="default" @click="downloadConfig">
            下载配置
          </el-button>
          
          <el-button type="warning" :icon="Refresh" size="default" @click="resetConfig">
            重置配置
          </el-button>
        </div>

        <el-divider />

        <!-- 指令预览区域 -->
        <div class="command-preview-container">
          <div class="message-preview">
            <div 
              v-for="(field, index) in previewMessage" 
              :key="index"
              class="preview-cell"
              :class="'field-' + field.type"
              :title="field.label + ': ' + field.value"
            >
              <div class="cell-content">{{ field.value }}</div>
              <div class="cell-label">{{ field.label }}</div>
            </div>
          </div>
          <div class="preview-hex" v-if="previewHex">
            <el-text type="info" size="small">十六进制: </el-text>
            <span class="hex-content">{{ previewHex }}</span>
          </div>
        </div>

        <el-divider />

        <!-- 命令配置 Tab -->
        <el-tabs v-model="activeTab" type="border-card" class="command-tabs">
          <!-- 指令结构 Tab -->
          <el-tab-pane name="structure">
            <template #label>
              <span class="tab-label">
                <el-icon><Rank /></el-icon>
                指令结构
              </span>
            </template>
            
            <!-- 基础配置 - 拖拽式报文结构 -->
            <div class="message-structure-container">
              <el-text type="info" size="small" style="margin-bottom: 15px; display: block;">
                拖拽下方模块来调整报文结构（报头始终在前，校验和始终在后）
              </el-text>
              
              <draggable
                v-model="messageStructure"
                :group="{ name: 'messageFields' }"
                :animation="200"
                :forceFallback="true"
                class="message-fields-container"
                item-key="id"
                @change="handleStructureChange"
              >
                <template #item="{ element }">
                  <div class="message-field" :class="{ 'fixed-field': element.fixed }">
                    <div class="field-header">
                      <el-icon class="drag-handle"><Rank /></el-icon>
                      <span class="field-title">{{ element.title }}</span>
                      <el-tag size="small" :type="element.tagType">{{ element.tag }}</el-tag>
                    </div>
                    <div class="field-content">
                      <!-- 报头字段 -->
                      <div v-if="element.id === 'header'" class="field-config">
                        <el-input 
                          v-model="configForm.header" 
                          placeholder="例如: AACC"
                          size="small"
                          style="width: 80px;"
                        >
                          <template #prefix>
                            <el-icon><Key /></el-icon>
                          </template>
                        </el-input>
                      </div>
                      
                      <!-- 地址字段 -->
                      <div v-else-if="element.id === 'address'" class="field-config">
                        <el-switch :model-value="false" size="small" active-text="包含地址位" />
                      </div>
                      
                      <!-- 功能码字段 -->
                      <div v-else-if="element.id === 'function'" class="field-config">
                        <el-switch v-model="configForm.includeFunction" size="small" active-text="包含功能码" />
                      </div>
                      
                      <!-- 长度字段 -->
                      <div v-else-if="element.id === 'length'" class="field-config">
                        <el-switch :model-value="false" size="small" active-text="包含长度位" />
                      </div>
                      
                      <!-- 数据字段 -->
                      <div v-else-if="element.id === 'data'" class="field-config">
                        <el-switch :model-value="false" size="small" active-text="包含数据位" />
                      </div>
                      
                      <!-- 校验和字段 -->
                      <div v-else-if="element.id === 'checksum'" class="field-config">
                        <el-select 
                          v-model="configForm.checksum.method" 
                          placeholder="校验方法"
                          size="small"
                          style="width: 80px;"
                        >
                          <el-option label="和校验" value="sum" />
                          <el-option label="XOR" value="xor" />
                          <el-option label="CRC8" value="crc8" />
                          <el-option label="CRC16" value="crc16" />
                        </el-select>
                        <div class="checksum-params" v-if="configForm.checksum.method">
                          <el-input-number 
                            v-model="configForm.checksum.start_index" 
                            :min="0" 
                            size="small"
                            controls-position="right"
                            style="width: 70px;"
                            placeholder="起始"
                          />
                          <span class="param-separator">-</span>
                          <el-input-number 
                            v-model="configForm.checksum.end_index" 
                            :min="-1" 
                            size="small"
                            controls-position="right"
                            style="width: 70px;"
                            placeholder="结束"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </draggable>
            </div>
          </el-tab-pane>

          <el-tab-pane name="read">
            <template #label>
              <span class="tab-label">
                <el-icon><Upload /></el-icon>
                读命令
                <el-tag size="small" type="info">{{ readCommands.length }}</el-tag>
              </span>
            </template>
            
            <div class="command-header">
              <el-text type="info" size="small">读取电机状态的相关命令（数据长度和数据类型用以决定应答数据）</el-text>
              <el-button type="primary" size="small" @click="addCommand('read')" :icon="Plus" :disabled="activeReadCommands.size > 0">
                添加读命令
              </el-button>
            </div>
            
            <el-table :data="readCommands" style="width: 100%" size="default" class="command-table" stripe>
              <el-table-column prop="name" label="命令名称" min-width="180">
                <template #default="scope">
                  <el-input v-model="scope.row.name" size="default" :disabled="activeReadCommands.has(scope.row.name)">
                    <template #prefix>
                      <el-icon><Position /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="address" label="寄存器地址" width="120">
                <template #default="scope">
                  <el-input v-model="scope.row.address" size="default" placeholder="00" :disabled="activeReadCommands.has(scope.row.name)">
                    <template #prepend>0x</template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="length" label="数据长度" width="100">
                <template #default="scope">
                  <el-input-number v-model="scope.row.length" size="default" :min="0" :max="32" controls-position="right" style="width: 100%;"/>
                </template>
              </el-table-column>
              <el-table-column prop="data" label="默认数据" width="120">
                <template #default="scope">
                  <el-input size="default" placeholder="" disabled>
                    <template #prefix>
                      <el-icon><DataAnalysis /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="dataType" label="数据类型" width="100">
                <template #default="scope">
                  <el-select v-model="scope.row.dataType" size="default" :disabled="activeReadCommands.has(scope.row.name)">
                    <el-option label="int16" value="int16" />
                    <el-option label="float32" value="float32" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="50" align="center">
                <template #default="scope">
                  <el-button
                    type="danger"
                    size="small"
                    @click="removeCommand('read', scope.$index)"
                    :disabled="activeReadCommands.has(scope.row.name)"
                    :icon="Delete"
                    circle
                  />
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane name="write">
            <template #label>
              <span class="tab-label">
                <el-icon><Download /></el-icon>
                写命令
                <el-tag size="small" type="info">{{ writeCommands.length }}</el-tag>
              </span>
            </template>
            
            <div class="command-header">
              <el-text type="info" size="small">控制电机运行的相关命令</el-text>
              <el-button type="primary" size="small" @click="addCommand('write')" :icon="Plus">
                添加写命令
              </el-button>
            </div>
            
            <el-table :data="writeCommands" style="width: 100%" size="default" class="command-table" stripe>
              <el-table-column prop="name" label="命令名称" min-width="180">
                <template #default="scope">
                  <el-input v-model="scope.row.name" size="default">
                    <template #prefix>
                      <el-icon><Edit /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="address" label="寄存器地址" width="120">
                <template #default="scope">
                  <el-input v-model="scope.row.address" size="default" placeholder="00">
                    <template #prepend>0x</template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="length" label="数据长度" width="100">
                <template #default="scope">
                  <el-input-number v-model="scope.row.length" size="default" :min="0" :max="32" controls-position="right" style="width: 100%;" />
                </template>
              </el-table-column>
              <el-table-column prop="data" label="默认数据" width="120">
                <template #default="scope">
                  <el-input 
                    v-model="scope.row.data" 
                    :disabled="scope.row.length===0"
                    size="default" 
                    placeholder="十进制或十六进制"
                  >
                    <template #prefix>
                      <el-icon><DataAnalysis /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="dataType" label="数据类型" width="100">
                <template #default="scope">
                  <el-select v-model="scope.row.dataType" size="default">
                    <el-option label="int16" value="int16" />
                    <el-option label="float32" value="float32" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="50" align="center">
                <template #default="scope">
                  <el-button
                    type="danger"
                    size="small"
                    @click="removeCommand('write', scope.$index)"
                    :icon="Delete"
                    circle
                  />
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="configDialogVisible = false" :icon="Close">取消</el-button>
          <el-button type="primary" @click="saveConfig" :icon="Check">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, watch, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMotorCmd } from '@/composables/motor/useMotorCmd'
import draggable from 'vuedraggable'
import { 
  Setting, 
  Key, 
  Coin, 
  Document, 
  Download, 
  Upload, 
  Plus, 
  Delete, 
  Position, 
  Edit, 
  DataAnalysis, 
  Check, 
  Close,
  Refresh,
  Rank
} from '@element-plus/icons-vue'

// 使用指令配置钩子
const {
  configForm,
  readCommands,
  writeCommands,
  currentConfig,
  formattedConfig,
  isConfigValid,
  addCommand,
  removeCommand,
  // 数据转换函数
  getDataCount,
  splitData,
  getDataInputKey,
  decimalToHex,
  hexToDecimal,
  calculateChecksum,
  // 指令构建函数
  buildReadCommandMessage,
  buildWriteCommandMessage,
  // 指令状态缓存初始化函数
  initializeCommandStatusCache
} = useMotorCmd()

// 响应式变量
const configDialogVisible = ref(false)
const activeTab = ref('read')
const activeControlTab = ref('read')
const uploadRef = ref()
const dataInputs = ref<Record<string, string>>({})
const decimalInputs = ref<Record<string, string>>({}) // 存储十进制输入值

// 拖拽式报文结构配置
const addressLength = ref(1) // 地址字段长度（字节）
const includeLength = ref(true) // 是否包含长度字段（默认可变）
const lengthBytes = ref(1) // 长度字段字节数
const functionBytes = ref(1) // 功能码字段字节数

// 指令预览相关
const previewMessage = ref<Array<{type: string, label: string, value: string, color: string}>>([])
const previewHex = ref('')

// 报文字段配置
const messageFields = reactive([
  { 
    id: 'header', 
    title: '报头', 
    tag: '固定', 
    tagType: 'info' as const, 
    fixed: true 
  },
  { 
    id: 'address', 
    title: '地址', 
    tag: '可变', 
    tagType: 'success' as const, 
    fixed: false 
  },
  { 
    id: 'function', 
    title: '功能码', 
    tag: '可选', 
    tagType: 'warning' as const, 
    fixed: false 
  },
  { 
    id: 'length', 
    title: '长度', 
    tag: '可变', 
    tagType: 'success' as const, 
    fixed: false 
  },
  { 
    id: 'data', 
    title: '数据', 
    tag: '可变', 
    tagType: 'success' as const, 
    fixed: false 
  },
  { 
    id: 'checksum', 
    title: '校验和', 
    tag: '固定', 
    tagType: 'info' as const, 
    fixed: true 
  }
])

// 拖拽排序后的字段列表
const messageStructure = computed({
  get() {
    // 确保报头始终在最前，校验和始终在最后
    const headerField = messageFields.find(f => f.id === 'header')
    const checksumField = messageFields.find(f => f.id === 'checksum')
    
    // 获取所有中间字段（不再过滤功能码字段，让它始终可见）
    const middleFields = messageFields.filter(f => f.id !== 'header' && f.id !== 'checksum')
    
    // 根据用户拖拽排序中间字段
    return [headerField, ...middleFields, checksumField]
  },
  set(newValue) {
    // 更新字段顺序（保持报头和校验和的固定位置）
    const newOrder = newValue.map(field => field.id)
    messageFields.sort((a, b) => {
      const aIndex = newOrder.indexOf(a.id)
      const bIndex = newOrder.indexOf(b.id)
      return aIndex - bIndex
    })
  }
})

// IPC事件监听器引用
const serialSuccessListener = (event: any, result: any) => {
  console.log('串口数据发送成功:', result.data)
}

const serialErrorListener = (event: any, error: any) => {
  console.error('串口数据发送失败:', error.error)
  ElMessage({
    message: `串口发送失败: ${error.error}`,
    type: 'error',
    duration: 2000,
    placement: 'bottom-right',
    offset: 50,
  })
}

// localStorage键名
const STORAGE_KEY = 'motor-config'

// 从localStorage加载配置
const loadConfigFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const config = JSON.parse(stored)
      // 使用统一的 loadConfig 函数处理配置加载
      loadConfig(config)
      console.log('配置已从localStorage加载')
      return true
    }
  } catch (error) {
    console.error('从localStorage加载配置失败:', error)
  }
  return false
}

// 保存配置到localStorage
const saveConfigToStorage = () => {
  try {
    const config = currentConfig.value
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    console.log('配置已保存到localStorage')
  } catch (error) {
    console.error('保存配置到localStorage失败:', error)
  }
}

// 全局定时器相关
const globalTimer = ref<number | null>(null)
const activeReadCommands = ref<Set<string>>(new Set())

// 监听写指令数据变化，更新多输入框
watch(writeCommands, (newCommands) => {
  newCommands.forEach(cmd => {
    const count = getDataCount(cmd)
    if (count > 1) {
      const dataArray = splitData(cmd.data, count)
      for (let i = 0; i < count; i++) {
        const key = getDataInputKey(cmd, i)
        dataInputs.value[key] = dataArray[i] || ''
      }
    }
  })
  generateCommandPreview()
}, { deep: true })

// 监听读指令数据变化
watch(readCommands, () => {
  generateCommandPreview()
}, { deep: true })

// 监听拖拽结构变化
watch(messageStructure, () => {
  generateCommandPreview()
}, { deep: true })

// 监听配置变化
watch([() => configForm.header, () => configForm.checksum.method, addressLength, includeLength, lengthBytes, () => configForm.includeFunction, functionBytes], () => {
  generateCommandPreview()
}, { deep: true })

// 监听标签页切换
watch(activeTab, () => {
  generateCommandPreview()
})

// 方法
const showConfigDialog = () => {
  configDialogVisible.value = true
}

// 处理报文结构变化
const handleStructureChange = (event: any) => {
  console.log('报文结构已更新:', messageStructure.value.map(f => f.title))
  // 这里可以添加保存用户偏好的逻辑
  ElMessage({
    message: '报文结构已更新',
    type: 'success',
    duration: 1000,
    placement: 'bottom-right',
    offset: 50,
  })
}

// 保存配置
const saveConfig = () => {
  try {
    // 保存到localStorage
    saveConfigToStorage()
    
    // 同时保存拖拽式报文结构配置
    const structureConfig = {
      addressLength: addressLength.value,
      includeLength: includeLength.value,
      lengthBytes: lengthBytes.value,
      includeFunction: configForm.includeFunction
    }
    localStorage.setItem('motor-structure-config', JSON.stringify(structureConfig))
    
    configDialogVisible.value = false
    ElMessage({
      message: '配置保存成功',
      type: 'success',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  } catch (error) {
    ElMessage({
      message: '配置保存失败',
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

// 生成指令预览
const generateCommandPreview = () => {
  const preview = []
  let hexString = ''
  
  // 获取当前选中的指令
  const currentCommands = activeTab.value === 'read' ? readCommands.value : writeCommands.value
  
  if (currentCommands.length === 0) {
    previewMessage.value = []
    previewHex.value = ''
    return
  }
  
  // 使用第一个指令作为预览示例
  const command = currentCommands[0]
  
  // 根据拖拽顺序构建预览
  messageStructure.value.forEach(field => {
    if (!field) return
    
    switch (field.id) {
      case 'header':
        if (configForm.header) {
          preview.push({
            type: 'header',
            label: '报头',
            value: configForm.header,
            color: '#667eea'
          })
          hexString += configForm.header + ' '
        }
        break
        
      case 'address':
        if (command.address !== undefined) {
          const addressHex = decimalToHex(command.address, addressLength.value)
          preview.push({
            type: 'address',
            label: '地址',
            value: addressHex,
            color: '#f093fb'
          })
          hexString += addressHex + ' '
        }
        break
        
      case 'function':
        if (configForm.includeFunction && command.functionCode !== undefined) {
          // functionCode 已经是十六进制字符串，直接使用
          const functionHex = command.functionCode.padStart(functionBytes.value * 2, '0').toUpperCase()
          preview.push({
            type: 'function',
            label: '功能码',
            value: functionHex,
            color: '#4facfe'
          })
          hexString += functionHex + ' '
        }
        break
        
      case 'length':
        if (includeLength.value && command.length !== undefined) {
          const lengthHex = decimalToHex(command.length, lengthBytes.value)
          preview.push({
            type: 'length',
            label: '长度',
            value: lengthHex,
            color: '#43e97b'
          })
          hexString += lengthHex + ' '
        }
        break
        
      case 'data':
        if (command.data) {
          preview.push({
            type: 'data',
            label: '数据',
            value: command.data,
            color: '#fa709a'
          })
          hexString += command.data + ' '
        }
        break
        
      case 'checksum':
        if (configForm.checksum.method !== 'none') {
          const checksum = calculateChecksum(hexString.trim().replace(/\s/g, ''), configForm.checksum.method)
          preview.push({
            type: 'checksum',
            label: '校验',
            value: checksum,
            color: '#a8edea'
          })
          hexString += checksum + ' '
        }
        break
    }
  })
  
  previewMessage.value = preview
  previewHex.value = hexString.trim()
}

// 发送读指令
const sendReadCommand = (cmd: any) => {
  try {
    // 使用钩子中的函数构建报文
    const message = buildReadCommandMessage(cmd, configForm)
    
    // 检查是否有频率设置
    if (cmd.frequency && cmd.frequency > 0) {
      // 定时发送模式
      if (activeReadCommands.value.has(cmd.name)) {
        // 如果已经在发送，停止发送
        activeReadCommands.value.delete(cmd.name)
        ElMessage({
          message: `读指令 "${cmd.name}" 已停止发送`,
          type: 'success',
          duration: 1000,
          placement: 'bottom-right',
          offset: 50,
        })
        
        // 更新定时器
        updateGlobalTimer()
      } else {
        // 开始定时发送
        activeReadCommands.value.add(cmd.name)
        ElMessage({
          message: `读指令 "${cmd.name}" 开始以 ${cmd.frequency}Hz 频率发送`,
          type: 'success',
          duration: 1000,
          placement: 'bottom-right',
          offset: 50,
        })
        
        // 更新定时器
        updateGlobalTimer()
      }
    } else {
      // 单次发送模式
      console.log(`发送读指令: ${cmd.name}, 报文: ${message}`)
      ElMessage({
        message: `读指令 "${cmd.name}" 发送成功`,
        type: 'success',
        duration: 1000,
        placement: 'bottom-right',
        offset: 50,
      })
      sendDataToSerial(message)
    }
    
  } catch (error) {
    ElMessage({
      message: `读指令 "${cmd.name}" 发送失败`,
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

// 发送写指令
const sendWriteCommand = (cmd: any) => {
  try {
    // 使用钩子中的函数构建报文
    const message = buildWriteCommandMessage(cmd, configForm)
    
    // 实际发送到串口
    sendDataToSerial(message)
    
  } catch (error) {
    ElMessage({
      message: `写指令 "${cmd.name}" 发送失败`,
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}



// 处理配置对话框中的十进制输入
const handleDecimalInput = (cmd: any, value: string) => {
  if (!value || value.trim() === '') {
    cmd.data = ''
    return
  }
  
  const trimmedValue = value.trim()
  
  // 检查是否为纯数字（十进制）
  if (/^-?\d+$/.test(trimmedValue)) {
    // 是十进制数字，转换为十六进制
    const hexValue = decimalToHex(trimmedValue, cmd.dataType)
    cmd.data = hexValue
    // 更新十进制输入缓存
    decimalInputs.value[cmd.name] = trimmedValue
  } else {
    // 不是纯数字，按原始逻辑处理（假设用户输入的是十六进制）
    cmd.data = trimmedValue
    // 更新十进制输入缓存（尝试转换回十进制）
    decimalInputs.value[cmd.name] = hexToDecimal(trimmedValue, cmd.dataType)
  }
}

// 处理单个输入框的十进制输入（主界面）
const handleSingleDecimalInput = (cmd: any, value: string) => {
  if (!value || value.trim() === '') {
    // 根据数据长度（字节数）设置默认值
    if (cmd.length === 2 || cmd.dataType === 'int16') {
      cmd.data = '0000'  // 2字节 = 4个十六进制字符
    } else if (cmd.length === 4 || cmd.dataType === 'float32') {
      cmd.data = '00000000'  // 4字节 = 8个十六进制字符
    } else {
      // 其他长度，根据字节数计算十六进制字符数（每字节2个字符）
      const hexChars = cmd.length * 2
      cmd.data = '0'.repeat(hexChars)
    }
    return
  }
  
  const trimmedValue = value.trim()
  
  // 检查是否为纯数字（十进制）
  if (/^-?\d+$/.test(trimmedValue)) {
    // 是十进制数字，转换为十六进制
    const hexValue = decimalToHex(trimmedValue, cmd.dataType)
    cmd.data = hexValue
    // 更新十进制输入缓存
    decimalInputs.value[cmd.name] = trimmedValue
  } else {
    // 不是纯数字，保留原始输入（假设是十六进制）
    cmd.data = trimmedValue
    // 更新十进制输入缓存（尝试转换回十进制）
    decimalInputs.value[cmd.name] = hexToDecimal(trimmedValue, cmd.dataType)
  }
}

// 处理多输入框的十进制输入并更新数据
const updateDataValueWithDecimal = (cmd: any, index: number, value: string) => {
  const dataCount = getDataCount(cmd)
  const dataArray = splitData(cmd.data, dataCount)
  
  if (!value || value.trim() === '') {
    dataArray[index] = '0000' // int16默认4个字符
  } else {
    const trimmedValue = value.trim()
    
    // 检查是否为纯数字（十进制）
    if (/^-?\d+$/.test(trimmedValue)) {
      // 是十进制数字，转换为十六进制
      const hexValue = decimalToHex(trimmedValue, cmd.dataType)
      dataArray[index] = hexValue
    } else {
      // 不是纯数字，按原始输入处理（假设是十六进制）
      dataArray[index] = trimmedValue.padStart(4, '0').toUpperCase() // int16需要4个字符
    }
  }
  
  // 更新数据
  cmd.data = dataArray.join('')
  // 同步更新dataInputs
  dataInputs.value[getDataInputKey(cmd, index)] = value
}



// 发送数据到串口
const sendDataToSerial = (data: string) => {
  if (window.ipcRenderer) {
    window.ipcRenderer.send('send-serial-data', data)
  } else {
    console.error('IPC通信不可用')
    ElMessage({
      message: '串口通信未初始化',
      type: 'error',
      duration: 2000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

// 更新全局定时器
const updateGlobalTimer = () => {
  // 清理现有定时器
  if (globalTimer.value) {
    clearInterval(globalTimer.value)
    globalTimer.value = null
  }
  
  // 获取所有活跃指令的频率
  const activeFrequencies = readCommands.value
    .filter(cmd => activeReadCommands.value.has(cmd.name) && (cmd.frequency && cmd.frequency > 0))
    .map(cmd => cmd.frequency)
  
  if (activeFrequencies.length === 0) return
  
  // 找到最小频率（最大间隔）
  const minFrequency = Math.min(...activeFrequencies.filter(f => f !== null) as number[])
  const baseInterval = 1000 / minFrequency
  
  // 创建新的定时器
  globalTimer.value = window.setInterval(() => {
    const currentTime = Date.now()
    
    readCommands.value.forEach(command => {
      if (activeReadCommands.value.has(command.name) && command.frequency && command.frequency > 0) {
        // 检查是否应该发送这个指令
        const sendInterval = 1000 / command.frequency
        if (!command.lastSentTime || 
            (currentTime - command.lastSentTime) >= sendInterval) {
          
          // 构建报文
          const cmdHeader = configForm.header
          const cmdAddress = command.address.padStart(2, '0')
          let cmdMessage = cmdHeader + cmdAddress
          
          // 添加数据长度字段（始终包含，即使为0）
          const cmdLength = command.length.toString().padStart(2, '0')
          cmdMessage += cmdLength
          
          // 如果数据长度大于0，添加数据字段
          if (command.length > 0) {
            const cmdData = command.data.padStart(command.length * 2, '0')
            cmdMessage += cmdData
          }
          
          const cmdChecksum = calculateChecksum(cmdMessage, configForm.checksum.method)
          cmdMessage += cmdChecksum
          
          console.log(`定时发送读指令: ${command.name}, 报文: ${cmdMessage}`)
          sendDataToSerial(cmdMessage)
          
          command.lastSentTime = currentTime
        }
      }
    })
  }, Math.min(baseInterval, 100)) // 最大检查间隔100ms
}

// 重置为默认配置
const resetConfig = () => {
  ElMessageBox.confirm(
    '确定要重置为默认配置吗？当前配置将被清空。',
    '重置确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(() => {
    // 重置表单数据
    configForm.header = 'AACC'
    configForm.format = 'hex'
    configForm.checksum.method = 'sum'
    configForm.checksum.start_index = 2
    configForm.checksum.end_index = -1
    
    // 重置命令列表
    readCommands.value = [
      { name: 'GET_SPEED', address: '00', data: '0000', length: 4, dataType: 'int16', frequency: null, lastSentTime: 0 },
      { name: 'GET_SPEED_M1', address: '01', data: '0000', length: 2, dataType: 'int16', frequency: null, lastSentTime: 0 },
      { name: 'GET_SPEED_M2', address: '02', data: '0000', length: 2, dataType: 'int16', frequency: null, lastSentTime: 0 }
    ]
    
    writeCommands.value = [
      { name: 'SET_SPEED', address: '00', data: '00000000', length: 4, dataType: 'int16' },
      { name: 'SET_SPEED_M1', address: '01', data: '0000', length: 2, dataType: 'int16' },
      { name: 'SET_SPEED_M2', address: '02', data: '0000', length: 2, dataType: 'int16' }
    ]
    
    ElMessage({
      message: '已重置为默认配置',
      type: 'success',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
    
    // 保存重置后的配置到localStorage
    saveConfigToStorage()
  }).catch(() => {
    // 用户取消重置
  })
}

// 载入配置数据
const loadConfig = (config: any) => {
  try {
    // 验证配置结构 - 支持新旧两种格式
    if (!config.header || !config.format || !config.checksum) {
      throw new Error('配置格式不完整')
    }
    
    // 载入基础配置
    configForm.header = config.header
    configForm.format = config.format
    configForm.checksum.method = config.checksum.method || 'sum'
    configForm.checksum.start_index = config.checksum.start_index || 2
    configForm.checksum.end_index = config.checksum.end_index || -1
    
    // 载入拖拽式报文结构配置
    addressLength.value = config.addressLength || 1
    includeLength.value = config.includeLength !== false
    lengthBytes.value = config.lengthBytes || 1
    configForm.includeFunction = config.includeFunction !== false
    
    // 清空现有命令
    readCommands.value = []
    writeCommands.value = []
    
    // 处理新格式（有独立的readCommands和writeCommands数组）
    if (config.readCommands && Array.isArray(config.readCommands) && config.writeCommands && Array.isArray(config.writeCommands)) {
      // 新格式处理
      readCommands.value = config.readCommands.map((cmd: any) => ({
        name: cmd.name || 'UNKNOWN_CMD',
        address: cmd.address || '00',
        data: cmd.data || '0000',
        length: parseInt(cmd.length) || 0,
        dataType: cmd.dataType || 'int16',
        functionCode: cmd.functionCode || '03',
        frequency: cmd.frequency || null,
        lastSentTime: cmd.lastSentTime || 0
      }))
      
      writeCommands.value = config.writeCommands.map((cmd: any) => ({
        name: cmd.name || 'UNKNOWN_CMD',
        address: cmd.address || '00',
        data: cmd.data || '0000',
        length: parseInt(cmd.length) || 0,
        dataType: cmd.dataType || 'int16',
        functionCode: cmd.functionCode || '06'
      }))
    } else if (config.command && typeof config.command === 'object') {
      // 旧格式处理（兼容旧配置文件）
      Object.entries(config.command).forEach(([name, cmd]: [string, any]) => {
        if (parseInt(cmd.length) === 0) {
          // 读命令（长度为0）
          readCommands.value.push({
            name,
            address: cmd.address || '00',
            data: cmd.data || '0000',
            length: 0,
            dataType: cmd.dataType || 'int16',
            functionCode: cmd.functionCode || '03',
            frequency: cmd.frequency || null,
            lastSentTime: 0
          })
        } else {
          // 写命令（长度大于0）
          writeCommands.value.push({
            name,
            address: cmd.address || '00',
            data: cmd.data || '0000',
            length: parseInt(cmd.length) || 2,
            dataType: cmd.dataType || 'int16',
            functionCode: cmd.functionCode || '06'
          })
        }
      })
    }
    
    // 如果没有命令，添加默认命令
    if (readCommands.value.length === 0) {
      readCommands.value = [
        { name: 'GET_SPEED', address: '00', data: '0000', length: 0, dataType: 'int16', functionCode: '03', frequency: null, lastSentTime: 0 }
      ]
    }
    if (writeCommands.value.length === 0) {
      writeCommands.value = [
        { name: 'SET_SPEED', address: '00', data: '0000', length: 2, dataType: 'int16', functionCode: '06' }
      ]
    }
    
  } catch (error) {
    ElMessage({
      message: '配置格式错误，载入失败',
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
    throw error
  }
}

// 处理文件载入
const handleFileLoad = (uploadFile: any) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const config = JSON.parse(e.target?.result as string)
      loadConfig(config)
      ElMessage({
        message: '配置载入成功',
        type: 'success',
        duration: 1000,
        placement: 'bottom-right',
        offset: 50,
      })
    } catch (error) {
      ElMessage({
        message: '配置文件格式错误',
        type: 'error',
        duration: 1000,
        placement: 'bottom-right',
        offset: 50,
      })
    }
  }
  reader.readAsText(uploadFile.raw)
}

// 下载配置
const downloadConfig = () => {
  try {
    const configData = JSON.stringify(JSON.parse(formattedConfig.value), null, 2)
    const blob = new Blob([configData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `motor-config-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    ElMessage({
      message: '配置下载成功',
      type: 'success',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  } catch (error) {
    ElMessage({
      message: '配置下载失败',
      type: 'error',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
  }
}

// 监听频率变化
watch(() => readCommands.value.map(cmd => ({name: cmd.name, frequency: cmd.frequency})), 
  () => {
    // 如果有活跃的指令，重新计算定时器
    if (activeReadCommands.value.size > 0) {
      updateGlobalTimer()
    }
  },
  { deep: true }
)

// 组件挂载时加载配置
onMounted(() => {
  loadConfigFromStorage()
  initializeCommandStatusCache()

  // 监听串口发送结果
  if (window.ipcRenderer) {
    window.ipcRenderer.on('serial-send-success', serialSuccessListener)
    window.ipcRenderer.on('serial-send-error', serialErrorListener)
  }
  
  // 初始化指令预览
  generateCommandPreview()
})

// 组件卸载时清理定时器
onUnmounted(() => {
  // 清理全局定时器
  if (globalTimer.value) {
    clearInterval(globalTimer.value)
    globalTimer.value = null
  }
  // 清空活跃指令集合
  activeReadCommands.value.clear()
  
  // 清理串口事件监听
  if (window.ipcRenderer) {
    window.ipcRenderer.off('serial-send-success', serialSuccessListener)
    window.ipcRenderer.off('serial-send-error', serialErrorListener)
  }
})
</script>

<style scoped>
.motor-config-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  height: 50px;
  box-sizing: border-box;
}

.file-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.left-buttons, .right-buttons {
  display: flex;
  gap: 8px;
}

.config-content {
  flex: 1;
  padding: 20px;
  overflow: auto;
}

/* 指令控制区域样式 */
.command-control {
  margin-bottom: 20px;
}

.control-tabs {
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.command-buttons {
  padding: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 80px;
  align-items: flex-start;
}

.command-list {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 80px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-start;
}

.command-item .command-btn {
  width: 140px;
  text-align: left;
}

.command-item .data-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.command-item .frequency-input-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.command-item .el-input {
  width: 120px;
  flex-shrink: 0;
}

.frequency-label {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  min-width: 15px;
}

.data-bits-label {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  min-width: 30px;
}

.command-btn {
  min-width: 140px;
  transition: all 0.3s ease;
}

.command-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.command-btn .el-icon {
  margin-right: 4px;
}

:deep(.el-empty) {
  margin: 20px auto;
}

:deep(.el-tabs__item) {
  padding: 0 20px;
  height: 40px;
  line-height: 40px;
}

:deep(.el-tabs__item .el-tag) {
  margin-left: 6px;
}

.dialog-content {
  padding: 20px 0;
}

:deep(.el-textarea__inner) {
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

/* 对话框样式 */
.dialog-content {
  max-height: 600px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

/* 防止标签页切换时的自动滚动 */
:deep(.el-tabs__content) {
  overflow: visible;
  min-height: 300px;
  padding: 15px;
}

:deep(.el-form-item) {
  margin-bottom: 15px;
}

:deep(.el-table) {
  font-size: 12px;
}

:deep(.el-table .cell) {
  padding: 4px;
}

.config-btn {
  margin-left: 8px;
}

/* 对话框自定义样式 */
:deep(.motor-config-dialog) {
  border-radius: 12px;
  overflow: hidden;
}

:deep(.motor-config-dialog .el-dialog__header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 24px;
  margin: 0;
}

:deep(.motor-config-dialog .el-dialog__title) {
  color: white;
  font-size: 18px;
  font-weight: 600;
}

:deep(.motor-config-dialog .el-dialog__headerbtn) {
  top: 20px;
  right: 20px;
}

:deep(.motor-config-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: white;
  font-size: 18px;
}

:deep(.motor-config-dialog .el-dialog__body) {
  padding: 24px;
  background-color: #f8fafc;
}

:deep(.motor-config-dialog .el-dialog__footer) {
  padding: 16px 24px;
  background-color: white;
  border-top: 1px solid #e6e8eb;
}

/* 配置表单样式 */
.config-form {
  background-color: #fafbfc;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #e6e8eb;
}

/* 配置操作栏样式 */
.config-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e6e8eb;
}

.config-actions .el-button {
  margin: 0;
}

/* 拖拽式报文结构样式 */
.message-structure-container {
  padding: 20px;
  background-color: #fafbfc;
  border-radius: 8px;
  border: 1px solid #e6e8eb;
}

.message-fields-container {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  align-items: flex-start;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.message-field {
  background: #ffffff;
  border: 2px solid #e6e8eb;
  border-radius: 8px;
  padding: 15px;
  min-width: 100px;
  max-width: 300px;
  transition: all 0.3s ease;
  cursor: move;
  position: relative;
}

.message-field:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
  transform: translateY(-2px);
}

.message-field.fixed-field {
  border-color: #b3d8ff;
  background: #f0f9ff;
  cursor: default;
}

.message-field.fixed-field:hover {
  border-color: #b3d8ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
  transform: none;
}

.field-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.drag-handle {
  color: #909399;
  cursor: grab;
  font-size: 14px;
}

.fixed-field .drag-handle {
  cursor: default;
  color: #b3d8ff;
}

.field-title {
  font-weight: 600;
  color: #303133;
  font-size: 14px;
  flex: 1;
}

.field-content {
  padding: 8px 0;
}

.field-config {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.field-unit {
  font-size: 12px;
  color: #909399;
}

.param-separator {
  color: #c0c4cc;
  font-weight: 500;
}

.checksum-params {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

/* 拖拽时的样式 */
.sortable-ghost {
  opacity: 0.5;
  background: #f0f9ff;
  border: 2px dashed #409eff;
}

.sortable-drag {
  opacity: 0.9;
  transform: rotate(2deg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* 响应式布局 */
@media (max-width: 768px) {
  .message-fields-container {
    flex-direction: column;
  }
  
  .message-field {
    max-width: 100%;
    min-width: auto;
  }
  
  .field-config {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .checksum-params {
    margin-left: 0;
    margin-top: 8px;
  }
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #303133;
}

/* Tab 标签样式 */
.tab-label {
  display: flex;
  align-items: center;
  gap: 5px;
}

.tab-label .el-tag {
  margin-left: 5px;
}

/* 命令 Tab 样式 */
.command-tabs {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

/* 命令表格样式 */
.command-table {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e6e8eb;
}

.command-table :deep(.el-table__header-wrapper) {
  background-color: #f8f9fa;
}

.command-table :deep(.el-table__header th) {
  background-color: #f8f9fa;
  color: #606266;
  font-weight: 600;
  border-bottom: 2px solid #e6e8eb;
}

.command-table :deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}

.command-table :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}

.command-table :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #409eff inset;
}

.command-table :deep(.el-input-number__decrease),
.command-table :deep(.el-input-number__increase) {
  background-color: #f5f7fa;
}

/* 对话框底部样式 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 十六进制显示样式 */
.hex-display {
  font-family: 'Courier New', monospace;
  font-size: 11px;         /* 使用.hex-display-small的字体大小 */
  color: #409eff;
  background-color: #f0f9ff;
  padding: 2px 6px;        /* 使用.hex-display-small的内边距 */
  border-radius: 3px;      /* 使用.hex-display-small的圆角 */
  border: 1px solid #b3d8ff;
  white-space: nowrap;
  min-width: 45px;         /* 使用.hex-display-small的最小宽度 */
  width: 45px;             /* 使用.hex-display-small的宽度 */
  height: 25px;
  text-align: center;
  flex-shrink: 0;
  letter-spacing: 0.3px;   /* 使用.hex-display-small的字间距 */
  display: inline-flex;    /* 保持flex布局 */
  align-items: center;     /* 保持垂直居中 */
  justify-content: center; /* 保持水平居中 */
  line-height: normal;     /* 保持正常行高 */
}

/* 指令预览区域样式 */
.command-preview-container {
  background-color: #fafbfc;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e6e8eb;
  margin-bottom: 20px;
}

.message-preview {
  display: flex;
  gap: 4px;
  padding: 15px;
  background-color: white;
  border-radius: 6px;
  border: 1px solid #e6e8eb;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

.preview-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 50px;
  height: 50px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.3s ease;
  cursor: pointer;
  position: relative;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  background-color: #f5f7fa;
  color: #606266;
  border: 1px solid #e4e7ed;
}

.preview-cell:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.cell-content {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
}

.cell-label {
  font-size: 10px;
  opacity: 0.8;
  text-align: center;
}

/* 预览单元悬停效果 */
.preview-cell:hover {
  background-color: #e6e8eb;
  border-color: #c0c4cc;
}

.preview-hex {
  margin-top: 10px;
  padding: 8px 12px;
  background-color: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e6e8eb;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.hex-content {
  color: #409eff;
  font-weight: 600;
  margin-left: 8px;
}

/* 单个数据输入框容器 */
.single-data-input {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

/* 多数据输入框样式 */
.multi-data-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.multi-input-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.multi-data-inputs .el-input {
  flex-shrink: 0;
}

.multi-data-inputs .el-input:last-child {
  margin-right: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .config-form {
    padding: 15px;
  }
  
  .command-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .command-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .command-item .command-btn {
    width: 100%;
  }
  
  .command-item .data-input-wrapper {
    width: 100%;
    padding-left: 0;
  }
  
  .multi-data-inputs {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .multi-input-item {
    width: 100%;
  }
  
  .multi-data-inputs .el-input {
    width: 100% !important;
    margin-right: 0;
    margin-bottom: 4px;
  }
  
  .single-data-input {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  
  .single-data-input .el-input {
    width: 100% !important;
  }
  
  .hex-display {
    width: 100%;
    text-align: left;
  }
}
</style>
