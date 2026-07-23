import { ref, reactive, computed } from 'vue'

export type MotorDataType = 'int16' | 'float32'
export type MotorEndianness = 'big' | 'little'
export type MotorCommandKind = 'read' | 'write'
export type MotorMessageFieldId =
  | 'header'
  | 'address'
  | 'function'
  | 'registerCount'
  | 'length'
  | 'data'
  | 'checksum'

export const DEFAULT_MOTOR_MESSAGE_FIELD_ORDER: MotorMessageFieldId[] = [
  'header',
  'address',
  'function',
  'registerCount',
  'length',
  'data',
  'checksum',
]

// 命令接口定义
export interface Command {
  name: string
  address: string
  data: string
  length: number
  dataType: MotorDataType
  functionCode?: string // 功能码（可选）
  registerCount?: number // 寄存器个数（可选）
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
  endianness?: MotorEndianness // 校验和字节序（主要针对CRC16）
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
  dataEndianness?: MotorEndianness
}

export const bytesPerMotorValue = (dataType: MotorDataType): number =>
  dataType === 'float32' ? 4 : 2

export const maxUnsignedValue = (byteLength: number): number =>
  byteLength === 2 ? 0xffff : 0xff

export const sanitizeHex = (value: unknown): string =>
  String(value ?? '')
    .replace(/0x/gi, '')
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase()

export const fitHexToBytes = (
  value: unknown,
  byteLength: number,
  padDirection: 'start' | 'end' = 'start',
): string => {
  const targetLength = Math.max(0, Math.trunc(byteLength)) * 2
  if (targetLength === 0) return ''
  const sanitized = sanitizeHex(value)
  const clean =
    padDirection === 'end' ? sanitized.slice(0, targetLength) : sanitized.slice(-targetLength)
  return padDirection === 'end'
    ? clean.padEnd(targetLength, '0')
    : clean.padStart(targetLength, '0')
}

export const normalizeMotorLength = (
  value: unknown,
  dataType: MotorDataType,
  allowZero = false,
): number => {
  const bytesPerValue = bytesPerMotorValue(dataType)
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return allowZero ? 0 : bytesPerValue
  const bounded = Math.min(32, Math.max(1, Math.trunc(numeric)))
  return Math.min(32, Math.max(bytesPerValue, Math.ceil(bounded / bytesPerValue) * bytesPerValue))
}

export const registerCountFromLength = (length: number): number =>
  Math.max(0, Math.ceil(Math.max(0, length) / 2))

export const createDefaultMotorConfig = (): ConfigForm => ({
  header: 'A5',
  format: 'hex',
  checksum: {
    method: 'crc16',
    start_index: 0,
    end_index: -1,
    endianness: 'big',
  },
  includeFunction: true,
  addressLength: 1,
  functionLength: 1,
  includeRegisterCount: true,
  registerCountLength: 1,
  lengthLength: 2,
  dataEndianness: 'little',
})

export const createDefaultReadCommands = (): ReadCommand[] => [
  {
    name: 'GET_SPEED',
    address: '00',
    data: '0000',
    length: 4,
    dataType: 'int16',
    functionCode: '03',
    registerCount: 2,
    includeRegisterCount: true,
    includeLength: true,
    frequency: null,
    lastSentTime: 0,
  },
  {
    name: 'GET_SPEED_M1',
    address: '01',
    data: '0000',
    length: 2,
    dataType: 'int16',
    functionCode: '03',
    registerCount: 1,
    includeRegisterCount: true,
    includeLength: true,
    frequency: null,
    lastSentTime: 0,
  },
  {
    name: 'GET_SPEED_M2',
    address: '02',
    data: '0000',
    length: 2,
    dataType: 'int16',
    functionCode: '03',
    registerCount: 1,
    includeRegisterCount: true,
    includeLength: true,
    frequency: null,
    lastSentTime: 0,
  },
]

export const createDefaultWriteCommands = (): WriteCommand[] => [
  {
    name: 'SET_SPEED',
    address: '00',
    data: '00000000',
    length: 4,
    dataType: 'float32',
    functionCode: '06',
    registerCount: 2,
    includeRegisterCount: true,
    includeLength: true,
  },
  {
    name: 'SET_SPEED_M1',
    address: '01',
    data: '0000',
    length: 2,
    dataType: 'int16',
    functionCode: '06',
    registerCount: 1,
    includeRegisterCount: true,
    includeLength: true,
  },
  {
    name: 'SET_SPEED_M2',
    address: '02',
    data: '0000',
    length: 2,
    dataType: 'int16',
    functionCode: '06',
    registerCount: 1,
    includeRegisterCount: true,
    includeLength: true,
  },
]

export function createMotorCmdManager() {
  // 配置表单数据
  const configForm = reactive<ConfigForm>(createDefaultMotorConfig())

  // 读命令列表
  const readCommands = ref<ReadCommand[]>(createDefaultReadCommands())

  // 写命令列表
  const writeCommands = ref<WriteCommand[]>(createDefaultWriteCommands())

  // 报文字段顺序同时供发送与接收解析使用。
  const messageFieldOrder = ref<MotorMessageFieldId[]>([...DEFAULT_MOTOR_MESSAGE_FIELD_ORDER])

  // 指令状态缓存，保存所有读指令的上次数值。
  const commandStatusCache = ref<Record<string, number | null>>({})

  // ===== 数据转换工具函数 =====

  // 计算数据个数（根据数据类型和长度）
  const getDataCount = (cmd: Command): number => {
    if (cmd.length <= 0) return 1
    return Math.max(1, Math.ceil(cmd.length / bytesPerMotorValue(cmd.dataType)))
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
  const splitData = (data: string, count: number, dataType: MotorDataType = 'int16'): string[] => {
    // 根据数据类型确定每个数据占用的十六进制字符数
    const hexCharsPerData = bytesPerMotorValue(dataType) * 2
    if (count <= 1) {
      return [sanitizeHex(data).slice(0, hexCharsPerData).padEnd(hexCharsPerData, '0')]
    }

    const cleanData = sanitizeHex(data)
      .slice(0, count * hexCharsPerData)
      .padEnd(count * hexCharsPerData, '0')
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
  const decimalToHex = (
    decimalStr: string,
    dataType: MotorDataType,
    endianness: MotorEndianness = configForm.dataEndianness || 'little',
  ): string => {
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
    if (dataType === 'int16') {
      // int16: 2字节，范围 -32768 到 32767
      const clamped = Math.max(-32768, Math.min(32767, Math.trunc(num)))
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
  const hexToDecimal = (
    hexStr: string,
    dataType: MotorDataType,
    endianness: MotorEndianness = configForm.dataEndianness || 'little',
  ): string => {
    if (!hexStr || hexStr.length < 2) {
      return '0'
    }
    
    try {
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

  const calculateChecksum = (
    message: string,
    method: ChecksumConfig['method'],
    startIndex?: number,
    endianness: MotorEndianness = configForm.checksum.endianness || 'big',
  ): string => {
    let bytes = sanitizeHex(message).match(/.{2}/g) || []
    
    // 如果指定了起始索引，截取从起始位置到末尾的字节范围
    if (startIndex !== undefined) {
      const validStartIndex = Math.max(0, Math.trunc(startIndex))
      bytes = bytes.slice(validStartIndex) as RegExpMatchArray
    }
    
    switch (method) {
      case 'none':
        return ''  // 无校验位，返回空字符串
        
      case 'xor': {
        let xor = 0
        bytes.forEach(byte => {
          xor ^= parseInt(byte, 16)
        })
        return xor.toString(16).padStart(2, '0').toUpperCase()
      }
        
      case 'sum': {
        let sum = 0
        bytes.forEach(byte => {
          sum += parseInt(byte, 16)
        })
        return (sum & 0xFF).toString(16).padStart(2, '0').toUpperCase()
      }

      case 'crc8': {
        // CRC-8/ATM: poly=0x07, init=0x00, refin=false, xorout=0x00
        let crc = 0
        bytes.forEach(byte => {
          crc ^= parseInt(byte, 16)
          for (let bit = 0; bit < 8; bit += 1) {
            crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
          }
        })
        return crc.toString(16).padStart(2, '0').toUpperCase()
      }

      case 'crc16': {
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
        if (endianness === 'little') {
          // 小端：低字节在前，高字节在后
          crcHex = crcHex.slice(2, 4) + crcHex.slice(0, 2)
        }
        
        return crcHex
      }
        
      default:
        return '00'
    }
  }

  const normalizeCommand = (cmd: Command, kind: MotorCommandKind): void => {
    const addressLength = configForm.addressLength ?? 1
    const functionLength = configForm.functionLength ?? 1
    const registerCountLength = configForm.registerCountLength ?? 1
    cmd.name = String(cmd.name ?? '').trim()
    cmd.address = fitHexToBytes(cmd.address, addressLength)
    cmd.functionCode = fitHexToBytes(cmd.functionCode ?? (kind === 'read' ? '03' : '06'), functionLength)
    cmd.length = normalizeMotorLength(cmd.length, cmd.dataType, kind === 'read')
    cmd.includeRegisterCount = cmd.includeRegisterCount !== false
    cmd.includeLength = cmd.includeLength !== false
    cmd.registerCount = cmd.includeRegisterCount
      ? registerCountFromLength(cmd.length)
      : Math.min(
          maxUnsignedValue(registerCountLength),
          Math.max(0, Math.trunc(Number(cmd.registerCount) || 0)),
        )
    cmd.data =
      kind === 'write'
        ? fitHexToBytes(cmd.data, cmd.length, 'end')
        : sanitizeHex(cmd.data || '0000')
  }

  const updateCommandLength = (
    cmd: Command,
    value: unknown,
    kind: MotorCommandKind,
  ): void => {
    const oldCount = getDataCount(cmd)
    const existingValues = splitData(cmd.data, oldCount, cmd.dataType)
    cmd.length = normalizeMotorLength(value, cmd.dataType, kind === 'read')
    const nextCount = getDataCount(cmd)
    const emptyValue = '0'.repeat(bytesPerMotorValue(cmd.dataType) * 2)
    cmd.data = Array.from({ length: nextCount }, (_, index) => existingValues[index] || emptyValue).join(
      '',
    )
    if (cmd.includeRegisterCount !== false) {
      cmd.registerCount = registerCountFromLength(cmd.length)
    }
    normalizeCommand(cmd, kind)
  }

  const updateCommandRegisterCount = (
    cmd: Command,
    value: unknown,
    kind: MotorCommandKind,
  ): void => {
    const max = maxUnsignedValue(configForm.registerCountLength ?? 1)
    const registerCount = Math.min(max, Math.max(0, Math.trunc(Number(value) || 0)))
    cmd.registerCount = registerCount
    updateCommandLength(cmd, registerCount * 2, kind)
  }

  const updateCommandDataType = (
    cmd: Command,
    dataType: MotorDataType,
    kind: MotorCommandKind,
  ): void => {
    if (cmd.dataType === dataType) return
    const previousType = cmd.dataType
    const previousCount = getDataCount(cmd)
    const endianness = configForm.dataEndianness || 'little'
    const values = splitData(cmd.data, previousCount, previousType).map(value =>
      hexToDecimal(value, previousType, endianness),
    )
    cmd.dataType = dataType
    cmd.length = normalizeMotorLength(cmd.length, dataType, kind === 'read')
    const nextCount = cmd.length > 0 ? cmd.length / bytesPerMotorValue(dataType) : 0
    cmd.data = Array.from({ length: nextCount }, (_, index) =>
      decimalToHex(values[index] ?? '0', dataType, endianness),
    ).join('')
    if (cmd.includeRegisterCount !== false) {
      cmd.registerCount = registerCountFromLength(cmd.length)
    }
    normalizeCommand(cmd, kind)
  }

  const reencodeWriteCommandData = (
    previousEndianness: MotorEndianness,
    nextEndianness: MotorEndianness,
  ): void => {
    if (previousEndianness === nextEndianness) return
    writeCommands.value.forEach(cmd => {
      const count = getDataCount(cmd)
      cmd.data = splitData(cmd.data, count, cmd.dataType)
        .map(value =>
          decimalToHex(
            hexToDecimal(value, cmd.dataType, previousEndianness),
            cmd.dataType,
            nextEndianness,
          ),
        )
        .join('')
      normalizeCommand(cmd, 'write')
    })
  }

  const normalizeAllCommands = (): void => {
    readCommands.value.forEach(cmd => normalizeCommand(cmd, 'read'))
    writeCommands.value.forEach(cmd => normalizeCommand(cmd, 'write'))
  }

  const configurationIssues = computed<string[]>(() => {
    const issues: string[] = []
    const header = sanitizeHex(configForm.header)
    if (!header || header !== configForm.header.toUpperCase() || header.length % 2 !== 0) {
      issues.push('报头必须是完整的十六进制字节')
    }
    if (!Number.isInteger(configForm.checksum.start_index) || configForm.checksum.start_index < 0) {
      issues.push('校验起始字节必须是非负整数')
    }

    const names = new Set<string>()
    const readMappings = new Set<string>()
    const inspect = (cmd: Command, kind: MotorCommandKind, index: number) => {
      const label = `${kind === 'read' ? '读' : '写'}指令 ${index + 1}`
      if (!cmd.name.trim()) issues.push(`${label}缺少命令名称`)
      else if (names.has(cmd.name)) issues.push(`命令名称“${cmd.name}”重复`)
      else names.add(cmd.name)

      const addressLength = (configForm.addressLength ?? 1) * 2
      if (sanitizeHex(cmd.address).length !== addressLength) {
        issues.push(`${label}的寄存器地址应为 ${addressLength} 位十六进制数`)
      }
      if (configForm.includeFunction) {
        const functionLength = (configForm.functionLength ?? 1) * 2
        if (sanitizeHex(cmd.functionCode).length !== functionLength) {
          issues.push(`${label}的功能码应为 ${functionLength} 位十六进制数`)
        }
      }

      if (kind === 'read') {
        const mappingKey = [
          fitHexToBytes(cmd.address, configForm.addressLength ?? 1),
          configForm.includeFunction
            ? fitHexToBytes(cmd.functionCode, configForm.functionLength ?? 1)
            : '',
        ].join(':')
        if (readMappings.has(mappingKey)) {
          issues.push(`${label}与其他读指令使用了相同的地址和功能码，接收数据时无法区分`)
        } else {
          readMappings.add(mappingKey)
        }
      }

      const bytesPerValue = bytesPerMotorValue(cmd.dataType)
      if (
        !Number.isInteger(cmd.length) ||
        cmd.length < 0 ||
        cmd.length > 32 ||
        cmd.length % bytesPerValue !== 0 ||
        (kind === 'write' && cmd.length === 0)
      ) {
        issues.push(`${label}的字节个数必须是 ${bytesPerValue} 的正整数倍`)
      }
      if (kind === 'write' && sanitizeHex(cmd.data).length !== cmd.length * 2) {
        issues.push(`${label}的数据内容与字节个数不一致`)
      }
      if (
        configForm.includeRegisterCount &&
        cmd.includeRegisterCount !== false &&
        cmd.registerCount !== registerCountFromLength(cmd.length)
      ) {
        issues.push(`${label}的寄存器个数应与字节个数保持 1:2`)
      }
      if (
        kind === 'read' &&
        (cmd as ReadCommand).frequency !== null &&
        (!Number.isFinite((cmd as ReadCommand).frequency) || (cmd as ReadCommand).frequency! <= 0)
      ) {
        issues.push(`${label}的发送频率必须留空或大于 0`)
      }
    }

    readCommands.value.forEach((cmd, index) => inspect(cmd, 'read', index))
    writeCommands.value.forEach((cmd, index) => inspect(cmd, 'write', index))
    return [...new Set(issues)]
  })

  const resetConfiguration = (): void => {
    const defaults = createDefaultMotorConfig()
    Object.assign(configForm, defaults, { checksum: { ...defaults.checksum } })
    readCommands.value = createDefaultReadCommands()
    writeCommands.value = createDefaultWriteCommands()
    messageFieldOrder.value = [...DEFAULT_MOTOR_MESSAGE_FIELD_ORDER]
    initializeCommandStatusCache()
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
    return configurationIssues.value.length === 0
  })

  // 添加命令
  const addCommand = (type: 'read' | 'write') => {
    const existingNames = new Set([...readCommands.value, ...writeCommands.value].map(cmd => cmd.name))
    const prefix = type === 'read' ? 'NEW_READ_CMD' : 'NEW_WRITE_CMD'
    let suffix = 1
    while (existingNames.has(`${prefix}_${suffix}`)) suffix += 1
    const name = `${prefix}_${suffix}`

    if (type === 'read') {
      readCommands.value.push({ 
        name,
        address: '00', 
        data: '0000', 
        length: 2,
        dataType: 'int16',
        functionCode: '03',  // 读指令默认功能码03
        registerCount: 1,  // 默认寄存器个数01
        includeRegisterCount: true,  // 默认启用寄存器个数复选框
        includeLength: true,  // 默认启用字节个数复选框
        frequency: null, 
        lastSentTime: 0 
      })
    } else {
      writeCommands.value.push({ 
        name,
        address: '00', 
        data: '0000', 
        length: 2,
        dataType: 'int16',
        functionCode: '06',  // 写指令默认功能码06
        registerCount: 1,  // 默认寄存器个数01
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

  const resolveMessageStructure = (
    messageStructure?: Array<{ id: string; title?: string }>,
  ): Array<{ id: MotorMessageFieldId; title?: string }> => {
    const requestedOrder = (messageStructure?.length
      ? messageStructure.map(field => field.id)
      : messageFieldOrder.value
    ).filter((id): id is MotorMessageFieldId =>
      DEFAULT_MOTOR_MESSAGE_FIELD_ORDER.includes(id as MotorMessageFieldId),
    )
    const uniqueOrder = [...new Set(requestedOrder)]
    DEFAULT_MOTOR_MESSAGE_FIELD_ORDER.forEach(id => {
      if (!uniqueOrder.includes(id)) uniqueOrder.push(id)
    })
    return uniqueOrder.map(id => ({ id }))
  }

  // 构建读指令报文
  const buildReadCommandMessage = (cmd: ReadCommand, config: ConfigForm, messageStructure?: Array<{id: string, title: string}>): string => {
    const resolvedStructure = resolveMessageStructure(messageStructure)
    
    let message = ''

    // 按照messageStructure的顺序构建报文
    resolvedStructure.forEach(field => {
      switch (field.id) {
        case 'header':
          message += sanitizeHex(config.header)
          break
        case 'address':
          message += fitHexToBytes(cmd.address, config.addressLength ?? 1)
          break
        case 'function':
          if (config.includeFunction) {
            const functionCode = cmd.functionCode || '03' // 使用命令中的功能码，默认03
            message += fitHexToBytes(functionCode, config.functionLength ?? 1)
          }
          break
        case 'registerCount':
          if (config.includeRegisterCount && cmd.registerCount !== undefined) {
            // 寄存器个数始终可配，根据checkbox决定是否包含
            if (cmd.includeRegisterCount !== false) {
              const registerCountLength = config.registerCountLength ?? 1
              const registerCount = Math.min(
                maxUnsignedValue(registerCountLength),
                Math.max(0, Math.trunc(cmd.registerCount)),
              )
                .toString(16)
                .padStart(registerCountLength * 2, '0')
                .toUpperCase()
              message += registerCount
            }
          }
          break
        case 'length':
          // 字节个数始终可配，根据checkbox决定是否包含
          if ((cmd as ReadCommand).includeLength !== false) {
            const lengthLength = config.lengthLength ?? 1
            // 直接使用长度值，不通过decimalToHex转换，因为长度就是字节数
            const length = cmd.length.toString(16).padStart(lengthLength * 2, '0').toUpperCase()
            message += length
          }
          break
        case 'data':
          // 读请求不携带数据；length 描述期望的应答数据长度。
          break
        case 'checksum': {
          // 校验码需要基于前面的内容计算，使用配置的起止索引
          const checksum = calculateChecksum(
            message,
            config.checksum.method,
            config.checksum.start_index,
            config.checksum.endianness || 'big',
          )
          message += checksum
          break
        }
      }
    })
    
    return message
  }

  // 构建写指令报文
  const buildWriteCommandMessage = (cmd: WriteCommand, config: ConfigForm, messageStructure?: Array<{id: string, title: string}>): string => {
    const resolvedStructure = resolveMessageStructure(messageStructure)
    
    let message = ''
    
    // 按照messageStructure的顺序构建报文
    resolvedStructure.forEach(field => {
      switch (field.id) {
        case 'header':
          message += sanitizeHex(config.header)
          break
        case 'address':
          message += fitHexToBytes(cmd.address, config.addressLength ?? 1)
          break
        case 'function':
          if (config.includeFunction) {
            const functionCode = cmd.functionCode || '06' // 使用命令中的功能码，默认06
            message += fitHexToBytes(functionCode, config.functionLength ?? 1)
          }
          break
        case 'registerCount':
          if (config.includeRegisterCount && cmd.registerCount !== undefined) {
            // 寄存器个数始终可配，根据checkbox决定是否包含
            if ((cmd as ReadCommand).includeRegisterCount !== false) {
              const registerCountLength = config.registerCountLength ?? 1
              const registerCount = Math.min(
                maxUnsignedValue(registerCountLength),
                Math.max(0, Math.trunc(cmd.registerCount)),
              )
                .toString(16)
                .padStart(registerCountLength * 2, '0')
                .toUpperCase()
              message += registerCount
            }
          }
          break
        case 'length':
          // 字节个数始终可配，根据checkbox决定是否包含
          if ((cmd as ReadCommand).includeLength !== false) {
            const lengthLength = config.lengthLength ?? 1
            // 直接使用长度值，不通过decimalToHex转换，因为长度就是字节数
            const length = cmd.length.toString(16).padStart(lengthLength * 2, '0').toUpperCase()
            message += length
          }
          break
        case 'data':
          // cmd.data 始终保存为当前字节序下的线上字节；构建报文时只做长度归一化。
          if (cmd.length > 0) {
            message += fitHexToBytes(cmd.data, cmd.length, 'end')
          }
          break
        case 'checksum': {
          // 校验码需要基于前面的内容计算，使用配置的起止索引
          const checksum = calculateChecksum(
            message,
            config.checksum.method,
            config.checksum.start_index,
            config.checksum.endianness || 'big',
          )
          message += checksum
          break
        }
      }
    })
    
    return message
  }


  const checksumByteLength = (method: ChecksumConfig['method']): number => {
    if (method === 'none') return 0
    return method === 'crc16' ? 2 : 1
  }

  interface ParsedMotorResponse {
    command: ReadCommand
    dataHex: string
  }

  const parseReadResponseForCommand = (
    hexString: string,
    command: ReadCommand,
  ): ParsedMotorResponse | null => {
    let cursor = 0
    let dataHex = ''
    let parsedLength: number | undefined
    let parsedRegisterCount: number | undefined
    let checksumStart = -1
    let receivedChecksum = ''

    const takeBytes = (byteLength: number): string | null => {
      const hexLength = Math.max(0, Math.trunc(byteLength)) * 2
      if (cursor + hexLength > hexString.length) return null
      const value = hexString.slice(cursor, cursor + hexLength)
      cursor += hexLength
      return value
    }

    for (const field of resolveMessageStructure()) {
      let value: string | null = ''
      switch (field.id) {
        case 'header': {
          const expectedHeader = sanitizeHex(configForm.header)
          if (!expectedHeader || expectedHeader.length % 2 !== 0) return null
          value = takeBytes(expectedHeader.length / 2)
          if (value !== expectedHeader) return null
          break
        }
        case 'address':
          value = takeBytes(configForm.addressLength ?? 1)
          if (value !== fitHexToBytes(command.address, configForm.addressLength ?? 1)) return null
          break
        case 'function':
          if (configForm.includeFunction) {
            value = takeBytes(configForm.functionLength ?? 1)
            if (
              value !==
              fitHexToBytes(command.functionCode ?? '03', configForm.functionLength ?? 1)
            ) {
              return null
            }
          }
          break
        case 'registerCount':
          if (configForm.includeRegisterCount && command.includeRegisterCount !== false) {
            value = takeBytes(configForm.registerCountLength ?? 1)
            if (value === null) return null
            parsedRegisterCount = Number.parseInt(value, 16)
          }
          break
        case 'length':
          if (command.includeLength !== false) {
            value = takeBytes(configForm.lengthLength ?? 1)
            if (value === null) return null
            parsedLength = Number.parseInt(value, 16)
          }
          break
        case 'data':
          value = takeBytes(command.length)
          if (value === null) return null
          dataHex = value
          break
        case 'checksum':
          checksumStart = cursor
          value = takeBytes(checksumByteLength(configForm.checksum.method))
          if (value === null) return null
          receivedChecksum = value
          break
      }
    }

    if (cursor !== hexString.length) return null
    if (parsedLength !== undefined && parsedLength !== command.length) return null
    if (
      parsedRegisterCount !== undefined &&
      parsedRegisterCount !== (command.registerCount ?? registerCountFromLength(command.length))
    ) {
      return null
    }
    if (configForm.checksum.method !== 'none') {
      if (checksumStart < 0) return null
      const expectedChecksum = calculateChecksum(
        hexString.slice(0, checksumStart),
        configForm.checksum.method,
        configForm.checksum.start_index,
        configForm.checksum.endianness || 'big',
      )
      if (receivedChecksum !== expectedChecksum) return null
    }

    return { command, dataHex }
  }

  const convertByteArrayToJson = (hexData: unknown): string => {
    try {
      if (!hexData || (typeof hexData !== 'string' && !Array.isArray(hexData))) return ''

      const hexString = Array.isArray(hexData)
        ? hexData
            .map(byte =>
              Math.min(0xff, Math.max(0, Math.trunc(Number(byte) || 0)))
                .toString(16)
                .padStart(2, '0'),
            )
            .join('')
            .toUpperCase()
        : sanitizeHex(hexData)

      if (!hexString || hexString.length % 2 !== 0) {
        console.warn('电机报文不是完整的十六进制字节流')
        return ''
      }

      const parsed = readCommands.value
        .map(command => parseReadResponseForCommand(hexString, command))
        .find((value): value is ParsedMotorResponse => value !== null)

      if (!parsed) {
        console.warn('电机报文与当前读指令结构或校验配置不匹配')
        return ''
      }

      const { command, dataHex } = parsed
      const bytesPerData = bytesPerMotorValue(command.dataType)
      if (command.length <= 0 || command.length % bytesPerData !== 0) return ''
      const actualDataCount = command.length / bytesPerData
      const dataArray = splitData(dataHex, actualDataCount, command.dataType)
      const results: Record<string, number | null> = { ...commandStatusCache.value }

      Object.keys(commandStatusCache.value).forEach(key => {
        if (key === command.name || key.startsWith(`${command.name}_`)) {
          delete commandStatusCache.value[key]
          delete results[key]
        }
      })

      if (actualDataCount === 1) {
        const value = Number(
          hexToDecimal(dataArray[0], command.dataType, configForm.dataEndianness || 'little'),
        )
        results[command.name] = value
        commandStatusCache.value[command.name] = value
      } else {
        dataArray.forEach((data, index) => {
          const keyName = `${command.name}_${index + 1}`
          const value = Number(
            hexToDecimal(data, command.dataType, configForm.dataEndianness || 'little'),
          )
          results[keyName] = value
          commandStatusCache.value[keyName] = value
        })
      }

      return `${JSON.stringify(results)}\n`
    } catch (error) {
      console.error('字节数组转 JSON 失败:', error)
      return ''
    }
  }

  return {
    // 状态
    configForm,
    readCommands,
    writeCommands,
    messageFieldOrder,
    
    // 计算属性
    currentConfig,
    formattedConfig,
    isConfigValid,
    configurationIssues,
    
    // 方法
    addCommand,
    removeCommand,
    moveCommand,
    updateConfigForm,
    updateReadCommands,
    updateWriteCommands,
    normalizeCommand,
    normalizeAllCommands,
    updateCommandLength,
    updateCommandRegisterCount,
    updateCommandDataType,
    reencodeWriteCommandData,
    resetConfiguration,
    
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

export type MotorCmdManager = ReturnType<typeof createMotorCmdManager>

let sharedMotorCmdManager: MotorCmdManager | undefined

export function useMotorCmd(): MotorCmdManager {
  sharedMotorCmdManager ??= createMotorCmdManager()
  return sharedMotorCmdManager
}
