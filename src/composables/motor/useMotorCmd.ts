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
  method: 'sum' | 'xor' | 'crc8' | 'crc16'
  start_index: number
  end_index: number
}

// 配置表单接口
export interface ConfigForm {
  header: string
  format: 'hex' | 'ascii'
  checksum: ChecksumConfig
}

// 指令状态缓存，保存所有读指令的上次数值
const commandStatusCache = ref<Record<string, number | null>>({})

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

  // ===== 数据转换工具函数 =====

  // 计算数据个数（根据数据类型和长度）
  const getDataCount = (cmd: Command): number => {
    if (cmd.length === 0) return 1
    
    const bytesPerData = cmd.dataType === 'int16' ? 2 : 4
    return Math.floor(cmd.length / bytesPerData)
  }

  // 初始化指令状态缓存
  const initializeCommandStatusCache = () => {
    commandStatusCache.value = {}
    readCommands.value.forEach(cmd => {
      // 根据指令的长度和数据类型计算数据个数
      const dataCount = getDataCount(cmd)
      
      if (dataCount === 1) {
        // 单个数据，使用原始指令名
        commandStatusCache.value[cmd.name] = null
      } else if (dataCount > 1) {
        // 多个数据，直接创建拆分后的数据项键
        for (let i = 0; i < dataCount; i++) {
          const keyName = `${cmd.name}_${i + 1}`
          commandStatusCache.value[keyName] = null
        }
      }
    })
  }

  // 分割数据字符串
  const splitData = (data: string, count: number, dataType: 'int16' | 'float32' = 'int16'): string[] => {
    if (!data || count <= 1) return [data || '']
    
    // 根据数据类型确定每个数据占用的十六进制字符数
    const hexCharsPerData = dataType === 'int16' ? 4 : 8 // int16: 4字符(2字节), float32: 8字符(4字节)
    
    const cleanData = data.replace(/\s/g, '').padEnd(count * hexCharsPerData, '0') // 确保总长度足够
    const result: string[] = []
    
    for (let i = 0; i < count; i++) {
      const start = i * hexCharsPerData
      const end = start + hexCharsPerData
      result.push(cleanData.substring(start, end) || (dataType === 'int16' ? '0000' : '00000000'))
    }
    
    return result
  }

  // 获取数据输入键
  const getDataInputKey = (cmd: Command, index: number): string => {
    return `${cmd.name}_${index}`
  }

  // 十进制到十六进制转换函数（小端格式）
  const decimalToHex = (decimalStr: string, dataType: 'int16' | 'float32'): string => {
    if (!decimalStr || isNaN(Number(decimalStr))) {
      return dataType === 'int16' ? '0000' : '00000000'
    }
    
    const num = Number(decimalStr)
    
    if (dataType === 'int16') {
      // int16: 2字节，范围 -32768 到 32767，小端格式
      const clamped = Math.max(-32768, Math.min(32767, num))
      const uint16 = clamped < 0 ? clamped + 65536 : clamped
      const hex = uint16.toString(16).padStart(4, '0').toUpperCase()
      // 小端：低字节在前，高字节在后
      return hex.slice(2, 4) + hex.slice(0, 2)
    } else if (dataType === 'float32') {
      // float32: 4字节，IEEE 754格式，小端格式
      const buffer = new ArrayBuffer(4)
      const view = new DataView(buffer)
      view.setFloat32(0, num, true) // true 表示小端
      const bytes = new Uint8Array(buffer)
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('')
    }
    
    return '00'
  }

  // 十六进制到十进制转换函数（小端格式）
  const hexToDecimal = (hexStr: string, dataType: 'int16' | 'float32'): string => {
    if (!hexStr || hexStr.length < 2) {
      return '0'
    }
    
    try {
      if (dataType === 'int16') {
        // int16: 2字节，小端格式，需要4个十六进制字符
        const cleanHex = hexStr.replace(/\s/g, '').padStart(4, '0').slice(0, 4)
        // 小端：低字节在前，高字节在后，需要转换为大端再解析
        const bigEndian = cleanHex.slice(2, 4) + cleanHex.slice(0, 2)
        const uint16 = parseInt(bigEndian, 16)
        // 转换回有符号数
        const int16 = uint16 > 32767 ? uint16 - 65536 : uint16
        return int16.toString()
      } else if (dataType === 'float32') {
        // float32: 4字节，小端格式
        const cleanHex = hexStr.replace(/\s/g, '').padStart(8, '0')
        const bytes = cleanHex.match(/.{2}/g) || []
        const buffer = new ArrayBuffer(4)
        const view = new DataView(buffer)
        
        // 小端格式：按顺序写入字节
        bytes.forEach((byte, index) => {
          view.setUint8(index, parseInt(byte, 16))
        })
        
        const float32 = view.getFloat32(0, true) // true 表示小端
        return float32.toString()
      }
    } catch (error) {
      console.error('十六进制转十进制失败:', error)
      return '0'
    }
    
    return '0'
  }

  // 计算校验码
  const calculateChecksum = (message: string, method: 'sum' | 'xor' | 'crc8' | 'crc16'): string => {
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
      readCommands: readCommands.value.map(cmd => ({
        name: cmd.name,
        address: cmd.address,
        data: cmd.data,
        length: cmd.length,
        dataType: cmd.dataType,
        frequency: cmd.frequency,
        lastSentTime: cmd.lastSentTime
      })),
      writeCommands: writeCommands.value.map(cmd => ({
        name: cmd.name,
        address: cmd.address,
        data: cmd.data,
        length: cmd.length,
        dataType: cmd.dataType
      }))
    }

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

  // ===== 指令构建和发送函数 =====

  // 构建读指令报文
  const buildReadCommandMessage = (cmd: ReadCommand, config: ConfigForm): string => {
    // 构建报文
    const header = config.header
    const address = cmd.address.padStart(2, '0')
    
    // 构建基础报文（不包含校验）
    let message = header + address
    
    // 添加数据长度字段（始终包含，即使为0）
    const length = cmd.length.toString().padStart(2, '0')
    message += length
    
    // 不管数据长度，强行视为0
    // 数据长度和数据类型的作用是用来定义应答
    if (false && cmd.length > 0) {
      const data = cmd.data.padStart(cmd.length * 2, '0')
      message += data
    }
    
    // 计算校验码
    const checksum = calculateChecksum(message, config.checksum.method)
    message += checksum
    
    return message
  }

  // 构建写指令报文
  const buildWriteCommandMessage = (cmd: WriteCommand, config: ConfigForm): string => {
    // 构建报文
    const header = config.header
    const address = cmd.address.padStart(2, '0')
    const length = cmd.length.toString().padStart(2, '0')
    
    // 构建基础报文（不包含校验）
    let message = header + address + length
    
    // 当长度为0时，不发送数据位
    if (cmd.length > 0) {
      // 确保数据长度正确
      const dataCount = 1 // 默认单数据
      const bytesPerData = cmd.dataType === 'int16' ? 2 : 4
      const expectedLength = dataCount * bytesPerData
      
      // 填充数据到正确长度
      let data = cmd.data.padStart(expectedLength * 2, '0')
      message += data
    }
    
    // 计算校验码
    const checksum = calculateChecksum(message, config.checksum.method)
    message += checksum
    
    return message
  }

  const convertByteArrayToJson = (hexData: any) => {
    try {
      // 确保输入有效
      if (!hexData || (typeof hexData !== 'string' && !Array.isArray(hexData))) {
        console.log('输入数据无效或为空')
        return ''
      }
      
      let hexString: string;
      
      // 处理不同类型的输入 - 复用现有逻辑
      if (typeof hexData === 'string') {
        hexString = hexData.toUpperCase();
      } else if (Array.isArray(hexData)) {
        // 使用map和padStart处理字节数组
        hexString = hexData.map((byte: number) => 
          (byte as number).toString(16).padStart(2, '0').toUpperCase()
        ).join('')
      } else {
        console.log('不支持的输入类型')
        return ''
      }
      
      // 验证报文长度
      if (hexString.length < 6) {
        console.warn('报文长度太短，无法解析')
        return ''
      }
      
      // 解析报文结构
      const header = hexString.substring(0, 4) // 2字节头部
      const address = hexString.substring(4, 6) // 1字节地址
      const dataLength = parseInt(hexString.substring(6, 8), 16) // 1字节数据长度
      const dataStartIndex = 8
      const dataEndIndex = dataStartIndex + dataLength * 2
      
      // 验证数据长度
      if (dataEndIndex > hexString.length - 2) {
        console.warn('报文数据长度与实际情况不符')
        return ''
      }
      
      // 提取数据部分
      const dataHex = hexString.substring(dataStartIndex, dataEndIndex)
      
      // 根据地址查找对应的指令配置
      const matchedCmd = readCommands.value.find(cmd => cmd.address === address)
      
      if (!matchedCmd) {
        console.warn(`未找到地址为 ${address} 的指令配置`)
        return ''
      }
      
      // 使用报文中的实际数据长度来计算数据个数，而不是依赖指令配置中的length字段
      const bytesPerData = matchedCmd.dataType === 'int16' ? 2 : 4
      const actualDataCount = Math.floor(dataLength / bytesPerData)
      
      // 使用splitData分割数据，传入数据类型以确保正确分割
      const dataArray = splitData(dataHex, actualDataCount, matchedCmd.dataType)
      
      // 解析结果 - 先获取所有指令的上次状态
      
      const results: Record<string, number | null> = { ...commandStatusCache.value }

      if (actualDataCount === 1) {
        // 单个数据 - 转换为数字类型并更新缓存
        const value = Number(hexToDecimal(dataArray[0], matchedCmd.dataType))
        results[matchedCmd.name] = value
        commandStatusCache.value[matchedCmd.name] = value
      } else if (actualDataCount > 1) {
        // 多个数据，按指令名+序号拆分，转换为数字类型并更新缓存
        // 当拆分为多个数据时，删除原始的指令名（如果存在）
        delete results[matchedCmd.name]
        delete commandStatusCache.value[matchedCmd.name]
        
        dataArray.forEach((data, index) => {
          const keyName = `${matchedCmd.name}_${index + 1}`
          const value = Number(hexToDecimal(data, matchedCmd.dataType))
          results[keyName] = value
          commandStatusCache.value[keyName] = value
        })
      }
      
      // 生成JSON内容的字符串，最后加一个换行符
      return JSON.stringify(results) + '\n'
      
    } catch (error) {
      console.error('字节数组转JSON失败:', error)
      return ''
    }
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
    updateWriteCommands,
    
    // 数据转换工具函数
    getDataCount,
    splitData,
    getDataInputKey,
    decimalToHex,
    hexToDecimal,
    calculateChecksum,
    initializeCommandStatusCache,
    
    // 指令构建函数
    buildReadCommandMessage,
    buildWriteCommandMessage,
    
    // 字节数组转JSON函数
    convertByteArrayToJson
  }
}