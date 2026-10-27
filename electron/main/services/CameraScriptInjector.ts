import fs from 'node:fs'
import path from 'node:path'
import { Client, type ClientChannel } from 'ssh2'
import {
  analyzeCameraPackages,
  matchCameraPackagePair,
} from '../../../src/core/camera/CameraPackageSelection'
import { CameraPackageDeployer } from './CameraPackageDeployer'

export interface CameraScriptRequest {
  host: string
  port: number
  username: string
  password: string
  localPaths: string[]
  /** 每个脚本的运行时限（秒，1~600） */
  timeoutS: number
}

export type CameraScriptEvent =
  | {
      type: 'state'
      state: 'uploading' | 'running' | 'success' | 'error' | 'stopped'
      detail: string
    }
  | { type: 'output'; text: string }

const REMOTE_NAME_PREFIX = 'navtools_script_'
const MAX_OUTPUT_BUFFER = 4_000_000

/**
 * 相机脚本注入：批量上传脚本到相机板 /tmp 并顺序限时执行，结束后清理。
 * 连接信息与测量通道一致，但使用独立 SSH 连接，可与观测并行。
 */
export class CameraScriptInjector {
  private client: Client | undefined
  private stream: ClientChannel | undefined
  private remotePath = ''
  private stopping = false
  private running = false
  private deploying = false

  public constructor(
    private readonly createClient: () => Client = () => new Client(),
    private readonly packageDeployer: Pick<
      CameraPackageDeployer,
      'run' | 'stop'
    > = new CameraPackageDeployer(),
  ) {}

  public isActive(): boolean {
    return this.running
  }

  public async run(
    request: CameraScriptRequest,
    emit: (event: CameraScriptEvent) => void,
  ): Promise<void> {
    if (this.running) throw new Error('已有脚本正在执行，请先停止')
    this.running = true
    this.stopping = false
    this.remotePath = ''

    try {
      const localPaths = request.localPaths.map((localPath) => localPath.trim())
      if (localPaths.length === 0 || localPaths.some((localPath) => !localPath)) {
        throw new Error('请先选择脚本文件')
      }
      const packages = matchCameraPackagePair(localPaths)
      if (!packages) {
        const { hostPath, lidarPath } = analyzeCameraPackages(localPaths)
        if (hostPath || lidarPath) {
          throw new Error('部署需要同时导入 host 与 lidar 两个功能包')
        }
        if (localPaths.some((localPath) => !localPath.toLowerCase().endsWith('.sh'))) {
          throw new Error('当前仅支持 .sh 脚本')
        }
      }
      for (const localPath of localPaths) {
        const stat = await fs.promises.stat(localPath).catch(() => undefined)
        if (!stat?.isFile()) throw new Error(`本地文件不存在：${path.basename(localPath)}`)
      }

      if (packages) {
        this.deploying = true
        const ignored = localPaths.filter(
          (localPath) => localPath !== packages.hostPath && localPath !== packages.lidarPath,
        )
        if (ignored.length > 0) {
          emit({
            type: 'output',
            text: `[提示] 仅部署 host/lidar 两个功能包，其余 ${ignored.length} 个文件已忽略\n`,
          })
        }
        emit({
          type: 'state',
          state: 'uploading',
          detail: `准备部署 ${path.basename(packages.hostPath)}、${path.basename(packages.lidarPath)}`,
        })
        emit({
          type: 'state',
          state: 'running',
          detail: `部署到 ${request.username}@${request.host}:${request.port}`,
        })
        await this.packageDeployer.run(request, packages, (text) => emit({ type: 'output', text }))
        emit({
          type: 'state',
          state: this.stopping ? 'stopped' : 'success',
          detail: this.stopping ? '部署已停止' : '部署完成（退出码 0）',
        })
        return
      }

      const client = this.createClient()
      this.client = client
      await this.connect(request)
      for (const [index, localPath] of localPaths.entries()) {
        if (this.stopping) break
        const fileName = path.basename(localPath)
        const progress = `(${index + 1}/${localPaths.length})`
        this.remotePath = `/tmp/${REMOTE_NAME_PREFIX}${Date.now()}_${index}`
        emit({
          type: 'state',
          state: 'uploading',
          detail: `上传 ${fileName} → ${this.remotePath} ${progress}`,
        })
        await this.upload(localPath, this.remotePath)
        if (this.stopping) break

        emit({ type: 'state', state: 'running', detail: `执行 ${fileName} ${progress}` })
        const exitCode = await this.execStream(
          `chmod +x '${this.remotePath}' && timeout -k 2 ${request.timeoutS} bash '${this.remotePath}'; echo "__EXIT:$?"`,
          (text) => emit({ type: 'output', text }),
        )
        await this.cleanupRemote().catch(() => undefined)
        if (this.stopping) break
        if (exitCode !== 0) throw new Error(`脚本 ${fileName} 退出码 ${exitCode}`)
      }

      if (this.stopping) {
        emit({ type: 'state', state: 'stopped', detail: '脚本执行已停止' })
      } else {
        emit({
          type: 'state',
          state: 'success',
          detail:
            localPaths.length === 1
              ? '脚本执行完成（退出码 0）'
              : `全部 ${localPaths.length} 个脚本执行完成（退出码 0）`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emit({ type: 'state', state: this.stopping ? 'stopped' : 'error', detail: message })
      if (!this.stopping) throw error
    } finally {
      await this.cleanupRemote().catch(() => undefined)
      this.client?.end()
      this.client = undefined
      this.stream = undefined
      this.deploying = false
      this.running = false
    }
  }

  /** 停止当前脚本或部署，并阻止批次继续执行 */
  public stop(): void {
    if (!this.running) return
    this.stopping = true
    if (this.deploying) {
      this.packageDeployer.stop()
      return
    }
    this.stream?.close()
    void this.execOnce(`pkill -f '${REMOTE_NAME_PREFIX}' 2>/dev/null || true`).catch(() => undefined)
  }

  private connect(request: CameraScriptRequest): Promise<void> {
    const client = this.client!
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SSH 连接超时')), 8_000)
      client
        .once('ready', () => {
          clearTimeout(timer)
          resolve()
        })
        .once('error', (error: Error) => {
          clearTimeout(timer)
          reject(new Error(`SSH 连接失败：${error.message}`))
        })
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
        if (error) {
          reject(new Error(`SFTP 不可用：${error.message}`))
          return
        }
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
        if (error) {
          onOutput(`\n[执行失败] ${error.message}\n`)
          resolve(-1)
          return
        }
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
              if (line === '\n') {
                newline = buffer.indexOf('\n')
                continue
              }
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
      if (!client) {
        resolve('')
        return
      }
      client.exec(command, (error, stream) => {
        if (error) {
          resolve('')
          return
        }
        let output = ''
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString('utf8')
        })
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
