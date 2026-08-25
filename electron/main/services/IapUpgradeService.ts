import fs from 'node:fs/promises'
import type { WebContents } from 'electron'
import {
  buildIapAskFrame,
  buildIapDataFrame,
  bytesToHex,
  createIapImageInfo,
  extractIapResponseFrames,
  hexToBytes,
  responsePacketIndex,
  responseStatus,
  validateIapProtocolConfig,
  type IapProtocolConfig,
} from '../../../src/core/iap/IapProtocol'
import {
  EMPTY_IAP_SNAPSHOT,
  type IapUpgradeEvent,
  type IapUpgradeRequest,
  type IapUpgradeSnapshot,
} from '../../../src/core/iap/IapUpgrade'
import { SerialPortService, type SerialPortOptions } from './SerialPortService'

class IapTimeoutError extends Error {}
class IapCancelledError extends Error {}

interface PendingFrame {
  predicate(frame: Uint8Array): boolean
  resolve(frame: Uint8Array): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

export class IapUpgradeService {
  private owner: WebContents | undefined
  private request: IapUpgradeRequest | undefined
  private snapshot: IapUpgradeSnapshot = { ...EMPTY_IAP_SNAPSHOT }
  private startedAt = 0
  private responseBuffer: number[] = []
  private responseFrames: Uint8Array[] = []
  private pendingFrame: PendingFrame | undefined
  private fatalError: Error | undefined
  private cancelled = false
  private unsubscribeData: (() => void) | undefined
  private unsubscribeError: (() => void) | undefined
  private unsubscribeDisconnected: (() => void) | undefined

  constructor(private readonly serial: SerialPortService) {}

  public start(owner: WebContents, request: IapUpgradeRequest): IapUpgradeSnapshot {
    if (this.isActive()) throw new Error('已有固件升级正在进行')
    const errors = validateIapProtocolConfig(request.config)
    if (errors.length > 0) throw new Error(errors.join('; '))
    if (!request.filePath) throw new Error('请选择固件文件')
    if (!this.serial.getConnectionInfo()) throw new Error('请先连接串口')

    this.owner = owner
    this.request = { ...request, config: { ...request.config } }
    this.cancelled = false
    this.fatalError = undefined
    this.responseBuffer = []
    this.responseFrames = []
    this.startedAt = Date.now()
    this.snapshot = {
      ...EMPTY_IAP_SNAPSHOT,
      phase: 'preparing',
      fileName: request.fileName,
      protocolName: request.protocolName,
    }
    this.emitState()
    void this.run()
    return { ...this.snapshot }
  }

  public cancel(): void {
    if (!this.isActive()) return
    this.cancelled = true
    const error = new IapCancelledError('升级已取消')
    this.fatalError = error
    this.rejectPending(error)
  }

  public getSnapshot(): IapUpgradeSnapshot {
    return { ...this.snapshot, elapsedMs: this.elapsedMs() }
  }

  public isActive(): boolean {
    return ['preparing', 'asking', 'sending'].includes(this.snapshot.phase)
  }

  private async run(): Promise<void> {
    const request = this.request
    const originalConnection = this.serial.getConnectionInfo()
    if (!request || !originalConnection) return

    this.subscribeToSerial(request.config)
    try {
      const firmware = new Uint8Array(await fs.readFile(request.filePath))
      const image = createIapImageInfo(firmware.length, request.config.packageSize)
      this.snapshot = {
        ...this.snapshot,
        fileSize: firmware.length,
        totalPackets: image.packageCount,
      }
      this.log(`[IAP] 已加载固件: ${request.filePath}`)

      if (originalConnection.baudRate !== request.config.baudRate) {
        await this.serial.updateBaudRate(request.config.baudRate)
        this.log(`[IAP] 已切换波特率到 ${request.config.baudRate}`)
      }
      this.ensureActive()

      this.snapshot.phase = 'asking'
      this.emitState()
      this.log(
        `[IAP] 开始升级，请求设备进入升级模式... 包大小=${request.config.packageSize} 超时=${request.config.timeoutMs}ms`,
      )
      await this.performHandshake(firmware.length, request.config)

      this.snapshot.phase = 'sending'
      this.emitState()
      for (let index = 0; index < image.packageCount; index++) {
        await this.sendPacketWithRetry(firmware, image, index, request.config)
        const acknowledgedBytes = Math.min((index + 1) * image.packageSize, firmware.length)
        this.snapshot.acknowledgedPackets = index + 1
        this.snapshot.progress = Math.round((acknowledgedBytes / firmware.length) * 100)
        this.emitState()
        this.log(`[IAP] 已确认第 ${index + 1}/${image.packageCount} 包`)
      }

      await this.restoreSerial(originalConnection)
      this.snapshot.phase = 'success'
      this.snapshot.progress = 100
      this.emitState()
      this.log(`[IAP] Flash写入成功，升级完成 | ${this.summary()}`)
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      try {
        await this.restoreSerial(originalConnection)
      } catch (restoreError) {
        this.log(`[IAP] 恢复串口失败: ${errorMessage(restoreError)}`)
      }
      this.snapshot.phase =
        failure instanceof IapCancelledError || this.cancelled ? 'cancelled' : 'error'
      this.snapshot.error = failure.message
      this.emitState()
      this.log(`[IAP] ${failure.message} | ${this.summary()}`)
    } finally {
      this.cleanup()
    }
  }

  private async performHandshake(fileSize: number, config: IapProtocolConfig): Promise<void> {
    const image = createIapImageInfo(fileSize, config.packageSize)
    const frame = buildIapAskFrame(image, config)
    // 设备可能处于「进 BootLoader → 等待握手 → 超时重启」的循环中，监听窗口可能只有几秒。
    // 若每个超时周期只发一帧，很容易恰好错过窗口；因此在总预算内以固定间隔持续重发，
    // 与官方烧录工具的行为一致（其日志中能看到设备重复应答握手帧）。
    const totalBudgetMs = config.timeoutMs * (config.maxRetries + 1)
    const resendIntervalMs = Math.min(500, config.timeoutMs)
    const deadline = Date.now() + totalBudgetMs
    this.log('[IAP] 请求升级中...')
    for (;;) {
      this.ensureActive()
      await this.serial.sendBuffer(frame)
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new IapTimeoutError('等待设备应答超时')
      try {
        await this.waitForFrame(
          (candidate) => matchesCommand(candidate, config.askAckCommandHex, config),
          Math.min(resendIntervalMs, remaining),
        )
        this.log('[IAP] 收到握手应答')
        return
      } catch (error) {
        if (!(error instanceof IapTimeoutError)) throw error
        this.snapshot.retryCount++
        this.snapshot.timeoutRetryCount++
        this.emitState()
        if (deadline - Date.now() <= 0) throw new IapTimeoutError('等待设备应答超时')
      }
    }
  }

  private async sendPacketWithRetry(
    firmware: Uint8Array,
    image: ReturnType<typeof createIapImageInfo>,
    index: number,
    config: IapProtocolConfig,
  ): Promise<void> {
    const frame = buildIapDataFrame(firmware, image, index, config)
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      this.ensureActive()
      if (attempt > 0) this.snapshot.retryCount++
      await this.serial.sendBuffer(frame)
      this.snapshot.sentPackets++
      this.emitState()

      try {
        const ack = await this.waitForFrame(
          (candidate) =>
            matchesCommand(candidate, config.dataAckCommandHex, config) &&
            safePacketIndex(candidate, config) === index,
          config.timeoutMs,
        )
        const status = responseStatus(ack, config)
        if (status === config.ackSuccessValue) return
        this.snapshot.ackErrorCount++
        this.emitState()
        if (attempt >= config.maxRetries) {
          throw new Error(`第 ${index + 1} 包被设备拒绝，状态=${status}`)
        }
        const kind = status === config.ackRetryValue ? '数据错误' : `未知ACK状态 ${status}`
        this.log(`[IAP] ${kind}，重发第 ${index + 1} 包 (${attempt + 1}/${config.maxRetries})`)
      } catch (error) {
        if (!(error instanceof IapTimeoutError)) throw error
        this.snapshot.timeoutRetryCount++
        this.emitState()
        if (attempt >= config.maxRetries) {
          throw new Error(`等待第 ${index + 1} 包应答超时`)
        }
        this.log(`[IAP] 等待应答超时，重发第 ${index + 1} 包 (${attempt + 1}/${config.maxRetries})`)
      }
    }
  }

  private subscribeToSerial(config: IapProtocolConfig): void {
    this.unsubscribeData = this.serial.onRawData((data) => {
      this.responseBuffer.push(...data)
      for (const frame of extractIapResponseFrames(this.responseBuffer, config)) {
        this.log(
          `[IAP RX] ${
            bytesToHex(frame)
              .match(/.{1,2}/g)
              ?.join(' ') ?? ''
          }`,
        )
        if (this.pendingFrame?.predicate(frame)) {
          const pending = this.pendingFrame
          this.pendingFrame = undefined
          clearTimeout(pending.timer)
          pending.resolve(frame)
        } else {
          this.responseFrames.push(frame)
        }
      }
    })
    this.unsubscribeError = this.serial.onError((error) => this.failNow(error))
    this.unsubscribeDisconnected = this.serial.onDisconnected(() =>
      this.failNow(new Error('串口已关闭，升级中止')),
    )
  }

  private waitForFrame(
    predicate: (frame: Uint8Array) => boolean,
    timeoutMs: number,
  ): Promise<Uint8Array> {
    this.ensureActive()
    const existing = this.responseFrames.findIndex(predicate)
    if (existing >= 0) return Promise.resolve(this.responseFrames.splice(existing, 1)[0])
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingFrame?.timer === timer) this.pendingFrame = undefined
        reject(new IapTimeoutError('等待设备应答超时'))
      }, timeoutMs)
      this.pendingFrame = { predicate, resolve, reject, timer }
    })
  }

  private failNow(error: Error): void {
    if (!this.isActive()) return
    this.fatalError = error
    this.rejectPending(error)
  }

  private rejectPending(error: Error): void {
    if (!this.pendingFrame) return
    const pending = this.pendingFrame
    this.pendingFrame = undefined
    clearTimeout(pending.timer)
    pending.reject(error)
  }

  private ensureActive(): void {
    if (this.fatalError) throw this.fatalError
    if (this.cancelled) throw new IapCancelledError('升级已取消')
  }

  private async restoreSerial(original: SerialPortOptions): Promise<void> {
    await this.serial.restoreConnection(original)
    this.log(`[IAP] 已恢复串口波特率 ${original.baudRate}`)
  }

  private emitState(): void {
    this.snapshot.elapsedMs = this.elapsedMs()
    this.emit({ type: 'state', snapshot: { ...this.snapshot } })
  }

  private log(message: string): void {
    this.emit({ type: 'log', message, timestamp: Date.now() })
  }

  private emit(event: IapUpgradeEvent): void {
    if (this.owner && !this.owner.isDestroyed()) this.owner.send('iap-upgrade-event', event)
  }

  private elapsedMs(): number {
    return this.startedAt > 0 ? Math.max(0, Date.now() - this.startedAt) : 0
  }

  private summary(): string {
    return `成功包数=${this.snapshot.acknowledgedPackets} 发送总包=${this.snapshot.sentPackets} 重发=${this.snapshot.retryCount}(ACK错=${this.snapshot.ackErrorCount},超时=${this.snapshot.timeoutRetryCount}) 耗时=${(this.elapsedMs() / 1000).toFixed(2)}s`
  }

  private cleanup(): void {
    this.rejectPending(new Error('IAP session closed'))
    this.unsubscribeData?.()
    this.unsubscribeError?.()
    this.unsubscribeDisconnected?.()
    this.unsubscribeData = undefined
    this.unsubscribeError = undefined
    this.unsubscribeDisconnected = undefined
    this.owner = undefined
    this.request = undefined
    this.fatalError = undefined
    this.cancelled = false
    this.responseBuffer = []
    this.responseFrames = []
  }
}

function matchesCommand(frame: Uint8Array, commandHex: string, config: IapProtocolConfig): boolean {
  const offset = hexToBytes(config.frameHeaderHex).length
  const command = hexToBytes(commandHex)
  return command.every((byte, index) => frame[offset + index] === byte)
}

function safePacketIndex(frame: Uint8Array, config: IapProtocolConfig): number {
  try {
    return responsePacketIndex(frame, config)
  } catch {
    return -1
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
