import {
  idleInjectionStatus,
  validateInjectionSettings,
  type DataInjectionSettings,
  type DataInjectionStatus,
} from '../../../src/core/data/DataInjection'
import { createInjectionConnection, type InjectionConnection } from './InjectionConnection'

export interface InjectionTarget {
  id: string
  label: string
  serialPath?: string
  write(data: Uint8Array): Promise<void>
}

export class DataInjectionService {
  private status = idleInjectionStatus()
  private generation = 0
  private settings?: DataInjectionSettings
  private target?: InjectionTarget
  private connection?: InjectionConnection
  private retryTimer?: ReturnType<typeof setTimeout>
  private connectTimer?: ReturnType<typeof setTimeout>
  private ggaTimer?: ReturnType<typeof setInterval>
  private statsTimer?: ReturnType<typeof setTimeout>
  private queue: Uint8Array[] = []
  private queuedBytes = 0
  private draining = false
  private ggaPending = ''
  private latestGga = ''

  public constructor(
    private readonly getTarget: () => InjectionTarget | undefined,
    private readonly onStatus: (status: DataInjectionStatus) => void = () => undefined,
    private readonly createConnection = createInjectionConnection,
    private readonly retryDelayMs = 5000,
    private readonly maxQueuedBytes = 1024 * 1024,
  ) {}

  public getStatus(): DataInjectionStatus {
    return { ...this.status }
  }

  public async start(settings: DataInjectionSettings): Promise<DataInjectionStatus> {
    const validation = validateInjectionSettings(settings)
    if (validation) throw new Error(validation)
    const target = this.getTarget()
    if (!target)
      throw new Error('Connect Data source A to a serial port or network before starting injection')
    if (
      settings.source === 'serial' &&
      target.serialPath?.toLowerCase() === settings.serial.path.trim().toLowerCase()
    )
      throw new Error('The injection serial port must differ from Data source A')
    const stopping = this.stop()
    const stoppedGeneration = this.generation
    await stopping
    if (stoppedGeneration !== this.generation) return this.getStatus()
    const generation = ++this.generation
    this.settings = structuredClone(settings)
    this.target = target
    this.status = { ...idleInjectionStatus(), state: 'connecting', target: target.label }
    this.publish()
    try {
      await this.connect(generation)
    } catch (error) {
      if (generation === this.generation) await this.fail(error)
      throw error
    }
    return this.getStatus()
  }

  public async stop(): Promise<DataInjectionStatus> {
    ++this.generation
    clearTimeout(this.retryTimer)
    clearTimeout(this.connectTimer)
    clearTimeout(this.statsTimer)
    clearInterval(this.ggaTimer)
    this.retryTimer = this.connectTimer = this.statsTimer = undefined
    this.ggaTimer = undefined
    const connection = this.connection
    this.connection = undefined
    this.settings = undefined
    this.target = undefined
    this.queue = []
    this.queuedBytes = 0
    this.draining = false
    this.ggaPending = this.latestGga = ''
    this.status = { ...this.status, state: 'idle', error: undefined }
    this.publish()
    await connection?.close()
    return this.getStatus()
  }

  /** Extract complete, checksum-valid GGA sentences from A, independently of its display parser. */
  public receivePrimary(data: Uint8Array): void {
    if (
      !this.settings ||
      this.settings.source !== 'network' ||
      this.settings.network.protocol !== 'ntrip' ||
      !this.settings.network.sendGga
    )
      return
    this.ggaPending += Buffer.from(data).toString('ascii')
    const lines = this.ggaPending.split('\n')
    this.ggaPending = (lines.pop() ?? '').slice(-4096)
    for (const line of lines) {
      const match = line.match(/\$[A-Z]{2}GGA,([^\r\n$]*)\*([\da-f]{2})\r?$/i)
      if (!match) continue
      const sentence = match[0].trim()
      let checksum = 0
      for (let index = 1; index < sentence.indexOf('*'); index++)
        checksum ^= sentence.charCodeAt(index)
      if (checksum !== Number.parseInt(match[2], 16)) continue
      this.latestGga = `${sentence}\r\n`
    }
  }

  private async connect(generation: number): Promise<void> {
    if (generation !== this.generation || !this.settings) return
    const connection = this.createConnection(this.settings)
    this.connection = connection
    let timedOut = false
    const timeout = new Promise<never>((_resolve, reject) => {
      this.connectTimer = setTimeout(() => {
        timedOut = true
        void connection.close()
        reject(new Error('Injection connection timed out'))
      }, 10000)
    })
    try {
      await Promise.race([
        connection.open(
          (data) => {
            if (generation === this.generation) this.enqueue(data, generation)
          },
          (reason) => {
            if (generation === this.generation && this.status.state === 'connected')
              void this.disconnected(reason, generation)
          },
        ),
        timeout,
      ])
      if (timedOut) throw new Error('Injection connection timed out')
      if (generation !== this.generation) {
        await connection.close()
        return
      }
      this.status.state = 'connected'
      this.status.error = undefined
      this.publish()
      if (
        this.settings?.source === 'network' &&
        this.settings.network.protocol === 'ntrip' &&
        this.settings.network.sendGga
      ) {
        this.ggaTimer = setInterval(() => {
          void this.sendGga(generation)
        }, this.settings.network.ggaInterval * 1000)
      }
    } finally {
      if (generation === this.generation) {
        clearTimeout(this.connectTimer)
        this.connectTimer = undefined
      }
    }
  }

  private enqueue(data: Uint8Array, generation: number): void {
    if (data.length === 0) return
    this.status.receivedBytes += data.length
    if (this.queuedBytes + data.length > this.maxQueuedBytes) {
      void this.fail(new Error('Injection output is too slow; forwarding buffer limit exceeded'))
      return
    }
    this.queue.push(Buffer.from(data))
    this.queuedBytes += data.length
    if (!this.draining) void this.drain(generation)
  }

  private async drain(generation: number): Promise<void> {
    this.draining = true
    try {
      while (generation === this.generation && this.queue.length) {
        const data = this.queue.shift()!
        if (!this.target || this.getTarget()?.id !== this.target.id)
          throw new Error('Data source A disconnected or changed; injection stopped')
        await this.target.write(data)
        if (generation !== this.generation) return
        this.queuedBytes -= data.length
        this.status.forwardedBytes += data.length
        this.scheduleStats()
      }
    } catch (error) {
      if (generation === this.generation) await this.fail(error)
    } finally {
      if (generation === this.generation) this.draining = false
    }
  }

  private async sendGga(generation: number): Promise<void> {
    if (generation !== this.generation || this.status.state !== 'connected' || !this.latestGga)
      return
    if (this.getTarget()?.id !== this.target?.id) {
      await this.fail(new Error('Data source A disconnected or changed; injection stopped'))
      return
    }
    try {
      await this.connection?.send(Buffer.from(this.latestGga))
      if (generation !== this.generation) return
      ++this.status.ggaSent
      this.scheduleStats()
    } catch (error) {
      if (generation === this.generation)
        await this.disconnected(error instanceof Error ? error.message : String(error), generation)
    }
  }

  private async disconnected(reason: string, generation: number): Promise<void> {
    if (this.status.state === 'reconnecting') return
    this.status.state = 'reconnecting'
    clearInterval(this.ggaTimer)
    this.ggaTimer = undefined
    await this.connection?.close()
    if (generation !== this.generation) return
    if (!this.settings?.autoReconnect) {
      await this.fail(new Error(reason))
      return
    }
    this.status.state = 'reconnecting'
    this.status.error = reason
    this.publish()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      if (generation !== this.generation) return
      if (this.getTarget()?.id !== this.target?.id) {
        void this.fail(new Error('Data source A disconnected or changed; injection stopped'))
        return
      }
      void this.connect(generation).catch((error: unknown) => {
        if (generation === this.generation) {
          this.status.state = 'connecting'
          void this.disconnected(error instanceof Error ? error.message : String(error), generation)
        }
      })
    }, this.retryDelayMs)
  }

  private async fail(error: unknown): Promise<void> {
    const stopping = this.stop()
    const generation = this.generation
    await stopping
    if (generation !== this.generation) return
    this.status.state = 'error'
    this.status.error = error instanceof Error ? error.message : String(error)
    this.publish()
  }

  private scheduleStats(): void {
    if (this.statsTimer) return
    this.statsTimer = setTimeout(() => {
      this.statsTimer = undefined
      this.publish()
    }, 250)
  }

  private publish(): void {
    this.onStatus(this.getStatus())
  }
}
