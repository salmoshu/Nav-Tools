import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import * as pty from 'node-pty'
import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import {
  createTerminalId,
  sshConnectionKey,
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
  type TerminalCwdEvent,
  type TerminalSessionInfo,
  type TerminalStatusEvent,
} from '../../../src/core/terminal/TerminalTypes'
import { SshPortForwardService } from './SshPortForwardService'

const execFileAsync = promisify(execFile)
const MAX_SCROLLBACK_CHARS = 1_000_000
const SSH_CONNECT_TIMEOUT_MS = 35_000
const SSH_CHANNEL_TIMEOUT_MS = 15_000
const HOST_KEY_RESPONSE_TIMEOUT_MS = 30_000
/** 让 bash 在每个提示符前上报 OSC 7 cwd;仅对 bash 注入,zsh/fish 跳过避免报错 */
const OSC7_PROMPT_COMMAND = 'printf "\\e]7;file://%s%s\\e\\\\" "$HOSTNAME" "$PWD"'
/**
 * bash 命令块标记(OSC 133):PROMPT_COMMAND 在每个提示符处上报上一条命令的
 * 退出码(D)与提示符起点(A);DEBUG trap 在用户命令执行前触发并上报 base64
 * 编码的命令文本(C)。定义在 PROMPT_COMMAND 内,随环境变量传入,不落盘、
 * 不修改用户的 shell 配置文件。
 *
 * 三条不变量(均被真实会话验证过):
 * 1. C 标记必须写到启动时用 exec {fd}>&1 保存的终端 fd——若写 stdout,
 *    用户命令的重定向(for ... done > f、echo x > f)会把标记吞进文件,
 *    终端反而收不到,GUI 出现「(未捕获命令)」且用户文件被控制字节污染。
 * 2. __nav133_emit 保证每条命令行只发一次 C:复合命令(for/while)会对
 *    循环体每条子命令反复触发 DEBUG,靠标志位去重;PROMPT_COMMAND 末尾
 *    重新置位,该赋值自身触发 trap 时 emit=0,被静默跳过。
 * 3. PROMPT_COMMAND 自身执行期间必须摘掉 DEBUG trap:空回车/Ctrl+C 不会
 *    消耗 trap,若不先解除,下面的 OSC7 printf 与 trap 语句会被当成
 *    「用户命令」上报,GUI 出现 printf 幻影块。注意 trap - DEBUG 必须是
 *    PROMPT_COMMAND 里的直接语句——包成函数调用不生效(bash 实测),它
 *    自身靠过滤器的 trap * 模式放行;__nav_e=$? 保持最先执行以拿到真实
 *    退出码。handler 内部不要再放 trap - DEBUG(同样因函数包裹而无效)。
 */
const OSC133_BASH_INTEGRATION = [
  '__nav_e=$?',
  'trap - DEBUG',
  'printf "\\e]133;D;%s\\a\\e]133;A\\a" "$__nav_e"',
  OSC7_PROMPT_COMMAND,
  // 首次提示符时保存终端 fd;此后所有 C 标记写这里,不受用户重定向影响
  '[ -n "${__nav133_fd:-}" ] || exec {__nav133_fd}>&1 2>/dev/null',
  '__nav133_fire() { if [ -z "$COMP_LINE" ] && [ "$__nav133_emit" = 1 ]; then case "$BASH_COMMAND" in __nav133*|*__nav_e*|"trap "*) ;; *) __nav133_emit=0; __nav_c=$(printf %s "$BASH_COMMAND" | base64 2>/dev/null); printf "\\e]133;C;%s\\a" "$__nav_c" >&$__nav133_fd;; esac; fi; }',
  'trap __nav133_fire DEBUG',
  // nav-render <file> [mime]:把文件内容作为 OSC 1338 富内容块上报,GUI 视图按 MIME 渲染
  'nav-render() { local f="$1" m="$2"; if [ -z "$f" ] || [ ! -f "$f" ]; then echo "nav-render: file not found: $f" >&2; return 2; fi; if [ -z "$m" ]; then case "${f##*.}" in md|markdown) m=text/markdown;; json) m=application/json;; csv) m=text/csv;; png) m=image/png;; jpg|jpeg) m=image/jpeg;; svg) m=image/svg+xml;; *) m=text/plain;; esac; fi; printf "\\e]1338;%s;" "$m"; base64 "$f" 2>/dev/null | tr -d "\\n"; printf "\\a"; }',
  // 必须是 PROMPT_COMMAND 的最后一条:该赋值自身会触发一次 DEBUG(此时
  // emit=0 被静默跳过),执行完才置位;若后面还有语句,它们会以 emit=1
  // 触发 trap,产生幻影块
  '__nav133_emit=1',
].join('; ')
/**
 * PowerShell 提示符集成:prompt 函数在每次提示符处上报上一条命令的退出码(D)
 * 与提示符起点(A);同时注入 nav-render 函数上报 OSC 1338 富内容块。
 * 经 -Command 启动参数注入,不会作为输入回显进 scrollback。
 * 注意:这会覆盖用户 $PROFILE 里的自定义 prompt。
 */
const POWERSHELL_PROMPT_INTEGRATION =
  'function global:nav-render { param($f, $m) ' +
  'if (-not $f -or -not (Test-Path $f)) { Write-Host "nav-render: file not found: $f"; return } ' +
  'if (-not $m) { switch -Regex ([IO.Path]::GetExtension($f)) { ' +
  '"^\\.(md|markdown)$" { $m = "text/markdown" } "^\\.json$" { $m = "application/json" } ' +
  '"^\\.csv$" { $m = "text/csv" } "^\\.png$" { $m = "image/png" } ' +
  '"^\\.(jpg|jpeg)$" { $m = "image/jpeg" } "^\\.svg$" { $m = "image/svg+xml" } ' +
  'default { $m = "text/plain" } } } ' +
  '$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $f).Path)); ' +
  '$s = [char]27; $b = [char]7; [Console]::Out.Write("$s]1338;$m;$b64$b") }; ' +
  'function global:prompt { ' +
  '$e = $global:LASTEXITCODE; ' +
  '$c = 0; if ($null -ne $e) { $c = $e }; ' +
  '$s = [char]27; $b = [char]7; ' +
  '[Console]::Out.Write("$s]133;D;$c$b$s]133;A$b"); ' +
  '"PS $((Get-Location).Path)> " }'
/** 输入回显抑制窗口:写入后的这段时间内到达的输出视为回显,不驱动 tab 活动动画 */
const INPUT_ECHO_WINDOW_MS = 600
/** Terminal redraws emitted immediately after a PTY resize are layout feedback, not user activity. */
const RESIZE_REDRAW_WINDOW_MS = 250
/** OSC 7: file://host/path;OSC 9;9: ConPTY 的 cwd 上报 */
const OSC_CWD_PATTERN =
  // eslint-disable-next-line no-control-regex -- 终端转义序列解析必须匹配控制字符
  /\x1b\]7;file:\/\/[^/\x07\x1b]*(\/[^\x07\x1b]*?)(?:\x07|\x1b\\)|\x1b\]9;9;"?([^"\x07\x1b]+?)"?(?:\x07|\x1b\\)/g

interface BaseSession {
  info: TerminalSessionInfo
  scrollback: string
  /** 未完整的 OSC 序列残片,等待下一帧数据拼接后再解析 */
  oscTail: string
  /** 最近一次用户输入时间,用于把紧随的回显标记为非活动输出 */
  lastInputAt?: number
  /** 最近一次尺寸调整时间,用于忽略 shell 因窗口变化产生的重绘活动 */
  lastResizeAt?: number
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
    session.lastInputAt = Date.now()
    if (session.type === 'pty') session.process.write(data)
    else session.stream.write(data)
  }

  public resize(sessionId: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 1) return
    // ResizeObserver callbacks can arrive after a tab/pane has closed its session.
    // Resizing is best-effort, so a missing session is an expected lifecycle race.
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.lastResizeAt = Date.now()
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
      env: ptyEnvironment(request),
    })
    const session: LocalSession = {
      type: 'pty',
      info,
      scrollback: '',
      oscTail: '',
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
    // 相同连接参数复用存活连接:同一 tab 的分割终端共享登录状态,
    // 一条连接断开/恢复对所有复用它的会话同时生效。
    const reused = this.findReusableConnection(profile)
    const connection =
      reused ?? (await this.openSshConnection(profile, request.sshSecrets ?? {}, signal))
    try {
      const session = await this.openSshShell(
        connection,
        request.cols,
        request.rows,
        signal,
        profile.initialDirectory,
      )
      void connection.forwarder.startEnabled(profile.forwards)
      return session
    } catch (error) {
      if (!reused) {
        connection.client.end()
        connection.jumpClient?.end()
        this.connections.delete(connection.id)
      }
      throw error
    }
  }

  private findReusableConnection(profile: SshConnectionProfile): SshConnection | undefined {
    const key = sshConnectionKey(profile)
    for (const connection of this.connections.values()) {
      if (sshConnectionKey(connection.profile) === key) return connection
    }
    return undefined
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
    initialDirectory?: string,
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
    const session: SshSession = {
      type: 'ssh',
      info,
      scrollback: '',
      oscTail: '',
      stream,
      connection,
    }
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
    // 不再向 shell 注入 PROMPT_COMMAND 启动命令:注入文本会被回显/写进 scrollback,
    // 恢复终端时被当作奇怪打印再次回放。cwd 上报只保留 PTY 的环境变量注入。
    const directory = (initialDirectory ?? connection.profile.initialDirectory).trim()
    if (directory) stream.write(`cd -- ${shellQuote(directory)}\r`)
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
    this.trackCwd(session, data)
    // 紧随用户输入到达的输出基本是终端回显,标记 activity:false,
    // 渲染层据此跳过 tab 忙碌动画,只有真实输出才驱动活动状态
    const now = Date.now()
    const followsInput =
      session.lastInputAt !== undefined && now - session.lastInputAt <= INPUT_ECHO_WINDOW_MS
    const followsResize =
      session.lastResizeAt !== undefined && now - session.lastResizeAt <= RESIZE_REDRAW_WINDOW_MS
    const activity = !followsInput && !followsResize
    this.broadcast('terminal-output', { sessionId: session.info.id, data, activity })
  }

  /**
   * 从终端输出里解析 OSC 7(file://host/path,bash/WSL/SSH 注入 PROMPT_COMMAND 上报)
   * 与 OSC 9;9(ConPTY 风格),把 cwd 记到会话上并广播 'terminal-cwd'。
   * 序列可能跨数据帧,未完整的残片存进 oscTail 下次拼接。
   */
  private trackCwd(session: TerminalSession, data: string): void {
    const text = session.oscTail + data
    session.oscTail = ''
    let cwd: string | undefined
    for (const match of text.matchAll(OSC_CWD_PATTERN)) {
      cwd = match[1] ?? match[2]
    }
    const tailStart = text.lastIndexOf('\x1b]')
    if (tailStart >= 0) {
      const tail = text.slice(tailStart)
      if (!tail.includes('\x07') && !tail.includes('\x1b\\')) {
        session.oscTail = tail.slice(0, 256)
      }
    }
    if (!cwd) return
    try {
      cwd = decodeURIComponent(cwd)
    } catch {
      // 注入的 PROMPT_COMMAND 不做 URL 编码,非法百分号序列按原文保留
    }
    if (session.type === 'pty') cwd = normalizeMsysPath(cwd)
    if (!cwd || session.info.cwd === cwd) return
    session.info.cwd = cwd
    this.broadcast('terminal-cwd', { sessionId: session.info.id, cwd } satisfies TerminalCwdEvent)
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
    return {
      executable: 'powershell.exe',
      // 经启动参数注入 prompt 函数,上报 OSC 133 提示符/退出码标记;
      // PowerShell 无 preexec 机制,无法上报 C(命令开始),GUI 视图按周期整段成块
      args: ['-NoLogo', '-NoExit', '-Command', POWERSHELL_PROMPT_INTEGRATION],
      title: 'PowerShell',
    }
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

/**
 * bash 系终端注入 PROMPT_COMMAND 以上报 OSC 7 cwd 与 OSC 133 命令块标记:
 * - WSL 需要经 WSLENV(冒号分隔)把变量透传进发行版;
 * - git-bash 是 MSYS bash,直接继承环境变量;
 * - powershell 在 resolvePtyLaunch 用启动参数注入 prompt 函数;cmd 无可靠机制,不注入;
 * - SSH 远端 shell 不注入(v1.4.4 起不再向远端写入启动命令,避免污染 scrollback 回放)。
 */
function ptyEnvironment(request: TerminalCreateRequest): Record<string, string> {
  const env = cleanEnvironment(process.env)
  if (request.kind === 'wsl') {
    env.PROMPT_COMMAND = OSC133_BASH_INTEGRATION
    env.WSLENV = env.WSLENV ? `${env.WSLENV}:PROMPT_COMMAND` : 'PROMPT_COMMAND'
  } else if (request.kind === 'local' && request.localShell === 'git-bash') {
    env.PROMPT_COMMAND = OSC133_BASH_INTEGRATION
  }
  return env
}

/** git-bash(MSYS)上报 /c/Users/... 风格路径,还原为 Windows 路径供下次启动 cwd 使用 */
function normalizeMsysPath(cwd: string): string {
  const match = /^\/([a-zA-Z])\/(.+)$/.exec(cwd)
  return match ? `${match[1].toUpperCase()}:/${match[2]}` : cwd
}

function validCwd(cwd?: string): string {
  const trimmed = cwd?.trim()
  // 恢复的工作目录可能已被删除/移动,直接用作 spawn cwd 会报 error code 267,
  // 校验失败时回退到用户主目录
  if (trimmed && existsSync(trimmed) && statSync(trimmed).isDirectory()) return trimmed
  return os.homedir()
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
