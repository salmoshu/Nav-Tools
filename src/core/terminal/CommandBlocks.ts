/**
 * OSC 133 命令块装配器:把终端输出流按 shell 集成标记切分为结构化命令块,
 * 供终端 GUI 视图渲染。设计见 tmp/v1.5.0/gui-terminal-design.md。
 *
 * 标记约定(ESC ] 133 ; <letter> [;params] (BEL | ESC \)):
 * - A:提示符开始;一个命令周期 = 两次 A 之间的内容
 * - C;<base64>:命令开始执行;params 为注入脚本附带的 base64(UTF-8) 命令文本,可缺省
 * - D;<code>:命令结束;params 为退出码
 * - B:输入开始,当前不使用
 *
 * 对只上报 A/D 的 shell(如 PowerShell 注入),一个周期内的全部可见文本
 * 作为块内容保留,命令行文本留空。
 */

/** 富内容负载:程序经 OSC 1338 主动上报的 MIME 内容,数据为 base64 */
export interface TerminalRichPayload {
  mime: string
  /** base64 编码的原始内容;文本类渲染时解码,图片类直接作 data URL */
  data: string
}

export interface TerminalCommandBlock {
  id: number
  /** 注入脚本捕获的命令文本;无 C 标记或未携带参数时为空 */
  command?: string
  /** 命令产生的原始输出(可能含 ANSI 序列),不含提示符与输入回显 */
  output: string
  /** 命令周期内上报的富内容(nav-render 等),白名单 MIME 之外的一律丢弃 */
  rich?: TerminalRichPayload[]
  exitCode?: number
  startedAt: number
  finishedAt?: number
  /** 输出超过单块上限后被截断 */
  truncated: boolean
}

/** GUI 视图白名单 renderer 覆盖的 MIME 类型;未列入的序列直接忽略 */
export const SUPPORTED_RICH_MIMES = [
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
] as const

/** 单 pane 保留的最大块数,防止长时间会话无限增长 */
export const MAX_COMMAND_BLOCKS = 200
/** 单块最大输出字符数,超出后丢弃后续输出 */
export const MAX_BLOCK_OUTPUT_CHARS = 100_000
/** 单条富内容 base64 上限(约 3MB 原始数据),超限整条丢弃 */
export const MAX_RICH_PAYLOAD_CHARS = 4_000_000
/** 跨帧拼接 OSC 序列的尾缓冲上限,超长视为垃圾数据丢弃 */
const MAX_TAIL_CHARS = 4096

/** 统一标记匹配:g1/g2 = OSC 133 字母与参数;g3/g4 = OSC 1338 富内容的 MIME 与 base64 */
const MARKER_PATTERN =
  // eslint-disable-next-line no-control-regex -- 终端转义序列解析必须匹配控制字符
  /\x1b\]133;([A-Za-z])(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)|\x1b\]1338;([a-z0-9.+-]+\/[a-z0-9.+-]+);([A-Za-z0-9+/=]*)(?:\x07|\x1b\\)/gi
// eslint-disable-next-line no-control-regex -- 同上
const PARTIAL_OSC_TAIL = /\x1b(?:\][^\x07\x1b]*)?$/

/** 去除 ANSI/OSC 转义序列,供 GUI 视图把输出渲染为纯文本 */
const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex -- 终端转义序列净化必须匹配控制字符
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[()][0-2]|\x1b[@-_]|[\x00-\x08\x0b-\x1f]/g

export function stripAnsiSequences(data: string): string {
  return data.replace(ANSI_PATTERN, '')
}

/** base64(UTF-8) → 文本;C 标记的命令参数与富内容文本负载共用 */
export function decodeBase64Text(encoded: string): string {
  try {
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function decodeCommand(encoded: string | undefined): string | undefined {
  if (!encoded) return undefined
  const text = decodeBase64Text(encoded).trim()
  return text || undefined
}

function takeCapped(existing: string, text: string): { value: string; truncated: boolean } {
  const remaining = MAX_BLOCK_OUTPUT_CHARS - existing.length
  if (remaining <= 0) return { value: existing, truncated: text.length > 0 }
  return { value: existing + text.slice(0, remaining), truncated: text.length > remaining }
}

export class CommandBlockAssembler {
  private tail = ''
  /** 当前周期内、尚未归属到某个块的文本(C 之前的提示符与输入回显) */
  private pending = ''
  private pendingStartedAt = 0
  private pendingTruncated = false
  private current: TerminalCommandBlock | undefined
  private nextId = 1
  private blocks: TerminalCommandBlock[] = []
  /** 是否见过任何 OSC 133 标记;用于 GUI 视图区分「无事件源」与「尚无输出」 */
  public hasMarkers = false

  /** 返回当前块列表;每次 feed 后调用方应重新读取以驱动视图更新 */
  public getBlocks(): TerminalCommandBlock[] {
    return this.blocks
  }

  public reset(): void {
    this.tail = ''
    this.pending = ''
    this.pendingStartedAt = 0
    this.pendingTruncated = false
    this.current = undefined
    this.blocks = []
    this.hasMarkers = false
  }

  public feed(data: string): void {
    if (!data) return
    const input = this.tail + data
    this.tail = ''
    MARKER_PATTERN.lastIndex = 0
    let cursor = 0
    for (let match = MARKER_PATTERN.exec(input); match; match = MARKER_PATTERN.exec(input)) {
      this.appendText(input.slice(cursor, match.index))
      if (match[3] !== undefined) {
        this.handleRich(match[3], match[4] || '')
      } else {
        this.handleMarker(match[1], match[2])
      }
      cursor = match.index + match[0].length
    }
    const rest = input.slice(cursor)
    const partial = PARTIAL_OSC_TAIL.exec(rest)
    if (partial) {
      // 富内容负载可能跨多个数据帧且体积大,给它单独的尾缓冲上限
      const cap = partial[0].startsWith('\x1b]1338;')
        ? MAX_RICH_PAYLOAD_CHARS + 1024
        : MAX_TAIL_CHARS
      this.tail = partial[0].length <= cap ? partial[0] : ''
      this.appendText(rest.slice(0, rest.length - partial[0].length))
    } else {
      this.appendText(rest)
    }
  }

  /** OSC 1338 富内容:命令周期内归属当前块,否则自成一块并立即入列;白名单外 MIME 忽略 */
  private handleRich(mime: string, data: string): void {
    const normalized = mime.toLowerCase()
    if (!(SUPPORTED_RICH_MIMES as readonly string[]).includes(normalized)) return
    if (data.length > MAX_RICH_PAYLOAD_CHARS) return
    this.hasMarkers = true
    this.pending = ''
    this.pendingTruncated = false
    if (!this.current) {
      this.pushBlock({
        id: this.nextId++,
        output: '',
        rich: [{ mime: normalized, data }],
        startedAt: Date.now(),
        finishedAt: Date.now(),
        truncated: false,
      })
      return
    }
    const rich = this.current.rich ?? []
    rich.push({ mime: normalized, data })
    this.current.rich = rich
  }

  private handleMarker(letter: string, params?: string): void {
    this.hasMarkers = true
    if (letter === 'A') {
      this.closeCycle()
      return
    }
    if (letter === 'C') {
      // C 之前的 pending 是提示符与输入回显,丢弃;之后进入命令输出
      this.pending = ''
      this.pendingTruncated = false
      if (!this.current) {
        this.current = {
          id: this.nextId++,
          command: decodeCommand(params),
          output: '',
          startedAt: Date.now(),
          truncated: false,
        }
      } else if (!this.current.command) {
        this.current.command = decodeCommand(params)
      }
      return
    }
    if (letter === 'D') {
      const block = this.current
      if (block) {
        const code = Number.parseInt(params ?? '', 10)
        block.exitCode = Number.isInteger(code) ? code : undefined
        block.finishedAt = Date.now()
        this.pushBlock(block)
        this.current = undefined
      }
      return
    }
    // B 及其它标记忽略
  }

  /** A 标记:一个命令周期结束。有 C 的周期块已在 D 处入列;无 C 的周期整段成块 */
  private closeCycle(): void {
    if (this.current) {
      this.current.finishedAt = Date.now()
      this.pushBlock(this.current)
      this.current = undefined
    } else if (this.pending.trim()) {
      this.pushBlock({
        id: this.nextId++,
        output: this.pending,
        startedAt: this.pendingStartedAt || Date.now(),
        finishedAt: Date.now(),
        truncated: this.pendingTruncated,
      })
    }
    this.pending = ''
    this.pendingStartedAt = 0
    this.pendingTruncated = false
  }

  private appendText(text: string): void {
    if (!text) return
    if (this.current) {
      const result = takeCapped(this.current.output, text)
      this.current.output = result.value
      this.current.truncated = this.current.truncated || result.truncated
      return
    }
    if (!this.pending) this.pendingStartedAt = Date.now()
    const result = takeCapped(this.pending, text)
    this.pending = result.value
    this.pendingTruncated = this.pendingTruncated || result.truncated
  }

  private pushBlock(block: TerminalCommandBlock): void {
    this.blocks.push(block)
    if (this.blocks.length > MAX_COMMAND_BLOCKS) {
      this.blocks.splice(0, this.blocks.length - MAX_COMMAND_BLOCKS)
    }
  }
}
