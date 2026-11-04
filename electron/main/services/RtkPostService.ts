import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as readline from 'node:readline'
import type { WebContents } from 'electron'
import {
  buildRtkPostArgs,
  RtkPostSolutionParser,
  type RtkPostRunRequest,
  type RtkPostRunResult,
  type RtkPostSolutionSummary,
} from '../../../src/core/gnsslib/RtkPost'

const MAX_LOG_CHARS = 200_000

interface RtkPostJob {
  runId: string
  child: ChildProcessWithoutNullStreams
  cancelled: boolean
}

export class RtkPostService {
  private readonly jobs = new Map<number, RtkPostJob>()

  public constructor(private readonly spawnProcess: typeof spawn = spawn) {}

  public async run(sender: WebContents, rawRequest: RtkPostRunRequest): Promise<RtkPostRunResult> {
    if (this.jobs.has(sender.id)) throw new Error('当前窗口已有 RTKPOST 任务正在运行')
    if (!rawRequest || typeof rawRequest !== 'object') throw new Error('RTKPOST 请求无效')
    if (typeof rawRequest.runId !== 'string' || !/^[\w-]{1,80}$/.test(rawRequest.runId)) {
      throw new Error('RTKPOST 任务标识无效')
    }

    const request = normalizePaths(rawRequest)
    const args = buildRtkPostArgs(request)
    await this.validateFiles(request)
    const executable =
      request.executablePath || (process.platform === 'win32' ? 'rnx2rtkp.exe' : 'rnx2rtkp')

    return new Promise<RtkPostRunResult>((resolve) => {
      const child = this.spawnProcess(executable, args, {
        cwd: path.dirname(request.outputPath),
        windowsHide: true,
        shell: false,
      })
      const job: RtkPostJob = { runId: request.runId, child, cancelled: false }
      this.jobs.set(sender.id, job)
      const onDestroyed = (): void => {
        this.cancel(sender.id, request.runId)
      }
      sender.once('destroyed', onDestroyed)

      let log = ''
      let settled = false
      const appendLog = (chunk: string): void => {
        if (!chunk) return
        log = (log + chunk).slice(-MAX_LOG_CHARS)
        if (!sender.isDestroyed()) {
          sender.send('rtkpost-log', { runId: request.runId, chunk })
        }
      }
      const finish = async (code: number | null, spawnError?: Error): Promise<void> => {
        if (settled) return
        settled = true
        this.jobs.delete(sender.id)
        sender.removeListener('destroyed', onDestroyed)
        const cancelled = job.cancelled
        let solution: RtkPostSolutionSummary | undefined
        let error = spawnError?.message
        if (code === 0 && !cancelled && !spawnError) {
          try {
            solution = await inspectSolution(request.outputPath, request)
          } catch (inspectError) {
            appendLog(
              `\n解决方案已生成，但结果预览读取失败: ${
                inspectError instanceof Error ? inspectError.message : String(inspectError)
              }\n`,
            )
          }
        } else if (!cancelled && !error) {
          error = `rnx2rtkp 执行失败（退出码 ${code ?? '未知'}）`
        }
        resolve({
          ok: code === 0 && !cancelled && !spawnError,
          cancelled,
          exitCode: code,
          outputPath: request.outputPath,
          log: log.slice(-MAX_LOG_CHARS),
          error,
          solution,
        })
      }

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', appendLog)
      child.stderr.on('data', appendLog)
      child.on('error', (error) => {
        appendLog(`\n无法启动 rnx2rtkp: ${error.message}\n`)
        void finish(null, error)
      })
      child.on('close', (code) => {
        void finish(code)
      })
    })
  }

  public cancel(senderId: number, runId: string): boolean {
    const job = this.jobs.get(senderId)
    if (!job || job.runId !== runId) return false
    job.cancelled = true
    job.child.kill()
    return true
  }

  private async validateFiles(request: RtkPostRunRequest): Promise<void> {
    if (request.executablePath) await requireFile(request.executablePath, 'rnx2rtkp 可执行文件')
    const relative = request.options.mode >= 1 && request.options.mode <= 6
    const inputs = [
      request.roverObsPath,
      ...(relative ? [request.baseObsPath] : []),
      ...request.navPaths.filter((item) => item),
    ]
    for (const input of inputs) await requireFile(input, '输入文件')
    if (request.configPath) await requireFile(request.configPath, '配置文件')

    const protectedPaths = new Set(
      [...inputs, request.configPath, request.executablePath]
        .filter((item) => item)
        .map(comparablePath),
    )
    if (protectedPaths.has(comparablePath(request.outputPath))) {
      throw new Error('输出文件不能覆盖输入文件、配置文件或 rnx2rtkp 可执行文件')
    }
    const outputDirectory = path.dirname(request.outputPath)
    const directoryStat = await statOrThrow(outputDirectory, '输出目录')
    if (!directoryStat.isDirectory()) throw new Error(`输出目录无效: ${outputDirectory}`)
    try {
      const outputStat = await fs.stat(request.outputPath)
      if (!outputStat.isFile()) throw new Error(`输出路径不是文件: ${request.outputPath}`)
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error
    }
  }
}

async function inspectSolution(
  outputPath: string,
  request: RtkPostRunRequest,
): Promise<RtkPostSolutionSummary> {
  const stat = await fs.stat(outputPath)
  if (!stat.isFile()) throw new Error('rnx2rtkp 未生成解决方案文件')
  const parser = new RtkPostSolutionParser(request.options.outputFormat, request.options.timeFormat)
  const input = createReadStream(outputPath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of lines) parser.addLine(line)
  } finally {
    lines.close()
    input.destroy()
  }
  return parser.finish(stat.size)
}

function normalizePaths(request: RtkPostRunRequest): RtkPostRunRequest {
  const absolute = (value: string): string => path.resolve(value.trim())
  return {
    ...request,
    executablePath: request.executablePath?.trim() ? absolute(request.executablePath) : '',
    roverObsPath: absolute(request.roverObsPath),
    baseObsPath: request.baseObsPath?.trim() ? absolute(request.baseObsPath) : '',
    navPaths: Array.isArray(request.navPaths)
      ? request.navPaths.filter((item) => typeof item === 'string' && item.trim()).map(absolute)
      : request.navPaths,
    configPath: request.configPath?.trim() ? absolute(request.configPath) : '',
    outputPath: absolute(request.outputPath),
  }
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
