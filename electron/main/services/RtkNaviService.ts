import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createReadStream, watchFile, unwatchFile } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { WebContents } from 'electron'
import {
  buildRtkNaviConfig,
  parseRtkNaviSolutionLine,
  type RtkNaviRunState,
  type RtkNaviSolution,
  type RtkNaviStartRequest,
  type RtkNaviStatus,
} from '../../../src/core/gnsslib/RtkNavi'

interface RtkNaviJob {
  runId: string
  child: ChildProcessWithoutNullStreams
  runDirectory: string
  outputPath: string
  state: RtkNaviRunState
  finished: boolean
  stopping: boolean
  epochs: number
  qualityCounts: Record<number, number>
  latestSolution?: RtkNaviSolution
  unwatch?: () => void
  killTimer?: ReturnType<typeof setTimeout>
  stopPromise?: Promise<RtkNaviStatus>
  resolveStop?: (status: RtkNaviStatus) => void
}

export class RtkNaviService {
  private readonly jobs = new Map<number, RtkNaviJob>()

  public constructor(
    private readonly workspace: string,
    private readonly spawnProcess: typeof spawn = spawn,
  ) {}

  public async start(sender: WebContents, rawRequest: RtkNaviStartRequest): Promise<RtkNaviStatus> {
    if (this.jobs.has(sender.id)) throw new Error('当前窗口已有 RTKNAVI 任务正在运行')
    if (!rawRequest || typeof rawRequest !== 'object') throw new Error('RTKNAVI 请求无效')
    if (typeof rawRequest.runId !== 'string' || !/^[\w-]{1,80}$/.test(rawRequest.runId)) {
      throw new Error('RTKNAVI 任务标识无效')
    }
    if (!Array.isArray(rawRequest.inputs) || rawRequest.inputs.length !== 3) {
      throw new Error('RTKNAVI 必须配置三路输入')
    }

    const request = this.normalizePaths(rawRequest)
    const outputPath = request.outputPath || path.join(this.workspace, 'rtknavi-current.pos')
    buildRtkNaviConfig(request, outputPath)
    await this.validateFiles(request, outputPath)
    await fs.mkdir(this.workspace, { recursive: true })
    const runDirectory = await fs.mkdtemp(path.join(this.workspace, 'run-'))
    const configPath = path.join(runDirectory, 'rtkrcv.conf')

    try {
      const baseConfig = request.options.baseConfigPath
        ? await fs.readFile(request.options.baseConfigPath, 'utf8')
        : ''
      const generatedConfig = buildRtkNaviConfig(request, outputPath)
      await fs.writeFile(
        configPath,
        `${baseConfig.trimEnd()}${baseConfig ? '\n' : ''}${generatedConfig}`,
        'utf8',
      )
      await fs.rm(outputPath, { force: true })
      const executable =
        request.executablePath || (process.platform === 'win32' ? 'rtkrcv.exe' : 'rtkrcv')
      const child = this.spawnProcess(executable, ['-nc', '-o', configPath], {
        cwd: runDirectory,
        windowsHide: true,
        shell: false,
      })
      const job: RtkNaviJob = {
        runId: request.runId,
        child,
        runDirectory,
        outputPath,
        state: 'running',
        finished: false,
        stopping: false,
        epochs: 0,
        qualityCounts: {},
      }
      this.jobs.set(sender.id, job)
      const onDestroyed = (): void => {
        void this.stop(sender.id, request.runId)
      }
      sender.once('destroyed', onDestroyed)
      const removeDestroyedListener = (): void => {
        sender.removeListener('destroyed', onDestroyed)
      }

      const appendLog = (chunk: string): void => {
        if (!chunk || sender.isDestroyed()) return
        sender.send('rtknavi-log', { runId: request.runId, chunk })
      }
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', appendLog)
      child.stderr.on('data', appendLog)
      child.stdin.on('error', () => undefined)
      child.on('error', (error) => {
        appendLog(`\n无法启动 rtkrcv: ${error.message}\n`)
        void finish(
          sender,
          job,
          removeDestroyedListener,
          () => this.jobs.delete(sender.id),
          error.message,
        )
      })
      child.on('close', (code) => {
        const error =
          job.stopping || code === 0 ? undefined : `rtkrcv 已退出（退出码 ${code ?? '未知'}）`
        void finish(sender, job, removeDestroyedListener, () => this.jobs.delete(sender.id), error)
      })
      watchSolution(sender, job, appendLog)
      const status = statusOf(job)
      sender.send('rtknavi-status', status)
      return status
    } catch (error) {
      this.jobs.delete(sender.id)
      await fs.rm(runDirectory, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  public async stop(senderId: number, runId?: string): Promise<RtkNaviStatus> {
    const job = this.jobs.get(senderId)
    if (!job || (runId && job.runId !== runId)) return idleStatus()
    if (job.stopPromise) return job.stopPromise
    job.stopping = true
    job.state = 'stopping'
    job.stopPromise = new Promise<RtkNaviStatus>((resolve) => {
      job.resolveStop = resolve
      job.killTimer = setTimeout(() => {
        if (!job.finished) job.child.kill('SIGKILL')
      }, 1500)
      job.killTimer.unref()
      job.child.kill()
    })
    return job.stopPromise
  }

  public status(senderId: number): RtkNaviStatus {
    const job = this.jobs.get(senderId)
    return job ? statusOf(job) : idleStatus()
  }

  private normalizePaths(request: RtkNaviStartRequest): RtkNaviStartRequest {
    return {
      ...request,
      executablePath: request.executablePath?.trim()
        ? path.resolve(request.executablePath.trim())
        : '',
      outputPath: request.outputPath?.trim() ? path.resolve(request.outputPath.trim()) : '',
      inputs: request.inputs.map((stream) => ({
        ...stream,
        path:
          stream.type === 'file' && stream.path.trim()
            ? path.resolve(stream.path.trim())
            : stream.path,
      })),
      options: {
        ...request.options,
        baseConfigPath: request.options.baseConfigPath?.trim()
          ? path.resolve(request.options.baseConfigPath.trim())
          : '',
      },
    }
  }

  private async validateFiles(request: RtkNaviStartRequest, outputPath: string): Promise<void> {
    if (request.executablePath) await requireFile(request.executablePath, 'rtkrcv 可执行文件')
    const protectedPaths: string[] = []
    for (const stream of request.inputs) {
      if (stream.enabled && stream.type === 'file') {
        await requireFile(stream.path, '输入文件')
        protectedPaths.push(stream.path)
      }
    }
    if (request.options.baseConfigPath) {
      await requireFile(request.options.baseConfigPath, '处理配置文件')
      protectedPaths.push(request.options.baseConfigPath)
    }
    if (request.executablePath) protectedPaths.push(request.executablePath)
    if (protectedPaths.some((item) => comparablePath(item) === comparablePath(outputPath))) {
      throw new Error('解决方案输出不能覆盖输入文件、处理配置或 rtkrcv 可执行文件')
    }
    const directory = path.dirname(outputPath)
    const stat = await statOrThrow(directory, '输出目录')
    if (!stat.isDirectory()) throw new Error(`输出目录无效: ${directory}`)
    try {
      const outputStat = await fs.stat(outputPath)
      if (!outputStat.isFile()) throw new Error(`输出路径不是文件: ${outputPath}`)
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error
    }
  }
}

async function finish(
  sender: WebContents,
  job: RtkNaviJob,
  removeDestroyedListener: () => void,
  onFinished: () => void,
  error?: string,
): Promise<void> {
  if (job.finished) return
  job.finished = true
  if (job.killTimer) clearTimeout(job.killTimer)
  job.unwatch?.()
  removeDestroyedListener()
  onFinished()
  job.state = error ? 'error' : 'stopped'
  const status = statusOf(job, error)
  if (!sender.isDestroyed()) sender.send('rtknavi-status', status)
  await fs.rm(job.runDirectory, { recursive: true, force: true }).catch(() => undefined)
  job.resolveStop?.(status)
}

function watchSolution(
  sender: WebContents,
  job: RtkNaviJob,
  appendLog: (chunk: string) => void,
): void {
  let offset = 0
  let remainder = ''
  let reading = false
  const read = async (): Promise<void> => {
    if (reading || job.finished) return
    reading = true
    try {
      const stat = await fs.stat(job.outputPath)
      if (stat.size < offset) {
        offset = 0
        remainder = ''
      }
      if (stat.size === offset) return
      const text = await readRange(job.outputPath, offset, stat.size)
      offset = stat.size
      const parts = (remainder + text).split(/\r\n|\n|\r/)
      remainder = parts.pop() ?? ''
      let latest: RtkNaviSolution | undefined
      for (const line of parts) {
        const solution = parseRtkNaviSolutionLine(line)
        if (!solution) continue
        latest = solution
        job.latestSolution = solution
        job.epochs++
        job.qualityCounts[solution.quality] = (job.qualityCounts[solution.quality] ?? 0) + 1
      }
      if (latest && !job.finished && !sender.isDestroyed()) {
        sender.send('rtknavi-solution', {
          runId: job.runId,
          epochs: job.epochs,
          qualityCounts: { ...job.qualityCounts },
          solution: latest,
        })
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return
      if (!job.finished) {
        appendLog(`\n解决方案读取失败: ${error instanceof Error ? error.message : String(error)}\n`)
      }
    } finally {
      reading = false
    }
  }
  watchFile(job.outputPath, { interval: 400 }, read)
  job.unwatch = () => unwatchFile(job.outputPath, read)
  void read()
}

async function readRange(filePath: string, start: number, end: number): Promise<string> {
  const chunks: Buffer[] = []
  const input = createReadStream(filePath, { start, end: end - 1 })
  try {
    for await (const chunk of input) chunks.push(Buffer.from(chunk))
  } finally {
    input.destroy()
  }
  return Buffer.concat(chunks).toString('utf8')
}

function statusOf(job: RtkNaviJob, error?: string): RtkNaviStatus {
  return {
    runId: job.runId,
    state: job.state,
    outputPath: job.outputPath,
    pid: job.child.pid,
    error,
  }
}

function idleStatus(): RtkNaviStatus {
  return { runId: '', state: 'idle', outputPath: '' }
}

async function requireFile(filePath: string, label: string): Promise<void> {
  const stat = await statOrThrow(filePath, label)
  if (!stat.isFile()) throw new Error(`${label}不是文件: ${filePath}`)
}

async function statOrThrow(filePath: string, label: string): Promise<import('node:fs').Stats> {
  try {
    return await fs.stat(filePath)
  } catch {
    throw new Error(`${label}不存在或不可读: ${filePath}`)
  }
}

function comparablePath(filePath: string): string {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}
