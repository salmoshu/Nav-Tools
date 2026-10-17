import { execFile, spawn as spawnProcess } from 'node:child_process'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import { promisify } from 'node:util'
import { spawn, type IPty } from 'node-pty'
import { Client } from 'ssh2'
import {
  createTerminalId,
  type PortForwardRule,
  type PortForwardStatusEvent,
} from '../../../src/core/terminal/TerminalTypes'
import { SshPortForwardService } from './SshPortForwardService'

const execFileAsync = promisify(execFile)

type TerminalFileSystem = Pick<
  typeof fs,
  | 'access'
  | 'copyFile'
  | 'mkdir'
  | 'open'
  | 'readFile'
  | 'readdir'
  | 'rename'
  | 'rm'
  | 'stat'
  | 'writeFile'
> & {
  existsSync: typeof existsSync
  statSync: typeof statSync
}

export interface TerminalPortForwarder {
  startEnabled(rules: PortForwardRule[]): Promise<void>
  start(rule: PortForwardRule): Promise<void>
  stop(ruleId: string): Promise<void>
  stopAll(): Promise<void>
}

type TerminalPortForwarderFactory = (
  client: Client,
  connectionId: string,
  emit: (event: PortForwardStatusEvent) => void,
) => TerminalPortForwarder

export interface TerminalServiceHost {
  readonly platform: typeof process.platform
  readonly environment: typeof process.env
  readonly fileSystem: TerminalFileSystem
  homedir(): string
  username(): string
  now(): number
  createId(prefix: string): string
  executeFile(
    executable: string,
    args: string[],
    options?: { windowsHide?: boolean; maxBuffer?: number },
  ): Promise<Buffer>
  /** 把子进程 stdout 流式写入文件:大输出(如 WSL tar 打包)规避 execFile 的 maxBuffer 上限 */
  pipeOutputToFile(executable: string, args: string[], destPath: string): Promise<void>
  spawnPty: typeof spawn
  createSshClient(): Client
  createPortForwarder: TerminalPortForwarderFactory
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimeout(timeout: ReturnType<typeof setTimeout>): void
}

/** Electron 组合根使用的 Node/PTY/SSH 生产适配器。 */
export function createNodeTerminalServiceHost(): TerminalServiceHost {
  return {
    platform: process.platform,
    environment: process.env,
    fileSystem: {
      access: fs.access,
      mkdir: fs.mkdir,
      open: fs.open,
      readFile: fs.readFile,
      readdir: fs.readdir,
      rename: fs.rename,
      stat: fs.stat,
      writeFile: fs.writeFile,
      copyFile: fs.copyFile,
      rm: fs.rm,
      existsSync,
      statSync,
    },
    homedir: () => os.homedir(),
    username: () => os.userInfo().username,
    now: () => Date.now(),
    createId: (prefix) => createTerminalId(prefix),
    executeFile: async (executable, args, options = {}) => {
      const result = await execFileAsync(executable, args, {
        ...options,
        encoding: 'buffer',
      })
      return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout)
    },
    pipeOutputToFile: (executable, args, destPath) =>
      new Promise<void>((resolve, reject) => {
        const child = spawnProcess(executable, args, { windowsHide: true })
        const output = createWriteStream(destPath)
        let stderr = ''
        child.stderr.on('data', (chunk: Buffer) => {
          // stderr 仅用于拼报错信息,截断保留尾部,防止异常进程刷屏撑爆内存
          stderr = (stderr + chunk.toString('utf8')).slice(-4096)
        })
        child.stdout.pipe(output)
        child.on('error', (error) => {
          output.destroy()
          reject(error)
        })
        output.on('error', (error) => {
          child.kill()
          reject(error)
        })
        // stdout 经 pipe 自动 end 输出流;close(拿到退出码)与 finish(落盘完成)都到才算完
        let exitCode: number | null = null
        let finished = false
        const maybeDone = () => {
          if (exitCode === null || !finished) return
          if (exitCode === 0) resolve()
          else reject(new Error(stderr.trim() || `${executable} exited with code ${exitCode}`))
        }
        child.on('close', (code) => {
          exitCode = code ?? 1
          maybeDone()
        })
        output.on('finish', () => {
          finished = true
          maybeDone()
        })
      }),
    spawnPty: (file, args, options): IPty => spawn(file, args, options),
    createSshClient: () => new Client(),
    createPortForwarder: (client, connectionId, emit) =>
      new SshPortForwardService(client, connectionId, emit),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timeout) => clearTimeout(timeout),
  }
}
