const CALIB_SUCCESS = 'set calibParam successful'
const DEFAULT_RESPONSE_IDLE_MS = 50

/**
 * 相机 8080 是请求—应答协议，但 TCP 只提供字节流，不保留应答边界。
 * 已登记请求的应答按固定成功文本、换行或短暂空闲结束；每个应答都补换行后显示。
 */
export class CameraResponseFramer {
  private readonly requests: string[] = []
  private buffer = ''
  private idleTimer: ReturnType<typeof setTimeout> | undefined

  public constructor(
    private readonly emit: (text: string) => void,
    private readonly idleMs = DEFAULT_RESPONSE_IDLE_MS,
  ) {}

  public request(command: string): void {
    this.requests.push(command)
  }

  /** 写入失败时撤销尚未收到应答的请求，避免污染下一次显示。 */
  public cancelRequest(command: string): void {
    for (let index = this.requests.length - 1; index >= 0; index--) {
      if (this.requests[index] !== command) continue
      this.requests.splice(index, 1)
      if (index === 0) {
        this.buffer = ''
        this.clearIdleTimer()
      }
      return
    }
  }

  public push(chunk: string): void {
    if (!chunk) return
    if (this.requests.length === 0) {
      this.emit(chunk)
      return
    }
    this.buffer += chunk
    this.drain()
    if (this.buffer && this.requests.length > 0) this.armIdleTimer()
  }

  public reset(): void {
    this.requests.length = 0
    this.buffer = ''
    this.clearIdleTimer()
  }

  private drain(): void {
    while (this.buffer && this.requests.length > 0) {
      const end = this.responseEnd(this.buffer)
      if (end === undefined) return
      const response = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end)
      this.requests.shift()
      this.clearIdleTimer()
      this.emit(withLineEnding(response))
    }
    if (this.buffer && this.requests.length === 0) {
      const remainder = this.buffer
      this.buffer = ''
      this.emit(remainder)
    }
  }

  private responseEnd(buffer: string): number | undefined {
    // 两条应答在同一个 TCP 块中粘连时，先切开下一条已知应答的开头。
    const nextCalib = buffer.indexOf(CALIB_SUCCESS, 1)
    if (nextCalib > 0) return nextCalib

    const calib = buffer.indexOf(CALIB_SUCCESS)
    if (calib === 0) {
      let end = CALIB_SUCCESS.length
      if (buffer.slice(end, end + 2) === '\r\n') return end + 2
      if (buffer[end] === '\n' || buffer[end] === '\r') return end + 1
      return end
    }

    const newline = buffer.search(/[\r\n]/)
    return newline >= 0 ? newline + 1 : undefined
  }

  private armIdleTimer(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined
      if (!this.buffer || this.requests.length === 0) return
      // 无换行、无固定结束文本的应答以短暂空闲结束；分片会在每次到达时重置计时。
      const response = this.buffer
      this.buffer = ''
      this.requests.shift()
      this.emit(withLineEnding(response))
    }, this.idleMs)
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer)
    this.idleTimer = undefined
  }
}

function withLineEnding(text: string): string {
  return text.endsWith('\n') || text.endsWith('\r') ? text : `${text}\n`
}
