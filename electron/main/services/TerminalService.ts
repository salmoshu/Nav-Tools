import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import * as pty from 'node-pty'
import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import {
  createTerminalId,
  type HostKeyMismatchEvent,
  type HostKeyPromptEvent,
  type LocalShellKind,
  type PortForwardRule,
  type SftpEntry,
  type SftpTransferEvent,
  type SshConnectionProfile,
  type SshConnectionSecrets,
  type TerminalCapabilities,
  type TerminalCreateRequest,
  type TerminalSessionInfo,
  type TerminalStatusEvent,
} from '../../../src/core/terminal/TerminalTypes'
import { SshPortForwardService } from './SshPortForwardService'

const execFileAsync = promisify(execFile)
const MAX_SCROLLBACK_CHARS = 1_000_000
const SSH_CONNECT_TIMEOUT_MS = 35_000
const SSH_CHANNEL_TIMEOUT_MS = 15_000
const HOST_KEY_RESPONSE_TIMEOUT_MS = 30_000

interface BaseSession {
  info: TerminalSessionInfo
  scrollback: string
}

interface LocalSession extends BaseSession {
  type: 'pty'
  process: pty.IPty
  request: TerminalCreateRequest
}

interface SshSession extends BaseSession {
  type: 'ssh'
  stream: ClientChannel
  connection: SshConnection
}

type TerminalSession = LocalSession | SshSession

interface SshConnection {
  id: string
  client: Client
  jumpClient?: Client
  profile: SshConnectionProfile
  sessions: Set<string>
  forwarder: SshPortForwardService
  sftp?: Promise<SFTPWrapper>
}

interface PendingHostKey {
  host: string
  port: number
  fingerprint: string
  timeout: ReturnType<typeof setTimeout>
  callback(accepted: boolean): void
}

type Broadcast = (channel: string, payload: unknown) => void

export class TerminalService {
  private readonly sessions = new Map<string, TerminalSession>()
  private readonly connections = new Map<string, SshConnection>()
  private readonly pendingHostKeys = new Map<string, PendingHostKey>()
  private readonly pendingCreates = new Map<string, AbortController>()
  private knownHosts: Record<string, string> | undefined
  private capabilitiesCache: TerminalCapabilities | undefined

  constructor(
    private readonly userDataPath: string,
    private readonly broadcast: Broadcast,
  ) {}

  public async getCapabilities(): Promise<TerminalCapabilities> {
    if (this.capabilitiesCache) return structuredClone(this.capabilitiesCache)
    const localShells: TerminalCapabilities['localShells'] = []
    const wslDistros: string[] = []

    if (process.platform === 'win32') {
      localShells.push({ kind: 'powershell', label: 'PowerShell', executable: 'powershell.exe' })
      localShells.push({ kind: 'cmd', label: 'Command Prompt', executable: 'cmd.exe' })
      const gitBash = await findGitBash()
      if (gitBash) localShells.push({ kind: 'git-bash', label: 'Git Bash', executable: gitBash })
      try {
        const result = await execFileAsync('wsl.exe', ['--list', '--quiet'], {
          windowsHide: true,
          encoding: 'buffer',
        })
        const raw = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout)
        const decoded = raw.includes(0) ? raw.toString('utf16le') : raw.toString('utf8')
        wslDistros.push(
          ...decoded
            .replace(/\0/g, '')
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
        )
      } catch {
        // WSL is optional.
      }
    } else {
      const executable =
        process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
      localShells.push({ kind: 'system', label: path.basename(executable), executable })
    }

    this.capabilitiesCache = {
      platform: process.platform,
      localShells,
      wslDistros,
      sshAvailable: true,
    }
    return structuredClone(this.capabilitiesCache)
  }

  public listSessions(): TerminalSessionInfo[] {
    return [...this.sessions.values()].map((session) => ({ ...session.info }))
  }

  public attach(sessionId: string): TerminalSessionInfo | undefined {
    const session = this.sessions.get(sessionId)
    return session ? { ...session.info, scrollback: session.scrollback } : undefined
  }

  public async create(request: TerminalCreateRequest): Promise<TerminalSessionInfo> {
    if (!Number.isInteger(request.cols) || !Number.isInteger(request.rows)) {
      throw new Error('Terminal dimensions are invalid')
    }
    if (request.kind !== 'ssh') return this.createPtySession(request)
    const controller = new AbortController()
    if (request.requestId) this.pendingCreates.set(request.requestId, controller)
    try {
      return await this.createSshSession(request, controller.signal)
    } finally {
      if (request.requestId && this.pendingCreates.get(request.requestId) === controller) {
        this.pendingCreates.delete(request.requestId)
      }
    }
  }

  public cancelCreate(requestId: string): boolean {
    const controller = this.pendingCreates.get(requestId)
    if (!controller) return false
    this.pendingCreates.delete(requestId)
    controller.abort()
    return true
  }

  public async clone(sessionId: string, cols: number, rows: number): Promise<TerminalSessionInfo> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Terminal session no longer exists')
    if (session.type === 'pty') return this.createPtySession({ ...session.request, cols, rows })
    return this.openSshShell(session.connection, cols, rows)
  }

  public write(sessionId: string, data: string): void {
    const session = this.requireSession(sessionId)
    if (session.type === 'pty') session.process.write(data)
    else session.stream.write(data)
  }

  public resize(sessionId: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 1) return
    // ResizeObserver callbacks can arrive after a tab/pane has closed its session.
    // Resizing is best-effort, so a missing session is an expected lifecycle race.
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (session.type === 'pty') session.process.resize(cols, rows)
    else session.stream.setWindow(rows, cols, 0, 0)
  }

  public async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)
    if (session.type === 'pty') {
      session.process.kill()
      return
    }
    session.stream.close()
    await this.releaseSshConnection(session.connection, sessionId)
  }

  public async closeAll(): Promise<void> {
    for (const controller of this.pendingCreates.values()) controller.abort()
    this.pendingCreates.clear()
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)))
    for (const pending of this.pendingHostKeys.values()) {
      clearTimeout(pending.timeout)
      pending.callback(false)
    }
    this.pendingHostKeys.clear()
  }

  public async respondToHostKey(requestId: string, accepted: boolean): Promise<void> {
    const pending = this.pendingHostKeys.get(requestId)
    if (!pending) return
    this.pendingHostKeys.delete(requestId)
    clearTimeout(pending.timeout)
    if (accepted) {
      try {
        const knownHosts = await this.loadKnownHosts()
        knownHosts[hostKey(pending.host, pending.port)] = pending.fingerprint
        await fs.mkdir(this.userDataPath, { recursive: true })
        await fs.writeFile(this.knownHostsPath(), JSON.stringify(knownHosts, null, 2), 'utf8')
      } catch (error) {
        pending.callback(false)
        throw error
      }
    }
    pending.callback(accepted)
  }

  public async listSshConfigProfiles(): Promise<SshConnectionProfile[]> {
    const configPath = path.join(os.homedir(), '.ssh', 'config')
    try {
      return parseSshConfig(await fs.readFile(configPath, 'utf8'))
    } catch {
      return []
    }
  }

  public async listSftp(sessionId: string, remotePath: string): Promise<SftpEntry[]> {
    const sftp = await this.getSftp(sessionId)
    const entries = await new Promise<
      Awaited<ReturnType<SFTPWrapper['readdir']>> extends never ? never : any[]
    >((resolve, reject) => {
      sftp.readdir(remotePath || '.', (error, list) => (error ? reject(error) : resolve(list)))
    })
    return entries
      .filter((entry) => entry.filename !== '.' && entry.filename !== '..')
      .map((entry) => ({
        name: entry.filename,
        path: path.posix.join(remotePath || '.', entry.filename),
        directory: entry.attrs.isDirectory(),
        size: entry.attrs.size,
        modifiedAt: entry.attrs.mtime * 1000,
        mode: entry.attrs.mode,
      }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
  }

  public async sftpStat(sessionId: string, remotePath: string): Promise<SftpEntry | null> {
    const sftp = await this.getSftp(sessionId)
    try {
      const attrs = await sftpStat(sftp, remotePath)
      return {
        name: path.posix.basename(remotePath),
        path: remotePath,
        directory: attrs.isDirectory(),
        size: attrs.size,
        modifiedAt: attrs.mtime * 1000,
        mode: attrs.mode,
      }
    } catch {
      return null
    }
  }

  public async sftpMkdir(sessionId: string, remotePath: string): Promise<void> {
    const sftp = await this.getSftp(sessionId)
    try {
      await sftpMkdir(sftp, remotePath)
    } catch (error) {
      const existing = await sftpStat(sftp, remotePath).catch(() => null)
      if (!existing?.isDirectory()) throw error
    }
  }

  public async sftpRename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const sftp = await this.getSftp(sessionId)
    await new Promise<void>((resolve, reject) =>
      sftp.rename(oldPath, newPath, (error) => (error ? reject(error) : resolve())),
    )
  }

  public async sftpRemove(sessionId: string, remotePath: string): Promise<void> {
    const sftp = await this.getSftp(sessionId)
    await removeRemoteRecursive(sftp, remotePath)
  }

  public async sftpUpload(
    sessionId: string,
    localPaths: string[],
    remoteDirectory: string,
  ): Promise<void> {
    const sftp = await this.getSftp(sessionId)
    for (const localPath of localPaths) {
      await this.uploadEntry(
        sftp,
        sessionId,
        localPath,
        path.posix.join(remoteDirectory, path.basename(localPath)),
      )
    }
  }

  public async sftpDownload(
    sessionId: string,
    remotePath: string,
    localPath: string,
  ): Promise<void> {
    const sftp = await this.getSftp(sessionId)
    await this.downloadEntry(sftp, sessionId, remotePath, localPath)
  }

  public async startForward(sessionId: string, rule: PortForwardRule): Promise<void> {
    const session = this.requireSshSession(sessionId)
    await session.connection.forwarder.start(rule)
  }

  public async stopForward(sessionId: string, ruleId: string): Promise<void> {
    const session = this.requireSshSession(sessionId)
    await session.connection.forwarder.stop(ruleId)
  }

  private createPtySession(request: TerminalCreateRequest): TerminalSessionInfo {
    const launch = resolvePtyLaunch(request)
    const id = createTerminalId('term')
    const info: TerminalSessionInfo = {
      id,
      kind: request.kind,
      title: launch.title,
      status: 'ready',
    }
    const processHandle = pty.spawn(launch.executable, launch.args, {
      name: 'xterm-256color',
      cols: Math.max(2, request.cols),
      rows: Math.max(1, request.rows),
      cwd: validCwd(request.cwd),
      env: cleanEnvironment(process.env),
    })
    const session: LocalSession = {
      type: 'pty',
      info,
      scrollback: '',
      process: processHandle,
      request: { ...request },
    }
    this.sessions.set(id, session)
    processHandle.onData((data) => this.handleOutput(session, data))
    processHandle.onExit(({ exitCode }) => {
      if (!this.sessions.has(id)) return
      session.info.status = exitCode === 0 ? 'closed' : 'error'
      this.emitStatus(session, undefined, exitCode)
    })
    this.emitStatus(session)
    return { ...info }
  }

  private async createSshSession(
    request: TerminalCreateRequest,
    signal: AbortSignal,
  ): Promise<TerminalSessionInfo> {
    const profile = request.sshProfile
    if (!profile) throw new Error('SSH connection profile is required')
    const connection = await this.openSshConnection(profile, request.sshSecrets ?? {}, signal)
    try {
      const session = await this.openSshShell(connection, request.cols, request.rows, signal)
      void connection.forwarder.startEnabled(profile.forwards)
      return session
    } catch (error) {
      connection.client.end()
      connection.jumpClient?.end()
      this.connections.delete(connection.id)
      throw error
    }
  }

  private async openSshConnection(
    profile: SshConnectionProfile,
    secrets: SshConnectionSecrets,
    signal: AbortSignal,
  ): Promise<SshConnection> {
    validateSshProfile(profile)
    let jumpClient: Client | undefined
    let sock: ClientChannel | undefined
    if (profile.proxyJump.trim()) {
      const jumpProfile = await this.resolveJumpProfile(profile.proxyJump, profile)
      jumpClient = await this.connectClient(jumpProfile, secrets, undefined, signal)
      try {
        sock = await openForwardSocket(jumpClient, profile, signal)
      } catch (error) {
        jumpClient.end()
        throw error
      }
    }

    let client: Client
    try {
      client = await this.connectClient(profile, secrets, sock, signal)
    } catch (error) {
      jumpClient?.end()
      throw error
    }
    const connectionId = createTerminalId('ssh-connection')
    const connection: SshConnection = {
      id: connectionId,
      client,
      jumpClient,
      profile: structuredClone(profile),
      sessions: new Set(),
      forwarder: new SshPortForwardService(client, connectionId, (event) =>
        this.broadcast('terminal-forward-status', event),
      ),
    }
    this.connections.set(connectionId, connection)
    client.once('close', () => {
      for (const sessionId of connection.sessions) {
        const session = this.sessions.get(sessionId)
        if (session) {
          session.info.status = 'closed'
          this.emitStatus(session, 'SSH connection closed')
        }
      }
      void connection.forwarder.stopAll()
      connection.jumpClient?.end()
      this.connections.delete(connection.id)
    })
    return connection
  }

  private async connectClient(
    profile: SshConnectionProfile,
    secrets: SshConnectionSecrets,
    sock?: ClientChannel,
    signal?: AbortSignal,
  ): Promise<Client> {
    const options = await this.createConnectConfig(profile, secrets, sock)
    throwIfAborted(signal)
    return new Promise((resolve, reject) => {
      const client = new Client()
      let settled = false
      const cleanup = () => {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
      }
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
      const abort = () => {
        fail(connectionCancelledError())
        client.destroy()
      }
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        client.destroy()
        reject(new Error(`SSH connection to ${profile.host}:${profile.port} timed out`))
      }, SSH_CONNECT_TIMEOUT_MS)
      client.once('ready', () => {
        if (settled) return
        settled = true
        cleanup()
        resolve(client)
      })
      client.once('error', fail)
      client.once('close', () =>
        fail(new Error(`SSH connection to ${profile.host}:${profile.port} closed before ready`)),
      )
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) {
        abort()
        return
      }
      try {
        client.connect(options)
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private async createConnectConfig(
    profile: SshConnectionProfile,
    secrets: SshConnectionSecrets,
    sock?: ClientChannel,
  ): Promise<ConnectConfig> {
    const options: ConnectConfig = {
      host: profile.host,
      port: profile.port,
      username: profile.username,
      readyTimeout: 20_000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
      hostVerifier: (key, callback) =>
        void this.verifyHostKey(profile.host, profile.port, key, callback),
    }
    if (sock) options.sock = sock
    if (profile.authMethod === 'password') options.password = secrets.password
    else if (profile.authMethod === 'private-key') {
      if (!profile.privateKeyPath) throw new Error('Private key path is required')
      options.privateKey = await fs.readFile(expandHome(profile.privateKeyPath))
      if (secrets.passphrase) options.passphrase = secrets.passphrase
    } else {
      options.agent = process.env.SSH_AUTH_SOCK || '\\\\.\\pipe\\openssh-ssh-agent'
    }
    return options
  }

  private async verifyHostKey(
    host: string,
    port: number,
    key: Buffer,
    callback: (accepted: boolean) => void,
  ): Promise<void> {
    const fingerprint = `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
    const knownHosts = await this.loadKnownHosts()
    const expected = knownHosts[hostKey(host, port)]
    if (expected === fingerprint) {
      callback(true)
      return
    }
    if (expected) {
      this.broadcast('terminal-host-key-mismatch', {
        host,
        port,
        expected,
        actual: fingerprint,
      } satisfies HostKeyMismatchEvent)
      callback(false)
      return
    }
    const requestId = createTerminalId('host-key')
    const timeout = setTimeout(() => {
      const pending = this.pendingHostKeys.get(requestId)
      if (!pending) return
      this.pendingHostKeys.delete(requestId)
      pending.callback(false)
    }, HOST_KEY_RESPONSE_TIMEOUT_MS)
    this.pendingHostKeys.set(requestId, { host, port, fingerprint, timeout, callback })
    this.broadcast('terminal-host-key-prompt', {
      requestId,
      host,
      port,
      fingerprint,
    } satisfies HostKeyPromptEvent)
  }

  private async openSshShell(
    connection: SshConnection,
    cols: number,
    rows: number,
    signal?: AbortSignal,
  ): Promise<TerminalSessionInfo> {
    throwIfAborted(signal)
    const stream = await new Promise<ClientChannel>((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(connectionCancelledError())
      }
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(
          new Error(`SSH shell on ${connection.profile.host}:${connection.profile.port} timed out`),
        )
      }, SSH_CHANNEL_TIMEOUT_MS)
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) {
        abort()
        return
      }
      connection.client.shell(
        { term: 'xterm-256color', cols: Math.max(2, cols), rows: Math.max(1, rows) },
        (error, channel) => {
          if (settled) {
            channel?.close()
            return
          }
          settled = true
          cleanup()
          if (error) reject(error)
          else resolve(channel)
        },
      )
    })
    const id = createTerminalId('term')
    const info: TerminalSessionInfo = {
      id,
      kind: 'ssh',
      title: connection.profile.name,
      status: 'ready',
      sshConnectionId: connection.id,
      profileId: connection.profile.id,
    }
    const session: SshSession = { type: 'ssh', info, scrollback: '', stream, connection }
    this.sessions.set(id, session)
    connection.sessions.add(id)
    stream.on('data', (data: Buffer) => this.handleOutput(session, data.toString('utf8')))
    stream.stderr.on('data', (data: Buffer) => this.handleOutput(session, data.toString('utf8')))
    stream.once('close', () => {
      if (!this.sessions.has(id)) return
      session.info.status = 'closed'
      this.emitStatus(session)
      void this.releaseSshConnection(connection, id)
    })
    if (connection.profile.initialDirectory) {
      stream.write(`cd -- ${shellQuote(connection.profile.initialDirectory)}\r`)
    }
    this.emitStatus(session)
    return { ...info }
  }

  private async releaseSshConnection(connection: SshConnection, sessionId: string): Promise<void> {
    connection.sessions.delete(sessionId)
    if (connection.sessions.size > 0) return
    await connection.forwarder.stopAll()
    connection.client.end()
    connection.jumpClient?.end()
    this.connections.delete(connection.id)
  }

  private handleOutput(session: TerminalSession, data: string): void {
    session.scrollback = (session.scrollback + data).slice(-MAX_SCROLLBACK_CHARS)
    this.broadcast('terminal-output', { sessionId: session.info.id, data })
  }

  private emitStatus(session: TerminalSession, message?: string, exitCode?: number): void {
    this.broadcast('terminal-status', {
      session: { ...session.info },
      message,
      exitCode,
    } satisfies TerminalStatusEvent)
  }

  private requireSession(sessionId: string): TerminalSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Terminal session no longer exists')
    return session
  }

  private requireSshSession(sessionId: string): SshSession {
    const session = this.requireSession(sessionId)
    if (session.type !== 'ssh') throw new Error('This operation requires an SSH session')
    return session
  }

  private async getSftp(sessionId: string): Promise<SFTPWrapper> {
    const connection = this.requireSshSession(sessionId).connection
    if (!connection.sftp) {
      connection.sftp = new Promise((resolve, reject) =>
        connection.client.sftp((error, sftp) => (error ? reject(error) : resolve(sftp))),
      )
    }
    return connection.sftp
  }

  private async uploadEntry(
    sftp: SFTPWrapper,
    sessionId: string,
    localPath: string,
    remotePath: string,
  ): Promise<void> {
    const stats = await fs.stat(localPath)
    if (stats.isDirectory()) {
      await sftpMkdir(sftp, remotePath).catch(() => undefined)
      for (const name of await fs.readdir(localPath)) {
        await this.uploadEntry(
          sftp,
          sessionId,
          path.join(localPath, name),
          path.posix.join(remotePath, name),
        )
      }
      return
    }
    const operationId = createTerminalId('sftp')
    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(
        localPath,
        remotePath,
        {
          step: (transferred, _chunk, total) =>
            this.emitTransfer({
              sessionId,
              operationId,
              direction: 'upload',
              name: path.basename(localPath),
              transferred,
              total,
              status: 'running',
            }),
        },
        (error) => (error ? reject(error) : resolve()),
      )
    })
    this.emitTransfer({
      sessionId,
      operationId,
      direction: 'upload',
      name: path.basename(localPath),
      transferred: stats.size,
      total: stats.size,
      status: 'success',
    })
  }

  private async downloadEntry(
    sftp: SFTPWrapper,
    sessionId: string,
    remotePath: string,
    localPath: string,
  ): Promise<void> {
    const attrs = await sftpStat(sftp, remotePath)
    if (attrs.isDirectory()) {
      await fs.mkdir(localPath, { recursive: true })
      const entries = await sftpReadDir(sftp, remotePath)
      for (const entry of entries) {
        await this.downloadEntry(
          sftp,
          sessionId,
          path.posix.join(remotePath, entry.filename),
          path.join(localPath, entry.filename),
        )
      }
      return
    }
    const operationId = createTerminalId('sftp')
    await fs.mkdir(path.dirname(localPath), { recursive: true })
    await new Promise<void>((resolve, reject) => {
      sftp.fastGet(
        remotePath,
        localPath,
        {
          step: (transferred, _chunk, total) =>
            this.emitTransfer({
              sessionId,
              operationId,
              direction: 'download',
              name: path.posix.basename(remotePath),
              transferred,
              total,
              status: 'running',
            }),
        },
        (error) => (error ? reject(error) : resolve()),
      )
    })
    this.emitTransfer({
      sessionId,
      operationId,
      direction: 'download',
      name: path.posix.basename(remotePath),
      transferred: attrs.size,
      total: attrs.size,
      status: 'success',
    })
  }

  private emitTransfer(event: SftpTransferEvent): void {
    this.broadcast('terminal-sftp-transfer', event)
  }

  private async resolveJumpProfile(
    proxyJump: string,
    fallback: SshConnectionProfile,
  ): Promise<SshConnectionProfile> {
    const profiles = await this.listSshConfigProfiles()
    const configured = profiles.find((profile) => profile.name === proxyJump)
    if (configured) return configured
    const match = /^(?:(?<user>[^@]+)@)?(?<host>\[[^\]]+\]|[^:]+)(?::(?<port>\d+))?$/.exec(
      proxyJump.trim(),
    )
    if (!match?.groups?.host) throw new Error(`Invalid ProxyJump: ${proxyJump}`)
    return {
      ...fallback,
      id: createTerminalId('proxy-jump'),
      name: proxyJump,
      host: match.groups.host.replace(/^\[|\]$/g, ''),
      port: Number(match.groups.port || 22),
      username: match.groups.user || fallback.username,
      proxyJump: '',
      forwards: [],
    }
  }

  private async loadKnownHosts(): Promise<Record<string, string>> {
    if (this.knownHosts) return this.knownHosts
    try {
      this.knownHosts = JSON.parse(await fs.readFile(this.knownHostsPath(), 'utf8'))
    } catch {
      this.knownHosts = {}
    }
    return this.knownHosts
  }

  private knownHostsPath(): string {
    return path.join(this.userDataPath, 'terminal-known-hosts.json')
  }
}

function resolvePtyLaunch(request: TerminalCreateRequest): {
  executable: string
  args: string[]
  title: string
} {
  if (request.kind === 'wsl') {
    const args = request.wslDistro ? ['--distribution', request.wslDistro] : []
    if (request.cwd) args.push('--cd', request.cwd)
    return { executable: 'wsl.exe', args, title: request.wslDistro || 'WSL' }
  }
  const kind: LocalShellKind = request.localShell || 'system'
  if (kind === 'powershell')
    return { executable: 'powershell.exe', args: ['-NoLogo'], title: 'PowerShell' }
  if (kind === 'cmd') return { executable: 'cmd.exe', args: ['/K', 'chcp 65001>nul'], title: 'CMD' }
  if (kind === 'git-bash') {
    return { executable: resolveGitBashSync(), args: ['--login', '-i'], title: 'Git Bash' }
  }
  const executable = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  return { executable, args: ['-l'], title: path.basename(executable) }
}

function validateSshProfile(profile: SshConnectionProfile): void {
  if (!profile.host || !profile.username) throw new Error('SSH host and username are required')
  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
    throw new Error('SSH port is invalid')
  }
}

function cleanEnvironment(environment: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function validCwd(cwd?: string): string {
  return cwd?.trim() || os.homedir()
}

function connectionCancelledError(): Error {
  const error = new Error('SSH connection cancelled')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw connectionCancelledError()
}

function openForwardSocket(
  client: Client,
  profile: SshConnectionProfile,
  signal: AbortSignal,
): Promise<ClientChannel> {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(connectionCancelledError())
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }
    client.forwardOut('127.0.0.1', 0, profile.host, profile.port, (error, stream) => {
      if (settled) {
        stream?.close()
        return
      }
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(stream)
    })
  })
}

async function findGitBash(): Promise<string | undefined> {
  for (const candidate of gitBashCandidates()) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Continue searching.
    }
  }
  return undefined
}

function resolveGitBashSync(): string {
  return gitBashCandidates().find((candidate) => existsSync(candidate)) || 'bash.exe'
}

function gitBashCandidates(): string[] {
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    process.env['ProgramFiles(x86)'] &&
      path.join(process.env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
  ]
  return candidates.filter((candidate): candidate is string => Boolean(candidate))
}

function parseSshConfig(source: string): SshConnectionProfile[] {
  const profiles: SshConnectionProfile[] = []
  let currentAliases: string[] = []
  let values: Record<string, string> = {}
  const flush = () => {
    for (const alias of currentAliases.filter(
      (value) => !value.includes('*') && !value.includes('?'),
    )) {
      const identity = expandHome(values.identityfile || '')
      profiles.push({
        id: `ssh-config:${alias}`,
        name: alias,
        source: 'ssh-config',
        host: values.hostname || alias,
        port: Number(values.port || 22),
        username: values.user || os.userInfo().username,
        authMethod: identity ? 'private-key' : 'agent',
        privateKeyPath: identity,
        proxyJump: values.proxyjump || '',
        initialDirectory: '',
        forwards: [],
      })
    }
  }
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(\S+)\s+(.*)$/.exec(line)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = unquote(match[2].trim())
    if (key === 'host') {
      flush()
      currentAliases = value.split(/\s+/)
      values = {}
    } else if (currentAliases.length > 0 && values[key] === undefined) {
      values[key] = value
    }
  }
  flush()
  return profiles.filter(
    (profile) => Number.isInteger(profile.port) && profile.port > 0 && profile.port <= 65535,
  )
}

function unquote(value: string): string {
  return value.replace(/^(['"])(.*)\1$/, '$2')
}

function expandHome(value: string): string {
  if (!value) return ''
  return value === '~'
    ? os.homedir()
    : value.startsWith('~/') || value.startsWith('~\\')
      ? path.join(os.homedir(), value.slice(2))
      : value
}

function hostKey(host: string, port: number): string {
  return `${host.toLowerCase()}:${port}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function sftpStat(sftp: SFTPWrapper, remotePath: string): Promise<any> {
  return new Promise((resolve, reject) =>
    sftp.stat(remotePath, (error, attrs) => (error ? reject(error) : resolve(attrs))),
  )
}

function sftpReadDir(sftp: SFTPWrapper, remotePath: string): Promise<any[]> {
  return new Promise((resolve, reject) =>
    sftp.readdir(remotePath, (error, list) => (error ? reject(error) : resolve(list))),
  )
}

function sftpMkdir(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) =>
    sftp.mkdir(remotePath, (error) => (error ? reject(error) : resolve())),
  )
}

async function removeRemoteRecursive(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  const attrs = await sftpStat(sftp, remotePath)
  if (!attrs.isDirectory()) {
    await new Promise<void>((resolve, reject) =>
      sftp.unlink(remotePath, (error) => (error ? reject(error) : resolve())),
    )
    return
  }
  for (const entry of await sftpReadDir(sftp, remotePath)) {
    await removeRemoteRecursive(sftp, path.posix.join(remotePath, entry.filename))
  }
  await new Promise<void>((resolve, reject) =>
    sftp.rmdir(remotePath, (error) => (error ? reject(error) : resolve())),
  )
}
