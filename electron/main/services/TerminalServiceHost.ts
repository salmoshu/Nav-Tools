import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
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
  'access' | 'mkdir' | 'open' | 'readFile' | 'readdir' | 'stat' | 'writeFile'
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
      stat: fs.stat,
      writeFile: fs.writeFile,
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
    spawnPty: (file, args, options): IPty => spawn(file, args, options),
    createSshClient: () => new Client(),
    createPortForwarder: (client, connectionId, emit) =>
      new SshPortForwardService(client, connectionId, emit),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timeout) => clearTimeout(timeout),
  }
}
