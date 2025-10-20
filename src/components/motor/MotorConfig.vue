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
      <h3>电机配置</h3>
      
      <!-- 指令下发控制区域 -->
      <div v-if="false" class="command-control">
        <el-tabs v-model="activeControlTab" type="card" class="control-tabs">
          <el-tab-pane name="read">
            <template #label>
              <span>
                <el-icon><Position /></el-icon>
                读指令
                <el-tag size="small" type="info" v-if="readCommands.length > 0">{{ readCommands.length }}</el-tag>
              </span>
            </template>
            <div class="command-buttons">
              <el-button 
                v-for="cmd in readCommands" 
                :key="cmd.name"
                type="primary" 
                size="default"
                @click="sendReadCommand(cmd)"
                :disabled="!isConfigValid"
                class="command-btn"
              >
                <el-icon><Position /></el-icon>
                {{ cmd.name }}
              </el-button>
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
            <div class="command-buttons">
              <el-button 
                v-for="cmd in writeCommands" 
                :key="cmd.name"
                type="success" 
                size="default"
                @click="sendWriteCommand(cmd)"
                :disabled="!isConfigValid"
                class="command-btn"
              >
                <el-icon><Edit /></el-icon>
                {{ cmd.name }}
              </el-button>
              <el-empty v-if="writeCommands.length === 0" description="暂无写指令配置" :image-size="48" />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 配置对话框 -->
    <el-dialog
      v-model="configDialogVisible"
      title="🎯 电机驱动指令配置"
      width="50%"
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
            重置默认
          </el-button>
        </div>

        <el-divider />

        <!-- 基础配置 -->
        <el-form :model="configForm" label-width="120px" size="default" class="config-form">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="报文头部：">
                <el-input v-model="configForm.header" placeholder="例如: AACC">
                  <template #prefix>
                    <el-icon><Key /></el-icon>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="报文类型：">
                <el-select v-model="configForm.format" placeholder="选择报文类型">
                  <el-option label="十六进制" value="hex">
                    <el-icon style="margin-right: 5px;"><Coin /></el-icon>十六进制
                  </el-option>
                  <el-option label="ASCII" value="ascii">
                    <el-icon style="margin-right: 5px;"><Document /></el-icon>ASCII
                  </el-option>
                  <el-option label="二进制" value="binary">
                    <el-icon style="margin-right: 5px;"><Grid /></el-icon>二进制
                  </el-option>
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-divider content-position="left">校验配置</el-divider>
          
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="校验方法：">
                <el-select v-model="configForm.checksum.method" placeholder="校验方法">
                  <el-option label="XOR" value="xor" />
                  <el-option label="CRC8" value="crc8" />
                  <el-option label="CRC16" value="crc16" />
                  <el-option label="和校验" value="sum" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="起始位：">
                <el-input-number v-model="configForm.checksum.start_index" :min="0" controls-position="right" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="结束位：">
                <el-input-number v-model="configForm.checksum.end_index" :min="-1" controls-position="right" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>

        <el-divider />

        <!-- 命令配置 Tab -->
        <el-tabs v-model="activeTab" type="border-card" class="command-tabs">
          <el-tab-pane name="read">
            <template #label>
              <span class="tab-label">
                <el-icon><Upload /></el-icon>
                读命令
                <el-tag size="small" type="info">{{ readCommands.length }}</el-tag>
              </span>
            </template>
            
            <div class="command-header">
              <el-text type="info" size="small">读取电机状态的相关命令</el-text>
              <el-button type="primary" size="small" @click="addCommand('read')" :icon="Plus">
                添加读命令
              </el-button>
            </div>
            
            <el-table :data="readCommands" style="width: 100%" size="default" class="command-table" stripe>
              <el-table-column prop="name" label="命令名称" min-width="200">
                <template #default="scope">
                  <el-input v-model="scope.row.name" size="default">
                    <template #prefix>
                      <el-icon><Position /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="address" label="寄存器地址" width="130">
                <template #default="scope">
                  <el-input v-model="scope.row.address" size="default" placeholder="00">
                    <template #prepend>0x</template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="length" label="数据长度" width="140">
                <template #default="scope">
                  <el-input-number v-model="scope.row.length" size="default" :min="1" :max="32" controls-position="right" style="width: 100%;" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100" align="center">
                <template #default="scope">
                  <el-button
                    type="danger"
                    size="small"
                    @click="removeCommand('read', scope.$index)"
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
              <el-table-column prop="data" label="默认数据" width="120">
                <template #default="scope">
                  <el-input v-model="scope.row.data" size="default" placeholder="0000">
                    <template #prefix>
                      <el-icon><DataAnalysis /></el-icon>
                    </template>
                  </el-input>
                </template>
              </el-table-column>
              <el-table-column prop="length" label="数据长度" width="140">
                <template #default="scope">
                  <el-input-number v-model="scope.row.length" size="default" :min="1" :max="32" controls-position="right" style="width: 100%;" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100" align="center">
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
import { ref, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Setting, 
  Key, 
  Coin, 
  Document, 
  Grid, 
  Download, 
  Upload, 
  Plus, 
  Delete, 
  Position, 
  Edit, 
  DataAnalysis, 
  Check, 
  Close,
  Refresh
} from '@element-plus/icons-vue'

// 响应式变量
const configDialogVisible = ref(false)
const activeTab = ref('read')
const activeControlTab = ref('read')
const uploadRef = ref()

// 当前配置数据
const currentConfig = computed(() => {
  return {
    header: configForm.header,
    format: configForm.format,
    checksum: configForm.checksum,
    readCommands: readCommands.value,
    writeCommands: writeCommands.value
  }
})

// 配置表单数据
const configForm = reactive({
  header: 'AACC',
  format: 'hex',
  checksum: {
    method: 'xor',
    start_index: 2,
    end_index: -1
  }
})

// 读命令列表
const readCommands = ref([
  { name: 'GET_SPEED', address: '00', length: '04' },
  { name: 'GET_SPEED_M1', address: '00', length: '02' },
  { name: 'GET_SPEED_M2', address: '01', length: '02' }
])

// 写命令列表
const writeCommands = ref([
  { name: 'SET_SPEED', address: '00', data: '0000', length: '04' },
  { name: 'SET_SPEED_M1', address: '00', data: '00', length: '02' },
  { name: 'SET_SPEED_M2', address: '01', data: '00', length: '02' }
])

// 计算属性：格式化配置
const formattedConfig = computed(() => {
  const config = {
    header: configForm.header,
    format: configForm.format,
    checksum: {
      method: configForm.checksum.method,
      start_index: configForm.checksum.start_index,
      end_index: configForm.checksum.end_index
    },
    command: {}
  }

  // 添加读命令
  readCommands.value.forEach(cmd => {
    config.command[cmd.name] = {
      address: cmd.address,
      length: cmd.length
    }
  })

  // 添加写命令
  writeCommands.value.forEach(cmd => {
    config.command[cmd.name] = {
      address: cmd.address,
      data: cmd.data,
      length: cmd.length
    }
  })

  return JSON.stringify(config, null, 2)
})

// 计算属性：配置是否有效
const isConfigValid = computed(() => {
  return configForm.header && configForm.format && readCommands.value.length > 0
})

// 方法
const showConfigDialog = () => {
  configDialogVisible.value = true
}

const showHelp = () => {
  ElMessage.info('电机配置帮助信息')
}

// 添加命令
const addCommand = (type: 'read' | 'write') => {
  if (type === 'read') {
    readCommands.value.push({ name: 'NEW_CMD', address: '00', length: '02' })
  } else {
    writeCommands.value.push({ name: 'NEW_CMD', address: '00', data: '00', length: '02' })
  }
}

// 删除命令
const removeCommand = (type: 'read' | 'write', index: number) => {
  if (type === 'read') {
    readCommands.value.splice(index, 1)
  } else {
    writeCommands.value.splice(index, 1)
  }
}

// 保存配置
const saveConfig = () => {
  try {
    // 验证配置格式
    const config = JSON.parse(formattedConfig.value)
    
    // 更新原始配置数据
    motor_cfg.value = formattedConfig.value
    
    configDialogVisible.value = false
    ElMessage.success('配置保存成功')
  } catch (error) {
    ElMessage.error('配置格式错误，请检查输入')
  }
}

// 复制配置到剪贴板
const copyConfig = async () => {
  try {
    await navigator.clipboard.writeText(formattedConfig.value)
    ElMessage.success('配置已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败，请手动复制')
  }
}

// 发送读指令
const sendReadCommand = (cmd: any) => {
    console.log(cmd)
  try {
    // 构建报文
    const header = configForm.header
    const address = cmd.address.padStart(2, '0')
    const length = cmd.length.padStart(2, '0')
    
    // 构建基础报文（不包含校验）
    let message = header + address + length
    
    // 计算校验码
    const checksum = calculateChecksum(message, configForm.checksum.method)
    message += checksum
    
    // 发送指令（这里模拟发送过程）
    console.log(`发送读指令: ${cmd.name}, 报文: ${message}`)
    ElMessage.success(`读指令 "${cmd.name}" 发送成功`)
    
    // TODO: 实际发送到串口/网络
    // sendToDevice(message)
    
  } catch (error) {
    ElMessage.error(`读指令 "${cmd.name}" 发送失败`)
    console.error('发送读指令错误:', error)
  }
}

// 发送写指令
const sendWriteCommand = (cmd: any) => {
  try {
    // 构建报文
    const header = configForm.header
    const address = cmd.address.padStart(2, '0')
    const data = cmd.data.padStart(parseInt(cmd.length) * 2, '0')
    const length = cmd.length.padStart(2, '0')
    
    // 构建基础报文（不包含校验）
    let message = header + address + length + data
    
    // 计算校验码
    const checksum = calculateChecksum(message, configForm.checksum.method)
    message += checksum
    
    // 发送指令（这里模拟发送过程）
    console.log(`发送写指令: ${cmd.name}, 报文: ${message}`)
    ElMessage.success(`写指令 "${cmd.name}" 发送成功`)
    
    // TODO: 实际发送到串口/网络
    // sendToDevice(message)
    
  } catch (error) {
    ElMessage.error(`写指令 "${cmd.name}" 发送失败`)
    console.error('发送写指令错误:', error)
  }
}

// 计算校验码
const calculateChecksum = (message: string, method: string): string => {
  const bytes = message.match(/.{2}/g) || []
  
  switch (method) {
    case 'xor':
      let xor = 0
      bytes.forEach(byte => {
        xor ^= parseInt(byte, 16)
      })
      return xor.toString(16).padStart(2, '0').toUpperCase()
      
    case 'sum':
      let sum = 0
      bytes.forEach(byte => {
        sum += parseInt(byte, 16)
      })
      return (sum & 0xFF).toString(16).padStart(2, '0').toUpperCase()
      
    default:
      return '00'
  }
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
    configForm.checksum.method = 'xor'
    configForm.checksum.start_index = 2
    configForm.checksum.end_index = -1
    
    // 重置命令列表
    readCommands.value = [
      { name: 'GET_SPEED', address: '00', length: '04' },
      { name: 'GET_SPEED_M1', address: '00', length: '02' },
      { name: 'GET_SPEED_M2', address: '01', length: '02' }
    ]
    
    writeCommands.value = [
      { name: 'SET_SPEED', address: '00', data: '0000', length: '04' },
      { name: 'SET_SPEED_M1', address: '00', data: '00', length: '02' },
      { name: 'SET_SPEED_M2', address: '01', data: '00', length: '02' }
    ]
    
    ElMessage.success('已重置为默认配置')
  }).catch(() => {
    // 用户取消重置
  })
}

// 载入配置数据
const loadConfig = (config: any) => {
  try {
    // 验证配置结构
    if (!config.header || !config.format || !config.checksum || !config.command) {
      throw new Error('配置格式不完整')
    }
    
    // 载入基础配置
    configForm.header = config.header
    configForm.format = config.format
    configForm.checksum.method = config.checksum.method || 'xor'
    configForm.checksum.start_index = config.checksum.start_index || 2
    configForm.checksum.end_index = config.checksum.end_index || -1
    
    // 清空现有命令
    readCommands.value = []
    writeCommands.value = []
    
    // 分离读命令和写命令
    Object.entries(config.command).forEach(([name, cmd]: [string, any]) => {
      if (cmd.data !== undefined) {
        // 写命令
        writeCommands.value.push({
          name,
          address: cmd.address || '00',
          data: cmd.data || '00',
          length: cmd.length || '02'
        })
      } else {
        // 读命令
        readCommands.value.push({
          name,
          address: cmd.address || '00',
          length: cmd.length || '02'
        })
      }
    })
    
    // 如果没有命令，添加默认命令
    if (readCommands.value.length === 0) {
      readCommands.value = [
        { name: 'GET_SPEED', address: '00', length: '04' }
      ]
    }
    if (writeCommands.value.length === 0) {
      writeCommands.value = [
        { name: 'SET_SPEED', address: '00', data: '0000', length: '04' }
      ]
    }
    
  } catch (error) {
    ElMessage.error('配置格式错误，载入失败')
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
      ElMessage.success('配置载入成功')
    } catch (error) {
      ElMessage.error('配置文件格式错误')
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
    ElMessage.success('配置下载成功')
  } catch (error) {
    ElMessage.error('配置下载失败')
  }
}

const motor_cfg = computed(() => {
  return {
    header: configForm.header,
    format: configForm.format,
    checksum: {
      method: configForm.checksum.method,
      start_index: configForm.checksum.start_index,
      end_index: configForm.checksum.end_index
    },
    command: Object.fromEntries([
      ...readCommands.value.map(cmd => [cmd.name, { address: cmd.address, length: cmd.length }]),
      ...writeCommands.value.map(cmd => [cmd.name, { address: cmd.address, data: cmd.data, length: cmd.length }])
    ])
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

.command-btn {
  min-width: 120px;
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
}

:deep(.el-form-item) {
  margin-bottom: 15px;
}

:deep(.el-tabs__content) {
  padding: 15px;
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
}
</style>
