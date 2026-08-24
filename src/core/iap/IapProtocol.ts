export type IapByteOrder = 'big' | 'little'
export type IapChecksumAlgorithm =
  'crc32' | 'crc16-modbus' | 'checksum8' | 'checksum16' | 'xor' | 'none'

export interface IapProtocolConfig {
  baudRate: number
  packageSize: number
  timeoutMs: number
  maxRetries: number
  frameHeaderHex: string
  askCommandHex: string
  dataCommandHex: string
  finalCommandHex: string
  askAckCommandHex: string
  dataAckCommandHex: string
  byteOrder: IapByteOrder
  checksumAlgorithm: IapChecksumAlgorithm
  checksumByteOrder: IapByteOrder
  fileLengthBytes: number
  packageCountBytes: number
  remainderLengthBytes: number
  packetIndexBytes: number
  packetIndexBase: number
  ackIndexOffset: number
  ackIndexBytes: number
  ackStatusOffset: number
  ackSuccessValue: number
  ackRetryValue: number
  responseMinLength: number
  responseMaxLength: number
  responseFrameLength: number
}

export interface IapImageInfo {
  length: number
  packageSize: number
  fullPackets: number
  remainderLength: number
  packageCount: number
}

export interface IapProtocolTemplate {
  id: string
  name: string
  builtin?: boolean
  config: IapProtocolConfig
}

export const IGK_IAP_TEMPLATE: Readonly<IapProtocolTemplate> = Object.freeze({
  id: 'builtin-igk-iap',
  name: 'IGK IAP',
  builtin: true,
  config: Object.freeze({
    baudRate: 115200,
    packageSize: 1024,
    timeoutMs: 5000,
    maxRetries: 3,
    frameHeaderHex: 'F1',
    askCommandHex: '01',
    dataCommandHex: '02',
    finalCommandHex: '03',
    askAckCommandHex: '81',
    dataAckCommandHex: '82',
    byteOrder: 'big',
    checksumAlgorithm: 'crc32',
    checksumByteOrder: 'big',
    fileLengthBytes: 4,
    packageCountBytes: 2,
    remainderLengthBytes: 2,
    packetIndexBytes: 2,
    packetIndexBase: 0,
    ackIndexOffset: 2,
    ackIndexBytes: 2,
    ackStatusOffset: 4,
    ackSuccessValue: 1,
    ackRetryValue: 2,
    responseMinLength: 8,
    responseMaxLength: 64,
    responseFrameLength: 9,
  }),
})

export function cloneIapConfig(config: IapProtocolConfig): IapProtocolConfig {
  return { ...config }
}

export function createIapImageInfo(length: number, packageSize: number): IapImageInfo {
  if (!Number.isSafeInteger(length) || length <= 0) throw new Error('Firmware must not be empty')
  if (!Number.isSafeInteger(packageSize) || packageSize <= 0) {
    throw new Error('Package size must be a positive integer')
  }
  const fullPackets = Math.floor(length / packageSize)
  const remainderLength = length % packageSize
  return {
    length,
    packageSize,
    fullPackets,
    remainderLength,
    packageCount: fullPackets + (remainderLength > 0 ? 1 : 0),
  }
}

export function normalizeHex(value: string): string {
  return value
    .replace(/0x/gi, '')
    .replace(/[^a-fA-F0-9]/g, '')
    .toUpperCase()
}

export function hexToBytes(value: string, fieldName = 'hex value'): Uint8Array {
  const normalized = normalizeHex(value)
  if (normalized.length === 0 || normalized.length % 2 !== 0) {
    throw new Error(`${fieldName} must contain complete bytes`)
  }
  const result = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < result.length; i++) {
    result[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }
  return result
}

export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export function encodeUnsigned(value: number, width: number, byteOrder: IapByteOrder): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Unsigned field value is invalid')
  if (!Number.isInteger(width) || width < 1 || width > 6) throw new Error('Field width is invalid')
  const max = 2 ** (width * 8) - 1
  if (value > max) throw new Error(`Value ${value} does not fit in ${width} bytes`)

  const bytes = new Uint8Array(width)
  let remaining = value
  for (let i = 0; i < width; i++) {
    const target = byteOrder === 'big' ? width - i - 1 : i
    bytes[target] = remaining % 256
    remaining = Math.floor(remaining / 256)
  }
  return bytes
}

export function decodeUnsigned(
  bytes: Uint8Array,
  offset: number,
  width: number,
  byteOrder: IapByteOrder,
): number {
  if (offset < 0 || width < 1 || offset + width > bytes.length) {
    throw new Error('Unsigned field is outside the response frame')
  }
  let value = 0
  if (byteOrder === 'big') {
    for (let i = offset; i < offset + width; i++) value = value * 256 + bytes[i]
  } else {
    for (let i = offset + width - 1; i >= offset; i--) value = value * 256 + bytes[i]
  }
  return value
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function crc32(payload: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of payload) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function crc16Modbus(payload: Uint8Array): number {
  let crc = 0xffff
  for (const byte of payload) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xa001 : 0)
    }
  }
  return crc & 0xffff
}

export function checksumLength(algorithm: IapChecksumAlgorithm): number {
  if (algorithm === 'none') return 0
  if (algorithm === 'crc32') return 4
  if (algorithm === 'crc16-modbus' || algorithm === 'checksum16') return 2
  return 1
}

export function calculateChecksum(
  payload: Uint8Array,
  algorithm: IapChecksumAlgorithm,
  byteOrder: IapByteOrder,
): Uint8Array {
  if (algorithm === 'none') return new Uint8Array()
  if (algorithm === 'crc32') return encodeUnsigned(crc32(payload), 4, byteOrder)
  if (algorithm === 'crc16-modbus') return encodeUnsigned(crc16Modbus(payload), 2, byteOrder)
  if (algorithm === 'checksum16') {
    const sum = payload.reduce((total, byte) => (total + byte) & 0xffff, 0)
    return encodeUnsigned(sum, 2, byteOrder)
  }
  if (algorithm === 'checksum8') {
    return Uint8Array.of(payload.reduce((total, byte) => (total + byte) & 0xff, 0))
  }
  return Uint8Array.of(payload.reduce((value, byte) => value ^ byte, 0))
}

function appendChecksum(body: Uint8Array, config: IapProtocolConfig): Uint8Array {
  return concatBytes(
    body,
    calculateChecksum(body, config.checksumAlgorithm, config.checksumByteOrder),
  )
}

export function buildIapAskFrame(image: IapImageInfo, config: IapProtocolConfig): Uint8Array {
  const body = concatBytes(
    hexToBytes(config.frameHeaderHex, 'Frame header'),
    hexToBytes(config.askCommandHex, 'Ask command'),
    encodeUnsigned(image.length, config.fileLengthBytes, config.byteOrder),
    encodeUnsigned(image.packageCount, config.packageCountBytes, config.byteOrder),
    encodeUnsigned(image.remainderLength, config.remainderLengthBytes, config.byteOrder),
  )
  return appendChecksum(body, config)
}

export function buildIapDataFrame(
  firmware: Uint8Array,
  image: IapImageInfo,
  zeroBasedIndex: number,
  config: IapProtocolConfig,
): Uint8Array {
  if (
    !Number.isInteger(zeroBasedIndex) ||
    zeroBasedIndex < 0 ||
    zeroBasedIndex >= image.packageCount
  ) {
    throw new Error('Invalid packet index')
  }
  const start = zeroBasedIndex * image.packageSize
  const end = Math.min(start + image.packageSize, firmware.length)
  const payload = firmware.slice(start, end)
  const isFinalRemainder = zeroBasedIndex === image.fullPackets && image.remainderLength > 0
  const body = concatBytes(
    hexToBytes(config.frameHeaderHex, 'Frame header'),
    hexToBytes(isFinalRemainder ? config.finalCommandHex : config.dataCommandHex, 'Data command'),
    encodeUnsigned(
      zeroBasedIndex + config.packetIndexBase,
      config.packetIndexBytes,
      config.byteOrder,
    ),
    payload,
  )
  return appendChecksum(body, config)
}

export function isValidIapResponseFrame(frame: Uint8Array, config: IapProtocolConfig): boolean {
  const header = hexToBytes(config.frameHeaderHex, 'Frame header')
  if (frame.length < header.length + 1) return false
  for (let i = 0; i < header.length; i++) if (frame[i] !== header[i]) return false

  const commandOffset = header.length
  const askAck = hexToBytes(config.askAckCommandHex, 'Ask ACK command')
  const dataAck = hexToBytes(config.dataAckCommandHex, 'Data ACK command')
  const hasCommand = [askAck, dataAck].some((command) => {
    if (frame.length < commandOffset + command.length) return false
    return command.every((byte, index) => frame[commandOffset + index] === byte)
  })
  if (!hasCommand) return false

  const length = checksumLength(config.checksumAlgorithm)
  if (length === 0) return frame.length === config.responseFrameLength
  if (frame.length <= length) return false
  const body = frame.slice(0, -length)
  const expected = calculateChecksum(body, config.checksumAlgorithm, config.checksumByteOrder)
  const actual = frame.slice(-length)
  return expected.every((byte, index) => byte === actual[index])
}

export function extractIapResponseFrames(
  buffer: number[],
  config: IapProtocolConfig,
): Uint8Array[] {
  const frames: Uint8Array[] = []
  const header = Array.from(hexToBytes(config.frameHeaderHex, 'Frame header'))

  while (buffer.length >= config.responseMinLength) {
    const head = findSequence(buffer, header)
    if (head < 0) {
      buffer.splice(0, buffer.length)
      break
    }
    if (head > 0) buffer.splice(0, head)
    if (buffer.length < config.responseMinLength) break

    let matched: Uint8Array | undefined
    if (config.checksumAlgorithm === 'none') {
      if (buffer.length < config.responseFrameLength) break
      const candidate = Uint8Array.from(buffer.slice(0, config.responseFrameLength))
      if (isValidIapResponseFrame(candidate, config)) matched = candidate
    } else {
      const upper = Math.min(config.responseMaxLength, buffer.length)
      for (let length = config.responseMinLength; length <= upper; length++) {
        const candidate = Uint8Array.from(buffer.slice(0, length))
        if (isValidIapResponseFrame(candidate, config)) {
          matched = candidate
          break
        }
      }
    }

    if (!matched) {
      if (buffer.length > Math.max(1024, config.responseMaxLength * 2)) {
        buffer.splice(0, buffer.length - config.responseMaxLength)
      }
      break
    }
    frames.push(matched)
    buffer.splice(0, matched.length)
  }
  return frames
}

function findSequence(buffer: number[], target: number[]): number {
  outer: for (let i = 0; i <= buffer.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) if (buffer[i + j] !== target[j]) continue outer
    return i
  }
  return -1
}

export function responseCommand(frame: Uint8Array, config: IapProtocolConfig): string {
  const offset = hexToBytes(config.frameHeaderHex).length
  const askLength = hexToBytes(config.askAckCommandHex).length
  const dataLength = hexToBytes(config.dataAckCommandHex).length
  return bytesToHex(frame.slice(offset, offset + Math.max(askLength, dataLength)))
}

export function responsePacketIndex(frame: Uint8Array, config: IapProtocolConfig): number {
  return (
    decodeUnsigned(frame, config.ackIndexOffset, config.ackIndexBytes, config.byteOrder) -
    config.packetIndexBase
  )
}

export function responseStatus(frame: Uint8Array, config: IapProtocolConfig): number {
  if (config.ackStatusOffset < 0 || config.ackStatusOffset >= frame.length) {
    throw new Error('ACK status is outside the response frame')
  }
  return frame[config.ackStatusOffset]
}

export function validateIapProtocolConfig(config: IapProtocolConfig): string[] {
  const errors: string[] = []
  const positive = (value: number, name: string) => {
    if (!Number.isInteger(value) || value <= 0) errors.push(`${name} must be a positive integer`)
  }
  positive(config.baudRate, 'Baud rate')
  positive(config.packageSize, 'Package size')
  positive(config.timeoutMs, 'Timeout')
  if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0) {
    errors.push('Retry count must be a non-negative integer')
  }
  for (const [value, name] of [
    [config.frameHeaderHex, 'Frame header'],
    [config.askCommandHex, 'Ask command'],
    [config.dataCommandHex, 'Data command'],
    [config.finalCommandHex, 'Final command'],
    [config.askAckCommandHex, 'Ask ACK command'],
    [config.dataAckCommandHex, 'Data ACK command'],
  ] as const) {
    try {
      hexToBytes(value, name)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  for (const [value, name] of [
    [config.fileLengthBytes, 'File length width'],
    [config.packageCountBytes, 'Package count width'],
    [config.remainderLengthBytes, 'Remainder width'],
    [config.packetIndexBytes, 'Packet index width'],
    [config.ackIndexBytes, 'ACK index width'],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 6) errors.push(`${name} must be 1-6`)
  }
  if (config.responseMinLength < 2 || config.responseMaxLength < config.responseMinLength) {
    errors.push('Response length range is invalid')
  }
  if (
    config.checksumAlgorithm === 'none' &&
    config.responseFrameLength < config.responseMinLength
  ) {
    errors.push('Fixed response length is invalid')
  }
  return errors
}
