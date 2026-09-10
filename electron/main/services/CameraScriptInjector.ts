import fs from 'node:fs'
import path from 'node:path'
import { Client, type ClientChannel } from 'ssh2'

export interface CameraScriptRequest {
  host: string
  port: number
  username: string
  password: string
  /** 本地 .sh 脚本绝对路径 */
  localPath: string
  /** 运行时限（秒，1~600） */
  timeoutS: number
}

export type CameraScriptEvent =
  | { type: 'state'; state: 'uploading' | 'running' | 'success' | 'error' | 'stopped'; detail: string }
  | { type: 'output'; text: string }

const REMOTE_NAME_PREFIX = 'navtools_script_'
const MAX_OUTPUT_BUFFER = 4_000_000

/**
 * 相机脚本注入：把本地 shell 脚本经 SFTP 上传到相机板 /tmp，
 * 以 `timeout` 限时执行并回传输出；结束后删除远端脚本，不留残留。
 * 连接信息与测量通道一致（同一台相机），但使用独立 SSH 连接，可与观测并行。
 */
export class CameraScriptInjector {
  private client: Client | undefined
  private stream: ClientChannel | undefined
  private remotePath = ''
  private stopping = false
  private running = false

  public isActive(): boolean {
    return this.running
  }

  public async run(request: CameraScriptRequest, emit: (event: CameraScriptEvent) => void): Promise<void> {
    if (this.running) throw new Error('已有脚本正在执行，请先停止')
    if (!request.localPath.toLowerCase().endsWith('.sh')) throw new Error('当前仅支持 .sh 脚本')
    const stat = await fs.promises.stat(request.localPath).catch(() => undefined)
    if (!stat?.isFile()) throw new Error('本地脚本文件不存在')

    this.running = true
    this.stopping = false
    this.remotePath = `${REMOTE_NAME_PREFIX}${Date.now()}_${path.basename(request.localPath)}`
    const client = new Client()
    this.client = client

    try {
      await this.connect(request)
      emit({ type: 'state', state: 'uploading', detail: `上传 ${path.basename(request.localPath)} → ${this.remotePath}` })
      await this.upload(request.localPath, this.remotePath)

      const exitCode = await this.execStream(
        `chmod +x '${this.remotePath}' && timeout -k 2 ${request.timeoutS} bash '${this.remotePath}'; echo "__EXIT:$?"`,
        (text) => emit({ type: 'output', text }),
      )

      if (this.stopping) {
        emit({ type: 'state', state: 'stopped', detail: '脚本执行已停止' })
      } else if (exitCode === 0) {
        emit({ type: 'state', state: 'success', detail: '脚本执行完成（退出码 0）' })
      } else {
        emit({ type: 'state', state: 'error', detail: `脚本退出码 ${exitCode}` })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emit({ type: 'state', state: this.stopping ? 'stopped' : 'error', detail: message })
      if (!this.stopping) throw error
    } finally {
      await this.cleanupRemote().catch(() => undefined)
      this.client.end()
      this.client = undefined
      this.stream = undefined
      this.running = false
    }
  }

  /** 停止执行：断开采样流并向远端 bash 发送 SIGTERM */
  public stop(): void {
    if (!this.running) return
    this.stopping = true
    this.stream?.close()
    void this.execOnce(`pkill -f '${REMOTE_NAME_PREFIX}' 2>/dev/null || true`)
  }

  private connect(request: CameraScriptRequest): Promise<void> {
    const client = this.client!
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SSH 连接超时')), 8_000)
      client
        .once('ready', () => { clearTimeout(timer); resolve() })
        .once('error', (error: Error) => { clearTimeout(timer); reject(new Error(`SSH 连接失败：${error.message}`)) })
        .connect({
          host: request.host,
          port: request.port,
          username: request.username,
          password: request.password,
          readyTimeout: 8_000,
        })
    })
  }

  private upload(localPath: string, remotePath: string): Promise<void> {
    const client = this.client!
    return new Promise((resolve, reject) => {
      client.sftp((error, sftp) => {
        if (error) { reject(new Error(`SFTP 不可用：${error.message}`)); return }
        sftp.fastPut(localPath, remotePath, (uploadError) => {
          if (uploadError) reject(new Error(`脚本上传失败：${uploadError.message}`))
          else resolve()
        })
      })
    })
  }

  /** 执行命令并流式回传输出；从输出行中解析 __EXIT 标记返回退出码 */
  private execStream(command: string, onOutput: (text: string) => void): Promise<number> {
    const client = this.client!
    return new Promise((resolve) => {
      client.exec(command, (error, stream) => {
        if (error) { onOutput(`\n[执行失败] ${error.message}\n`); resolve(-1); return }
        this.stream = stream
        let buffer = ''
        let exitCode: number | undefined
        const handle = (chunk: Buffer) => {
          buffer = (buffer + chunk.toString('utf8')).slice(-MAX_OUTPUT_BUFFER)
          let newline = buffer.indexOf('\n')
          while (newline >= 0) {
            let line = buffer.slice(0, newline + 1)
            buffer = buffer.slice(newline + 1)
            const marker = /__EXIT:(\d+)/.exec(line)
            if (marker) {
              exitCode = Number.parseInt(marker[1], 10)
              line = line.replace(/__EXIT:\d+/, '').trimEnd() + '\n'
              if (line === '\n') { newline = buffer.indexOf('\n'); continue }
            }
            onOutput(line)
            newline = buffer.indexOf('\n')
          }
        }
        stream.on('data', handle)
        stream.stderr?.on('data', handle)
        stream.on('close', () => {
          this.stream = undefined
          if (exitCode === undefined) {
            const marker = /__EXIT:(\d+)/.exec(buffer)
            if (marker) exitCode = Number.parseInt(marker[1], 10)
          }
          const rest = buffer.replace(/__EXIT:\d+/, '')
          if (rest) onOutput(rest)
          resolve(exitCode ?? (this.stopping ? 0 : -1))
        })
      })
    })
  }

  private execOnce(command: string): Promise<string> {
    const client = this.client
    return new Promise((resolve) => {
      if (!client) { resolve(''); return }
      client.exec(command, (error, stream) => {
        if (error) { resolve(''); return }
        let output = ''
        stream.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
        stream.on('close', () => resolve(output))
      })
    })
  }

  /** 结束后删除远端脚本（尽力而为） */
  private async cleanupRemote(): Promise<void> {
    const remotePath = this.remotePath
    if (!remotePath) return
    await this.execOnce(`rm -f '${remotePath}'`)
    this.remotePath = ''
  }
}
