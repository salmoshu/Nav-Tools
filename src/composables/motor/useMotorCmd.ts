import { ref, reactive, computed } from 'vue'

// 命令接口定义
export interface Command {
  name: string
  address: string
  data: string
  length: number
  dataType: 'int16' | 'float32'
  functionCode?: string // 功能码（可选）
  registerCount?: string // 寄存器个数（可选）
  includeRegisterCount?: boolean // 是否包含寄存器个数
  includeLength?: boolean // 是否包含字节个数
}

export interface ReadCommand extends Command {
  frequency: number | null
  lastSentTime: number
  includeRegisterCount?: boolean
  includeLength?: boolean
}

export interface WriteCommand extends Command {
  // 写命令特有属性
}

// 校验配置接口
export interface ChecksumConfig {
  method: 'none' | 'sum' | 'xor' | 'crc8' | 'crc16'
  start_index: number
  end_index: number
  endianness?: 'big' | 'little'  // 校验和字节序（主要针对CRC16）
}

// 配置表单接口
export interface ConfigForm {
  header: string
  format: 'hex' | 'ascii'
  checksum: ChecksumConfig
  includeFunction?: boolean
  addressLength?: number
  functionLength?: number
  includeRegisterCount?: boolean
  registerCountLength?: number
  lengthLength?: number
  dataEndianness?: 'big' | 'little'
}

// 指令状态缓存，保存所有读指令的上次数值
const commandStatusCache = ref<Record<string, number | null>>({})

export function useMotorCmd() {
  // 配置表单数据
  const configForm = reactive<ConfigForm>({
    header: 'A5',
    format: 'hex',
    checksum: {
      method: 'crc16',
      start_index: 0,
      end_index: -1,
      endianness: 'big'  // 默认大端（高字节在前）
    },
    includeFunction: true,
    addressLength: 1,
    functionLength: 1,
    includeRegisterCount: true,  // 默认启用寄存器个数
    registerCountLength: 1,
    lengthLength: 2,  // 默认字节长度为2
    dataEndianness: 'little'
  })

  // 读命令列表
  const readCommands = ref<ReadCommand[]>([
    { name: 'GET_SPEED', address: '00', data: '0000', length: 4, dataType: 'int16', functionCode: '03', registerCount: '02', includeRegisterCount: true, includeLength: true, frequency: null, lastSentTime: 0 },
    { name: 'GET_SPEED_M1', address: '01', data: '0000', length: 2, dataType: 'int16', functionCode: '03', registerCount: '01', includeRegisterCount: true, includeLength: true, frequency: null, lastSentTime: 0 },
    { name: 'GET_SPEED_M2', address: '02', data: '0000', length: 2, dataType: 'int16', functionCode: '03', registerCount: '01', includeRegisterCount: true, includeLength: true, frequency: null, lastSentTime: 0 }
  ])

  // 写命令列表
  const writeCommands = ref<WriteCommand[]>([
    { name: 'SET_SPEED', address: '00', data: '00000000', length: 4, dataType: 'float32', functionCode: '06', registerCount: '02', includeRegisterCount: true, includeLength: true },
    { name: 'SET_SPEED_M1', address: '01', data: '0000', length: 2, dataType: 'int16', functionCode: '06', registerCount: '01', includeRegisterCount: true, includeLength: true },
    { name: 'SET_SPEED_M2', address: '02', data: '0000', length: 2, dataType: 'int16', functionCode: '06', registerCount: '01', includeRegisterCount: true, includeLength: true }
  ])

  // ===== 数据转换工具函数 =====

  // 计算数据个数（根据数据类型和长度）
  const getDataCount = (cmd: Command): number => {
    if (cmd.length === 0) return 1
    
    // 修正：float32只能是4字节，如果长度超过4字节，应该当作多个float32处理
    if (cmd.dataType === 'float32') {
      return Math.floor(cmd.length / 4)  // 每个float32是4字节
    } else if (cmd.dataType === 'int16') {
      return Math.floor(cmd.length / 2)  // 每个int16是2字节
    }
    
    return 1  // 默认返回1个数据
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
    let hexCharsPerData: number
    if (dataType === 'int16') {
      hexCharsPerData = 4  // int16: 4字符(2字节)
    } else if (dataType === 'float32') {
      hexCharsPerData = 8  // float32: 8字符(4字节)
    } else {
      hexCharsPerData = 4  // 默认4字符
    }
    
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

  // 十进制到十六进制转换函数（支持大端和小端格式）
  const decimalToHex = (decimalStr: string, dataType: 'int16' | 'float32'): string => {
    if (!decimalStr || decimalStr.trim() === '') {
      return dataType === 'int16' ? '0000' : '00000000'
    }
    
    // 处理不完整的小数输入（如"3."）
    let cleanStr = decimalStr.trim()
    
    if (cleanStr.endsWith('.')) {
      cleanStr = cleanStr + '0' // 补全小数
    }
    
    if (isNaN(Number(cleanStr))) {
      return dataType === 'int16' ? '0000' : '00000000'
    }
    
    const num = Number(cleanStr)
    const endianness = configForm.dataEndianness || 'little'
    
    if (dataType === 'int16') {
      // int16: 2字节，范围 -32768 到 32767
      const clamped = Math.max(-32768, Math.min(32767, num))
      const uint16 = clamped < 0 ? clamped + 65536 : clamped
      const hex = uint16.toString(16).padStart(4, '0').toUpperCase()
      
      if (endianness === 'little') {
        // 小端：低字节在前，高字节在后
        return hex.slice(2, 4) + hex.slice(0, 2)
      } else {
        // 大端：高字节在前，低字节在后
        return hex
      }
    } else if (dataType === 'float32') {
        // float32: 4字节，IEEE 754格式
        // 确保数值在合理范围内，避免Infinity和NaN
        if (!isFinite(num)) {
          return '00000000'
        }
        
        const buffer = new ArrayBuffer(4)
        const view = new DataView(buffer)
        
        // 先按小端格式写入数据
        view.setFloat32(0, num, true)
        const bytes = new Uint8Array(buffer)
        
        let result: string
        if (endianness === 'big') {
          // 大端：反转字节顺序
          result = Array.from([bytes[3], bytes[2], bytes[1], bytes[0]])
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join('')
        } else {
          // 小端：直接使用字节顺序
          result = Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join('')
        }
        return result
    }
    
    return '00'
  }

  // 十六进制到十进制转换函数（支持大端和小端格式）
  const hexToDecimal = (hexStr: string, dataType: 'int16' | 'float32'): string => {
    if (!hexStr || hexStr.length < 2) {
      return '0'
    }
    
    try {
      const endianness = configForm.dataEndianness || 'little'
      
      if (dataType === 'int16') {
        // int16: 2字节，需要4个十六进制字符
        const cleanHex = hexStr.replace(/\s/g, '').padStart(4, '0').slice(0, 4)
        let bigEndianHex = cleanHex
        
        if (endianness === 'little') {
          // 小端：低字节在前，高字节在后，需要转换为大端再解析
          bigEndianHex = cleanHex.slice(2, 4) + cleanHex.slice(0, 2)
        } else {
          // 大端：已经是高字节在前，直接使用
          bigEndianHex = cleanHex
        }
        
        const uint16 = parseInt(bigEndianHex, 16)
        // 转换回有符号数
        const int16 = uint16 > 32767 ? uint16 - 65536 : uint16
        return int16.toString()
      } else if (dataType === 'float32') {
        // float32: 4字节
        const cleanHex = hexStr.replace(/\s/g, '').padStart(8, '0')
        const bytes = cleanHex.match(/.{2}/g) || []
        const buffer = new ArrayBuffer(4)
        const view = new DataView(buffer)
        
        // 根据字节序写入数据
        if (endianness === 'little') {
          // 小端格式：按顺序写入字节
          bytes.forEach((byte, index) => {
            view.setUint8(index, parseInt(byte, 16))
          })
        } else {
          // 大端格式：反转字节顺序后写入
          for (let i = 0; i < bytes.length; i++) {
            view.setUint8(i, parseInt(bytes[bytes.length - 1 - i], 16))
          }
        }
        
        // 由于我们已经根据字节序调整了字节顺序，这里始终使用小端格式读取
        const float32 = view.getFloat32(0, true)
        
        // 处理浮点数精度显示
        if (Math.abs(float32 - Math.round(float32)) < 0.0001) {
          // 如果接近整数，显示为整数
          return Math.round(float32).toString()
        } else {
          // 否则限制小数位数，避免显示过多的精度误差
          // IEEE 754单精度浮点数通常有6-7位有效数字
          return parseFloat(float32.toFixed(4)).toString()
        }
      }
    } catch (error) {
      console.error('十六进制转十进制失败:', error)
      return '0'
    }
    
    return '0'
  }

  const calculateChecksum = (message: string, method: 'none' | 'sum' | 'xor' | 'crc8' | 'crc16', startIndex?: number): string => {
    let bytes = message.match(/.{2}/g) || []
    
    // 如果指定了起始索引，截取从起始位置到末尾的字节范围
    if (startIndex !== undefined) {
      // 确保起始索引在有效范围内
      const validStartIndex = Math.max(0, Math.min(startIndex, bytes.length - 1))
      bytes = bytes.slice(validStartIndex) as RegExpMatchArray
    }
    
    switch (method) {
      case 'none':
        return ''  // 无校验位，返回空字符串
        
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

      case 'crc16':
        // Modbus-RTU CRC16 函数
        let crc_result = 0xFFFF
        
        for (let i = 0; i < bytes.length; i++) {
          crc_result ^= parseInt(bytes[i], 16)
          
          for (let m = 0; m < 8; m++) {
            const xor_flag = (crc_result & 0x0001) === 1 ? 1 : 0
            crc_result >>= 1
            if (xor_flag === 1) {
              crc_result ^= 0xA001
            }
          }
        }

        let crcHex = crc_result.toString(16).padStart(4, '0').toUpperCase()
        
        // 根据字节序调整CRC16结果顺序
        if (configForm.checksum.endianness === 'little') {
          // 小端：低字节在前，高字节在后
          crcHex = crcHex.slice(2, 4) + crcHex.slice(0, 2)
        }
        
        return crcHex
        
      default:
        return '00'
    }
  }

  // 当前配置数据
  const currentConfig = computed(() => {
    return {
      header: configForm.header,
      format: configForm.format,
      checksum: {
        ...configForm.checksum,
        endianness: configForm.checksum.endianness ?? 'big'
      },
      includeFunction: configForm.includeFunction,
      addressLength: configForm.addressLength ?? 1,
      functionLength: configForm.functionLength ?? 1,
      includeRegisterCount: configForm.includeRegisterCount ?? false,
      registerCountLength: configForm.registerCountLength ?? 1,
      lengthLength: configForm.lengthLength,
      dataEndianness: configForm.dataEndianness ?? 'little',
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
        endianness: configForm.checksum.endianness ?? 'big'
      },
      includeFunction: configForm.includeFunction,
      addressLength: configForm.addressLength ?? 1,
      functionLength: configForm.functionLength ?? 1,
      includeRegisterCount: configForm.includeRegisterCount ?? false,
      registerCountLength: configForm.registerCountLength ?? 1,
      lengthLength: configForm.lengthLength,
      dataEndianness: configForm.dataEndianness ?? 'little',
      readCommands: readCommands.value.map(cmd => ({
        name: cmd.name,
        address: cmd.address,
        data: cmd.data,
        length: cmd.length,
        dataType: cmd.dataType,
        functionCode: cmd.functionCode,  // 包含功能码字段
        registerCount: cmd.registerCount,  // 包含寄存器个数字段
        includeRegisterCount: cmd.includeRegisterCount,  // 包含寄存器个数checkbox状态
        includeLength: cmd.includeLength,  // 包含字节个数checkbox状态
        frequency: cmd.frequency,
        lastSentTime: cmd.lastSentTime
      })),
      writeCommands: writeCommands.value.map(cmd => ({
        name: cmd.name,
        address: cmd.address,
        data: cmd.data,
        length: cmd.length,
        dataType: cmd.dataType,
        functionCode: cmd.functionCode,  // 包含功能码字段
        registerCount: cmd.registerCount,  // 包含寄存器个数字段
        includeRegisterCount: cmd.includeRegisterCount,  // 包含寄存器个数checkbox状态
        includeLength: cmd.includeLength  // 包含字节个数checkbox状态
      }))
    }

    return JSON.stringify(config, null, 2)
  })

  // 计算属性：配置是否有效
  const isConfigValid = computed(() => {
    return configForm.header && configForm.format
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
        functionCode: '03',  // 读指令默认功能码03
        registerCount: '01',  // 默认寄存器个数01
        includeRegisterCount: true,  // 默认启用寄存器个数复选框
        includeLength: true,  // 默认启用字节个数复选框
        frequency: null, 
        lastSentTime: 0 
      })
    } else {
      writeCommands.value.push({ 
        name: 'NEW_CMD', 
        address: '00', 
        data: '0000', 
        length: 2,
        dataType: 'int16',
        functionCode: '06',  // 写指令默认功能码06
        registerCount: '01',  // 默认寄存器个数01
        includeRegisterCount: true,  // 默认启用寄存器个数复选框
        includeLength: true  // 默认启用字节个数复选框
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

  // 移动命令（用于拖拽排序）
  const moveCommand = (type: 'read' | 'write', oldIndex: number, newIndex: number) => {
    if (type === 'read') {
      const commands = readCommands.value
      if (oldIndex < 0 || oldIndex >= commands.length || newIndex < 0 || newIndex >= commands.length) {
        return
      }
      const [movedItem] = commands.splice(oldIndex, 1)
      commands.splice(newIndex, 0, movedItem)
    } else {
      const commands = writeCommands.value
      if (oldIndex < 0 || oldIndex >= commands.length || newIndex < 0 || newIndex >= commands.length) {
        return
      }
      const [movedItem] = commands.splice(oldIndex, 1)
      commands.splice(newIndex, 0, movedItem)
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
  const buildReadCommandMessage = (cmd: ReadCommand, config: ConfigForm, messageStructure?: Array<{id: string, title: string}>): string => {
    // 如果没有提供messageStructure，使用默认顺序
    if (!messageStructure || messageStructure.length === 0) {
      messageStructure = [
        { id: 'header', title: '报头' },
        { id: 'address', title: '地址' },
        { id: 'function', title: '功能码' },
        { id: 'registerCount', title: '寄存器个数' },
        { id: 'length', title: '长度' },
        { id: 'data', title: '数据' },
        { id: 'checksum', title: '校验和' }
      ]
    }
    
    let message = ''

    // 按照messageStructure的顺序构建报文
    messageStructure.forEach(field => {
      switch (field.id) {
        case 'header':
          message += config.header
          break
        case 'address':
          const addressLength = config.addressLength || 2
          message += cmd.address.padStart(addressLength * 2, '0')
          break
        case 'function':
          if (config.includeFunction) {
            const functionLength = config.functionLength || 2
            const functionCode = cmd.functionCode || '03' // 使用命令中的功能码，默认03
            message += functionCode.padStart(functionLength * 2, '0')
          }
          break
        case 'registerCount':
          if (config.includeRegisterCount && cmd.registerCount) {
            // 寄存器个数始终可配，根据checkbox决定是否包含
            if (cmd.includeRegisterCount !== false) {
              const registerCountLength = config.registerCountLength || 1
              const registerCountStr = cmd.registerCount.toString()
              message += registerCountStr.padStart(registerCountLength * 2, '0')
            }
          }
          break
        case 'length':
          // 字节个数始终可配，根据checkbox决定是否包含
          if ((cmd as ReadCommand).includeLength !== false) {
            const lengthLength = config.lengthLength || 1
            // 直接使用长度值，不通过decimalToHex转换，因为长度就是字节数
            const length = cmd.length.toString(16).padStart(lengthLength * 2, '0').toUpperCase()
            message += length
          }
          break
        case 'data':
          // 读指令通常不包含数据字段
          if (false && cmd.length > 0) {
            const data = cmd.data.padStart(cmd.length * 2, '0')
            message += data
          }
          break
        case 'checksum':
          // 校验码需要基于前面的内容计算，使用配置的起止索引
          const checksum = calculateChecksum(message, config.checksum.method, config.checksum.start_index)
          message += checksum
          break
      }
    })
    
    return message
  }

  // 构建写指令报文
  const buildWriteCommandMessage = (cmd: WriteCommand, config: ConfigForm, messageStructure?: Array<{id: string, title: string}>): string => {
    // 如果没有提供messageStructure，使用默认顺序
    if (!messageStructure || messageStructure.length === 0) {
      messageStructure = [
        { id: 'header', title: '报头' },
        { id: 'address', title: '地址' },
        { id: 'function', title: '功能码' },
        { id: 'registerCount', title: '寄存器个数' },
        { id: 'length', title: '长度' },
        { id: 'data', title: '数据' },
        { id: 'checksum', title: '校验和' }
      ]
    }
    
    let message = ''
    
    // 按照messageStructure的顺序构建报文
    messageStructure.forEach(field => {
      switch (field.id) {
        case 'header':
          message += config.header
          break
        case 'address':
          const addressLength = config.addressLength || 2
          message += cmd.address.padStart(addressLength * 2, '0')
          break
        case 'function':
          if (config.includeFunction) {
            const functionLength = config.functionLength || 2
            const functionCode = cmd.functionCode || '06' // 使用命令中的功能码，默认06
            message += functionCode.padStart(functionLength * 2, '0')
          }
          break
        case 'registerCount':
          if (config.includeRegisterCount && cmd.registerCount) {
            // 寄存器个数始终可配，根据checkbox决定是否包含
            if ((cmd as ReadCommand).includeRegisterCount !== false) {
              const registerCountLength = config.registerCountLength || 1
              const registerCountStr = cmd.registerCount.toString()
              message += registerCountStr.padStart(registerCountLength * 2, '0')
            }
          }
          break
        case 'length':
          // 字节个数始终可配，根据checkbox决定是否包含
          if ((cmd as ReadCommand).includeLength !== false) {
            const lengthLength = config.lengthLength || 1
            // 直接使用长度值，不通过decimalToHex转换，因为长度就是字节数
            const length = cmd.length.toString(16).padStart(lengthLength * 2, '0').toUpperCase()
            message += length
          }
          break
        case 'data':
          // 数据内容始终可配，根据数据类型处理字节序
          if (cmd.data && cmd.data.length > 0) {
            const dataType = cmd.dataType || 'int16'
            // 限制数据长度，确保不超过cmd.length指定的字节数
            const maxHexLength = cmd.length * 2
            let cleanData = cmd.data.replace(/\s/g, '').substring(0, maxHexLength)
            
            if (config.dataEndianness === 'little') {
              // 小端模式：每2字节（4个十六进制字符）交换高低字节
              let littleEndianData = ''
              for (let i = 0; i < cleanData.length; i += 4) {
                const chunk = cleanData.substring(i, i + 4).padStart(4, '0')
                littleEndianData += chunk.slice(2, 4) + chunk.slice(0, 2)
              }
              message += littleEndianData
            } else {
              // 大端模式：直接使用原始数据，确保长度正确
              message += cleanData.padEnd(maxHexLength, '0').substring(0, maxHexLength)
            }
          }
          break
        case 'checksum':
          // 校验码需要基于前面的内容计算，使用配置的起止索引
          const checksum = calculateChecksum(message, config.checksum.method, config.checksum.start_index)
          message += checksum
          break
      }
    })
    
    return message
  }

  const convertByteArrayToJson = (hexData: any) => {
    try {
      // 确保输入有效
      if (!hexData || (typeof hexData !== 'string' && !Array.isArray(hexData))) {
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
      const registerCount = hexString.substring(6, 8) // 1字节寄存器个数
      const dataLength = parseInt(hexString.substring(8, 10), 16) // 1字节数据长度
      const dataStartIndex = 10
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
      
      // 如果启用了寄存器个数，验证寄存器个数是否匹配
      if (configForm.includeRegisterCount && matchedCmd && matchedCmd.registerCount !== registerCount) {
        console.warn(`寄存器个数不匹配：期望 ${matchedCmd.registerCount}，实际 ${registerCount}`)
        return ''
      }
      
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
    moveCommand,
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