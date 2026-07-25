import net from 'node:net'

export const CAMERA_COMMAND_PREFIX = 0xabcd1234
export const CAMERA_LOGIN_COMMAND = 0x00000001

export type CameraContentFormat = 'text' | 'hex'

export interface CameraCommandRequest {
  host: string
  port: number
  subCommand: string
  content: string
  contentFormat: CameraContentFormat
}

export interface EncodedCameraCommand {
  packet: Buffer
  subCommandHex: string
  contentHex: string
  contentBytes: number
  dataLength: number
}

export interface CameraCommandResult {
  response: string
  responseHex: string
  packetHex: string
  subCommandHex: string
  contentHex: string
  contentBytes: number
  dataLength: number
}

const SUB_COMMAND_BYTES = 16
const HEADER_BYTES = 10
const MAX_RESPONSE_BYTES = 1024

function toHex(buffer: Buffer): string {
  return buffer.toString('hex').toUpperCase()
}

function encodeHexContent(value: string): Buffer {
  const compact = value.replace(/\s/g, '')
  if (!compact || compact.length % 2 !== 0 || !/^[\da-fA-F]+$/.test(compact)) {
    throw new Error('十六进制内容必须由完整的字节组成，例如 06 或 A1 B2 00 3C')
  }
  return Buffer.from(compact, 'hex')
}

export function encodeCameraCommand(request: CameraCommandRequest): EncodedCameraCommand {
  const subCommandValue = request.subCommand.trim()
  if (!subCommandValue) throw new Error('子命令不能为空')
  if (!request.content) throw new Error('子命令内容不能为空')
  if (request.contentFormat !== 'text' && request.contentFormat !== 'hex') {
    throw new Error('不支持的内容格式')
  }

  const subCommand = Buffer.alloc(SUB_COMMAND_BYTES)
  Buffer.from(subCommandValue, 'utf8').copy(subCommand, 0, 0, SUB_COMMAND_BYTES)
  const content =
    request.contentFormat === 'hex'
      ? encodeHexContent(request.content)
      : Buffer.from(request.content, 'utf8')
  const dataLength = subCommand.length + content.length

  if (dataLength > 0xffff) throw new Error('命令内容过长，最大数据长度为 65535 字节')

  const packet = Buffer.alloc(HEADER_BYTES + dataLength)
  packet.writeUInt32LE(CAMERA_COMMAND_PREFIX, 0)
  packet.writeUInt32LE(CAMERA_LOGIN_COMMAND, 4)
  packet.writeUInt16LE(dataLength, 8)
  subCommand.copy(packet, HEADER_BYTES)
  content.copy(packet, HEADER_BYTES + SUB_COMMAND_BYTES)

  return {
    packet,
    subCommandHex: toHex(subCommand),
    contentHex: toHex(content),
    contentBytes: content.length,
    dataLength,
  }
}

export class CameraCommandService {
  public constructor(private readonly timeoutMs = 5000) {}

  public async send(request: CameraCommandRequest): Promise<CameraCommandResult> {
    const host = request.host.trim()
    if (!host) throw new Error('服务器地址不能为空')
    if (!Number.isInteger(request.port) || request.port < 1 || request.port > 65535) {
      throw new Error('端口必须是 1 到 65535 之间的整数')
    }

    const encoded = encodeCameraCommand(request)
    const response = await this.exchange(host, request.port, encoded.packet)

    return {
      response: response.toString('utf8'),
      responseHex: toHex(response),
      packetHex: toHex(encoded.packet),
      subCommandHex: encoded.subCommandHex,
      contentHex: encoded.contentHex,
      contentBytes: encoded.contentBytes,
      dataLength: encoded.dataLength,
    }
  }

  private exchange(host: string, port: number, packet: Buffer): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const socket = net.createConnection({ host, port })
      let settled = false

      const finish = (error?: Error, response = Buffer.alloc(0)) => {
        if (settled) return
        settled = true
        socket.destroy()
        if (error) reject(error)
        else resolve(response)
      }

      socket.setTimeout(this.timeoutMs)
      socket.once('connect', () => {
        socket.write(packet, (error) => {
          if (error) finish(error)
        })
      })
      socket.once('data', (data) => finish(undefined, data.subarray(0, MAX_RESPONSE_BYTES)))
      socket.once('end', () => finish())
      socket.once('timeout', () => finish(new Error(`连接或响应超时（${this.timeoutMs} ms）`)))
      socket.once('error', (error) => finish(error))
    })
  }
}
