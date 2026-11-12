import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'
import type { WebContents } from 'electron'
import {
  buildRtkPostArgs,
  RtkPostSolutionParser,
  type RtkPostRunRequest,
  type RtkPostRunResult,
  type RtkPostProgress,
  type RtkPostSolutionSummary,
} from '../../../src/core/gnsslib/RtkPost'
import { mergeRtkPostConfig } from '../../../src/core/gnsslib/RtkPostConfig'
import {
  RtkPostLogDecoder,
  RtkPostProgressTracker,
} from '../../../src/core/gnsslib/RtkPostProgress'
import { readRinexObservationSpan } from './RinexObservationSpan'

import { gnssSolverTasks } from './GnssSolverTasks'
const MAX_LOG_CHARS = 200_000

interface RtkPostJob {
  runId: string
  child: ChildProcessWithoutNullStreams
  cancelled: boolean
}

export class RtkPostService {
  private readonly jobs = new Map<number, RtkPostJob>()

  public constructor(private readonly spawnProcess: typeof spawn = spawn) {}

  public async readConfig(filePath: string): Promise<string> {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('配置文件路径为空')
    const absolute = path.resolve(filePath.trim())
    const stat = await statOrThrow(absolute, '配置文件')
    if (!stat.isFile()) throw new Error(`配置文件不是文件: ${absolute}`)
    if (stat.size > 4 * 1024 * 1024) throw new Error('配置文件超过 4 MiB，无法载入')
    return fs.readFile(absolute, 'utf8')
  }

  public async run(sender: WebContents, rawRequest: RtkPostRunRequest): Promise<RtkPostRunResult> {
    const release = gnssSolverTasks.acquire('post', sender.id, rawRequest?.runId)
    try {
      const result = await this.runTask(sender, rawRequest)
      if (!sender.isDestroyed())
        sender.send('rtkpost-finished', { runId: rawRequest.runId, result })
      return result
    } catch (error) {
      if (!sender.isDestroyed())
        sender.send('rtkpost-finished', {
          runId: rawRequest?.runId,
          result: {
            ok: false,
            cancelled: false,
            exitCode: null,
            outputPath: rawRequest?.outputPath ?? '',
            log: '',
            error: error instanceof Error ? error.message : String(error),
          },
        })
      throw error
    } finally {
      release()
    }
  }

  private async runTask(
    sender: WebContents,
    rawRequest: RtkPostRunRequest,
  ): Promise<RtkPostRunResult> {
    if (this.jobs.has(sender.id)) throw new Error('当前窗口已有 RTKPOST 任务正在运行')
    if (!rawRequest || typeof rawRequest !== 'object') throw new Error('RTKPOST 请求无效')
    if (typeof rawRequest.runId !== 'string' || !/^[\w-]{1,80}$/.test(rawRequest.runId)) {
      throw new Error('RTKPOST 任务标识无效')
    }

    const request = normalizePaths(rawRequest)
    buildRtkPostArgs(request)
    const previousOutput = await this.validateFiles(request)
    let cleanup = async (): Promise<void> => undefined
    try {
      const effectiveConfig = await writeEffectiveRtkPostConfig(request)
      cleanup = effectiveConfig.cleanup
      request.configPath = effectiveConfig.path
      const args = buildRtkPostArgs(request)
      // The timeline already supplies both bounds; avoid scanning compressed
      // observations a second time merely to initialize the progress tracker.
      const observationSpan =
        request.options.startTime.trim() && request.options.endTime.trim()
          ? undefined
          : await readRinexObservationSpan(request.roverObsPath).catch(() => undefined)
      const tracker = new RtkPostProgressTracker(observationSpan, request.options)
      const executable =
        request.executablePath || (process.platform === 'win32' ? 'rnx2rtkp.exe' : 'rnx2rtkp')
      if (sender.isDestroyed() || gnssSolverTasks.isCancelled('post', sender.id, request.runId)) {
        return {
          ok: false,
          cancelled: true,
          exitCode: null,
          outputPath: request.outputPath,
          log: '',
        }
      }

      return await new Promise<RtkPostRunResult>((resolve) => {
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
        const decoder = new RtkPostLogDecoder()
        const diagnostics: string[] = []
        const warnings: string[] = []
        let lastProgressAt = 0
        let lastPercentage: number | null | undefined
        let latestProgress: RtkPostProgress | undefined
        const sendProgress = (progress: RtkPostProgress): void => {
          if (!sender.isDestroyed()) {
            sender.send('rtkpost-progress', { runId: request.runId, ...progress })
          }
        }
        sendProgress({ phase: 'preparing', percentage: 0 })
        const appendLog = (chunk: string): void => {
          if (!chunk) return
          log = (log + chunk).slice(-MAX_LOG_CHARS)
          if (!sender.isDestroyed()) {
            sender.send('rtkpost-log', { runId: request.runId, chunk })
          }
        }
        const processLines = (lines: string[]): void => {
          if (!lines.length) return
          const logLines: string[] = []
          for (const line of lines) {
            if (/\b(?:error|fatal)\s*:/i.test(line)) {
              // These optional correction files can be absent while a valid solution is produced.
              const optional =
                /^error\s*:\s*(?:no erp data|no sat ant pcv|no rec ant pcv|no geoid data)\b/i.test(
                  line,
                )
              const messages = optional ? warnings : diagnostics
              if (!messages.includes(line)) {
                messages.push(line.slice(0, 2048))
                if (messages.length > 20) messages.shift()
              }
            }
            const progress = tracker.update(line)
            if (progress) latestProgress = progress
            else logLines.push(line)
            if (
              progress &&
              (progress.percentage !== lastPercentage || Date.now() - lastProgressAt >= 200)
            ) {
              sendProgress(progress)
              lastProgressAt = Date.now()
              lastPercentage = progress.percentage
            }
          }
          if (logLines.length) appendLog(`${logLines.join('\n')}\n`)
        }
        const finish = async (code: number | null, spawnError?: Error): Promise<void> => {
          if (settled) return
          settled = true
          processLines(decoder.flush())
          if (latestProgress) sendProgress(latestProgress)
          let cancelled = job.cancelled
          let solution: RtkPostSolutionSummary | undefined
          let error = spawnError ? `无法启动 rnx2rtkp: ${spawnError.message}` : undefined
          if (!cancelled && !error && diagnostics.length) {
            error = diagnostics.join('\n')
          }
          if (code === 0 && !cancelled && !error) {
            sendProgress({ ...latestProgress, phase: 'validating', percentage: 99 })
            try {
              solution = await inspectSolution(request.outputPath, request, previousOutput)
            } catch (inspectError) {
              error = inspectError instanceof Error ? inspectError.message : String(inspectError)
              if (warnings.length) error += `\n${warnings.join('\n')}`
            }
          } else if (!cancelled && !error) {
            error = `rnx2rtkp 执行失败（退出码 ${code ?? '未知'}）`
          }
          cancelled = job.cancelled
          if (cancelled) {
            solution = undefined
            error = undefined
          }
          if (error && !cancelled) appendLog(`\n${error}\n`)
          this.jobs.delete(sender.id)
          sender.removeListener('destroyed', onDestroyed)
          resolve({
            ok: code === 0 && !cancelled && !error && Boolean(solution),
            cancelled,
            exitCode: code,
            outputPath: request.outputPath,
            log: log.slice(-MAX_LOG_CHARS),
            error,
            solution,
            progress: latestProgress,
            warnings: warnings.length ? warnings : undefined,
          })
        }

        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => processLines(decoder.push('stdout', chunk)))
        child.stderr.on('data', (chunk: string) => processLines(decoder.push('stderr', chunk)))
        child.on('error', (error) => {
          void finish(null, error)
        })
        child.on('close', (code) => {
          void finish(code)
        })
      })
    } finally {
      await cleanup()
    }
  }

  public cancel(senderId: number, runId: string): boolean {
    const pending = gnssSolverTasks.cancel('post', senderId, runId)
    const job = this.jobs.get(senderId)
    if (!job || job.runId !== runId) return Boolean(pending)
    job.cancelled = true
    job.child.kill()
    return true
  }

  private async validateFiles(
    request: RtkPostRunRequest,
  ): Promise<import('node:fs').Stats | undefined> {
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
      return outputStat
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error
    }
  }
}

async function inspectSolution(
  outputPath: string,
  request: RtkPostRunRequest,
  previousOutput: import('node:fs').Stats | undefined,
): Promise<RtkPostSolutionSummary> {
  const stat = await statOrThrow(outputPath, 'rnx2rtkp 输出文件')
  if (!stat.isFile()) throw new Error('rnx2rtkp 未生成解决方案文件')
  if (
    previousOutput &&
    stat.mtimeMs === previousOutput.mtimeMs &&
    stat.ctimeMs === previousOutput.ctimeMs &&
    stat.size === previousOutput.size &&
    stat.ino === previousOutput.ino
  ) {
    throw new Error('rnx2rtkp 未更新输出文件；现有文件是此前的结果。请检查输入数据与处理选项。')
  }
  const parser = new RtkPostSolutionParser(request.options.outputFormat, request.options.timeFormat)
  const input = createReadStream(outputPath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of lines) parser.addLine(line)
  } finally {
    lines.close()
    input.destroy()
  }
  const solution = parser.finish(stat.size)
  if (solution.epochs === 0) {
    throw new Error('输出文件中没有可识别的定位历元，请检查导航文件、观测时间范围与处理选项。')
  }
  return solution
}

async function writeEffectiveRtkPostConfig(
  request: RtkPostRunRequest,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const source =
    request.configContent ??
    (request.configPath ? await fs.readFile(request.configPath, 'utf8') : '')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nav-tools-rtkpost-'))
  const configPath = path.join(directory, 'effective.conf')
  try {
    await fs.writeFile(configPath, mergeRtkPostConfig(source, request.options), 'utf8')
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  return {
    path: configPath,
    cleanup: async () => {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined)
    },
  }
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
