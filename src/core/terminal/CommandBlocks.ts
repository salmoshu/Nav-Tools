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
  /** 命令执行时的工作目录(来自 OSC 7 / 9;9,格式 host:path 或裸 path) */
  cwd?: string
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

/** 统一标记匹配:g1/g2 = OSC 133 字母与参数;g3/g4 = OSC 1338 富内容的 MIME 与 base64;
 *  g5/g6 = OSC 7 cwd 的 host 与 path;g7 = ConPTY OSC 9;9 的 Windows cwd */
const MARKER_PATTERN =
  // eslint-disable-next-line no-control-regex -- 终端转义序列解析必须匹配控制字符
  /\x1b\]133;([A-Za-z])(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)|\x1b\]1338;([a-z0-9.+-]+\/[a-z0-9.+-]+);([A-Za-z0-9+/=]*)(?:\x07|\x1b\\)|\x1b\]7;file:\/\/([^\x07\x1b/]*)(\/[^\x07\x1b]*?)(?:\x07|\x1b\\)|\x1b\]9;9;"?([^"\x07\x1b]+?)"?(?:\x07|\x1b\\)/gi
// eslint-disable-next-line no-control-regex -- 同上
const PARTIAL_OSC_TAIL = /\x1b(?:\][^\x07\x1b]*)?$/

/** 去除 ANSI/OSC 转义序列,供 GUI 视图把输出渲染为纯文本 */
const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex -- 终端转义序列净化必须匹配控制字符
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[()][0-2]|\x1b[@-_]|[\x00-\x08\x0b-\x1f]/g

export function stripAnsiSequences(data: string): string {
  return data.replace(ANSI_PATTERN, '')
}

/** 常见宽字符(CJK/全角/emoji)按 2 列计,逼近终端网格宽度 */
function isWideChar(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

/**
 * 把终端输出流还原为保留版面语义的纯文本。
 * 以「行单元」模型解释常见序列,而非简单追加:
 * - 同行重写有覆盖语义:\r 回到列 0 后新文本覆盖旧文本,进度条类输出
 *   (apt/dpkg/下载器)只保留每行最终状态,不再首尾粘连;
 * - CUP(\x1b[r;cH)跟踪绝对行号:同行号 = 重写当前行(覆盖),不同行号
 *   = 提交当前行并开始新行——ConPTY 对全屏重绘的逐行回放因此保持行结构,
 *   而同处一行的进度帧互相覆盖;
 * - CUF(\x1b[nC)只移动列,落字时才补空格;ECH(\x1b[nX)原位擦除;
 *   EL(\x1b[K 系列)按参数清行;tab 展开到 8 列;宽字符(CJK/全角/emoji)
 *   按 2 列计。
 * 以单个块的输出为单位调用;行为目标是「终端最终屏幕的忠实文本快照」,
 * 而非字节流的历史流水。
 */
export function normalizeTerminalLayout(data: string): string {
  const lines: string[] = []
  /** 当前行单元:每个条目一个字符(宽字符占两格,次格为 '') */
  let cur: string[] = []
  let col = 0
  /** 最近一次 CUP 的绝对行号;同行号 CUP 表示重写当前行 */
  let curRow: number | undefined

  const commit = (force = false): void => {
    if (!force && cur.length === 0 && col === 0) return
    lines.push(cur.join('').replace(/\s+$/u, ''))
    cur = []
    col = 0
    curRow = undefined
  }
  const writeCell = (text: string, width: number): void => {
    while (cur.length < col) cur.push(' ')
    cur[col] = text
    if (width === 2) cur[col + 1] = ''
    col += width
  }
  const padTo = (target: number): void => {
    while (col < target) writeCell(' ', 1)
  }
  const firstParam = (params: string, fallback: number): number => {
    const value = Number.parseInt(params.split(';')[0], 10)
    return Number.isInteger(value) && value > 0 ? value : fallback
  }

  let i = 0
  while (i < data.length) {
    const code = data.charCodeAt(i)
    if (code === 0x1b) {
      const introducer = data[i + 1]
      if (introducer === '[') {
        let j = i + 2
        let params = ''
        while (j < data.length && /[0-9;?]/.test(data[j])) {
          params += data[j]
          j += 1
        }
        while (j < data.length && data[j] >= ' ' && data[j] <= '/') j += 1
        if (j >= data.length) break
        const final = data[j]
        if (final === 'C') {
          // CUF:只移动列,空格在后续落字时补
          col += firstParam(params, 1)
        } else if (final === 'X') {
          // ECH:原位擦除 n 格,不移动光标
          for (let k = col; k < col + firstParam(params, 1); k += 1) {
            if (k < cur.length) cur[k] = ' '
          }
        } else if (final === 'K') {
          // EL:0=清到行尾 1=清到光标 2=清整行(光标不动)
          const mode = firstParam(params, 0)
          if (mode === 2) cur = []
          else if (mode === 1) {
            for (let k = 0; k < col && k < cur.length; k += 1) cur[k] = ' '
          } else cur.length = Math.min(cur.length, col)
        } else if (final === 'G' || final === '`') {
          col = firstParam(params, 1) - 1
        } else if (final === 'H' || final === 'f') {
          const rowParam = Number.parseInt(params.split(';')[0] ?? '', 10)
          const colParam = Number.parseInt(params.split(';')[1] ?? '', 10)
          const row = Number.isInteger(rowParam) && rowParam > 0 ? rowParam : 1
          if (curRow === row) {
            col = (Number.isInteger(colParam) && colParam > 0 ? colParam : 1) - 1
          } else {
            commit()
            curRow = row
            col = (Number.isInteger(colParam) && colParam > 0 ? colParam : 1) - 1
          }
        }
        i = j + 1
        continue
      }
      if (introducer === ']') {
        // OSC:消费到 BEL 或 ESC\,内容丢弃(cwd 等标记已在装配阶段提取)
        let j = i + 2
        while (j < data.length && data[j] !== '\x07') {
          if (data[j] === '\x1b' && data[j + 1] === '\\') break
          j += 1
        }
        if (j >= data.length) break
        i = data[j] === '\x07' ? j + 1 : j + 2
        continue
      }
      if (introducer === '(' || introducer === ')') {
        i += 3
        continue
      }
      i += 2
      continue
    }
    if (data[i] === '\n') {
      commit(true)
      i += 1
      continue
    }
    if (data[i] === '\r') {
      col = 0
      i += 1
      continue
    }
    if (data[i] === '\t') {
      padTo(col + (8 - (col % 8)))
      i += 1
      continue
    }
    if (code < 0x20 || code === 0x7f) {
      i += 1
      continue
    }
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < data.length) {
      // 代理对(emoji 等 astral 字符)整体写入,按 2 列计
      writeCell(data[i] + data[i + 1], 2)
      i += 2
      continue
    }
    writeCell(data[i], isWideChar(code) ? 2 : 1)
    i += 1
  }
  commit()
  return lines.join('\n')
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
  /** 最近一次 OSC 7 / 9;9 上报的工作目录,新块在 C 时刻盖章 */
  private lastCwd = ''
  /** 是否见过任何 OSC 133 标记;用于 GUI 视图区分「无事件源」与「尚无输出」 */
  public hasMarkers = false

  /** 当前工作目录(OSC 7 → host:path,OSC 9;9 → 裸路径);供 GUI 视图输入行展示 */
  public get currentCwd(): string {
    return this.lastCwd
  }

  /**
   * 返回当前块列表;每次 feed 后调用方应重新读取以驱动视图更新。
   * 末尾包含仍在进行的命令块(已收到 C、尚未收到 D 或下一个 A),
   * 其 finishedAt 为空、输出随数据帧实时增长——git log 分页器、tail -f 等
   * 长运行命令因此在 GUI 视图中立即可见。
   */
  public getBlocks(): TerminalCommandBlock[] {
    return this.current ? [...this.blocks, this.current] : this.blocks
  }

  public reset(): void {
    this.tail = ''
    this.pending = ''
    this.pendingStartedAt = 0
    this.pendingTruncated = false
    this.current = undefined
    this.blocks = []
    this.hasMarkers = false
    this.lastCwd = ''
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
      } else if (match[5] !== undefined) {
        this.handleCwd(match[5], match[6] || '')
      } else if (match[7] !== undefined) {
        this.handleCwd('', match[7])
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

  /** OSC 7(file://host/path)与 ConPTY OSC 9;9(裸 Windows 路径)的 cwd 上报 */
  private handleCwd(host: string, rawPath: string): void {
    const path = rawPath.trim()
    if (!path) return
    // /home/<user> 前缀压缩为 ~,贴近 shell 提示符里用户熟悉的样式
    const homePrefix = /^\/home\/[^/]+/.exec(path)
    const shortPath = homePrefix ? `~${path.slice(homePrefix[0].length)}` : path
    this.lastCwd = host ? `${host}:${shortPath}` : shortPath
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
        cwd: this.lastCwd || undefined,
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
          cwd: this.lastCwd || undefined,
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
    } else if (normalizeTerminalLayout(this.pending).trim()) {
      // pending 只有提示符重绘的转义序列时(无可见文本)不成块,
      // 否则 GUI 会出现内容全空的「(未捕获命令)」幻影块
      this.pushBlock({
        id: this.nextId++,
        output: this.pending,
        cwd: this.lastCwd || undefined,
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
