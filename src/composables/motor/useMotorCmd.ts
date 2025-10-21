import { ref, reactive, computed } from 'vue'

// 命令接口定义
export interface Command {
  name: string
  address: string
  data: string
  length: number
  dataType: 'int16' | 'float32'
}

export interface ReadCommand extends Command {
  frequency: number | null
  lastSentTime: number
}

export interface WriteCommand extends Command {
  // 写命令特有属性
}

// 校验配置接口
export interface ChecksumConfig {
  method: 'sum' | 'crc' | 'xor'
  start_index: number
  end_index: number
}

// 配置表单接口
export interface ConfigForm {
  header: string
  format: 'hex' | 'ascii'
  checksum: ChecksumConfig
}

export function useMotorCmd() {
  // 配置表单数据
  const configForm = reactive<ConfigForm>({
    header: 'AACC',
    format: 'hex',
    checksum: {
      method: 'sum',
      start_index: 0,
      end_index: -1
    }
  })

  // 读命令列表
  const readCommands = ref<ReadCommand[]>([
    { name: 'GET_SPEED', address: '00', data: '0000', length: 0, dataType: 'int16', frequency: null, lastSentTime: 0 },
    { name: 'GET_SPEED_M1', address: '01', data: '0000', length: 0, dataType: 'int16', frequency: null, lastSentTime: 0 },
    { name: 'GET_SPEED_M2', address: '02', data: '0000', length: 0, dataType: 'int16', frequency: null, lastSentTime: 0 }
  ])

  // 写命令列表
  const writeCommands = ref<WriteCommand[]>([
    { name: 'SET_SPEED', address: '00', data: '00000000', length: 4, dataType: 'float32' },
    { name: 'SET_SPEED_M1', address: '01', data: '0000', length: 2, dataType: 'int16' },
    { name: 'SET_SPEED_M2', address: '02', data: '0000', length: 2, dataType: 'int16' }
  ])

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
      command: {} as Record<string, any>
    }

    // 添加读命令
    readCommands.value.forEach(cmd => {
      config.command[cmd.name] = {
        address: cmd.address,
        data: cmd.data,
        length: cmd.length.toString().padStart(2, '0'),
        dataType: cmd.dataType
      }
    })

    // 添加写命令
    writeCommands.value.forEach(cmd => {
      config.command[cmd.name] = {
        address: cmd.address,
        data: cmd.data,
        length: cmd.length.toString().padStart(2, '0'),
        dataType: cmd.dataType
      }
    })

    return JSON.stringify(config, null, 2)
  })

  // 计算属性：配置是否有效
  const isConfigValid = computed(() => {
    return configForm.header && configForm.format && readCommands.value.length > 0
  })

  // 添加命令
  const addCommand = (type: 'read' | 'write') => {
    if (type === 'read') {
      readCommands.value.push({ 
        name: 'NEW_CMD', 
        address: '00', 
        data: '0000', 
        length: 0, 
        dataType: 'int16',
        frequency: null, 
        lastSentTime: 0 
      })
    } else {
      writeCommands.value.push({ 
        name: 'NEW_CMD', 
        address: '00', 
        data: '0000', 
        length: 2,
        dataType: 'int16'
      })
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

  // 更新配置表单
  const updateConfigForm = (newConfig: Partial<ConfigForm>) => {
    Object.assign(configForm, newConfig)
  }

  // 更新读命令列表
  const updateReadCommands = (newCommands: ReadCommand[]) => {
    readCommands.value = newCommands
  }

  // 更新写命令列表
  const updateWriteCommands = (newCommands: WriteCommand[]) => {
    writeCommands.value = newCommands
  }

  return {
    // 状态
    configForm,
    readCommands,
    writeCommands,
    
    // 计算属性
    currentConfig,
    formattedConfig,
    isConfigValid,
    
    // 方法
    addCommand,
    removeCommand,
    updateConfigForm,
    updateReadCommands,
    updateWriteCommands
  }
}