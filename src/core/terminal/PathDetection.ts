/**
 * 终端输出里的路径检测(纯函数,可单测)。
 *
 * 参照 Warp 的做法(只参照策略,不参考其实现):先把输出里的「像路径的片段」
 * 找出来,再由调用方异步校验它是否真实存在。分两级是必要的——
 * 纯语法无法判断 `foo.txt` 到底是文件名还是一段普通文本。
 *
 * 为压掉误判,候选必须满足其一:
 * - 含路径分隔符(`/` 或 `\`),这是最强信号;
 * - 或带白名单内的扩展名(`FileMime.isPathExtension`)。
 *
 * 因此 `1.5.0`(版本号)、`12:34:56`(时间戳)这类文本不会被当成路径。
 * 检测不认带空格的路径——代价是漏检,换取低误报;真实存在性由调用方异步校验兜底。
 */

import { fileExtension, isPathExtension } from './FileMime'

export interface DetectedPath {
  /** 在原始文本中的起始下标(含) */
  start: number
  /** 在原始文本中的结束下标(不含) */
  end: number
  /** 去掉行号列号后的路径文本 */
  path: string
  line?: number
  column?: number
}

/**
 * 构成路径的字符:不含空格,以换取更低的误报率。
 *
 * `$` 是为了 Windows 的 UNC 路径(`\\wsl$\Ubuntu\home\...`)——这是 WSL 会话
 * 在本机 Windows 侧的常见形态。由此带来的 `$HOME/foo` 之类 shell 变量引用,
 * 在 parseCandidate 里按「以 $ 开头」直接否定。
 */
// eslint-disable-next-line no-useless-escape -- 字符类中转义 / 保持可读
const PATH_RUN = /[A-Za-z0-9_~\-\.\/\\:$]+/g
/** 行号/列号后缀:`file.c:42` 或 `file.c:42:9` */
const LINE_COLUMN_SUFFIX = /:(\d+)(?::(\d+))?$/
/** 结尾可能被相邻标点污染:`(see foo/bar.c).` */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/
/** URL:含 `//` 的 scheme,不应按路径处理 */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/** 单个候选的长度上限,避免压缩代码之类的超长 token 拖慢扫描 */
const MAX_CANDIDATE_LENGTH = 4096
/** 单次输出返回的最大候选数,超出部分丢弃(UI 也没有意义) */
const MAX_RESULTS = 500

interface ParsedCandidate {
  path: string
  line?: number
  column?: number
  /** raw 中属于路径部分的长度(剥离行号列号与结尾标点后的前缀长度) */
  length: number
}

/** 连续剥离结尾标点:`foo/bar.c).` → `foo/bar.c` */
function stripTrailingPunctuation(input: string): string {
  let text = input
  let trimmed = text
  do {
    text = trimmed
    trimmed = text.replace(TRAILING_PUNCTUATION, '')
  } while (trimmed !== text && trimmed.length > 0)
  return trimmed
}

function parseCandidate(raw: string): ParsedCandidate | null {
  // 顺序要紧:先去掉结尾标点,否则 `src/main.c:42:9:`(冒号被算进 token)
  // 会让行号列号的后缀匹配不到结尾,整个 `:42:9` 被当成路径的一部分。
  let text = stripTrailingPunctuation(raw)

  let line: number | undefined
  let column: number | undefined
  const suffix = LINE_COLUMN_SUFFIX.exec(text)
  if (suffix) {
    text = text.slice(0, suffix.index)
    line = Number.parseInt(suffix[1], 10)
    if (suffix[2] !== undefined) column = Number.parseInt(suffix[2], 10)
    text = stripTrailingPunctuation(text)
  }

  if (!text || text.length < 2) return null
  // `$HOME/foo` 这类 shell 变量引用不是路径
  if (text.startsWith('$')) return null
  if (URL_SCHEME.test(text)) return null

  // 去掉行号列号后可能只剩 `:`/`.` 之类的残留
  if (!/[A-Za-z0-9]/.test(text)) return null

  const hasSeparator = text.includes('/') || text.includes('\\')
  if (!hasSeparator && !isPathExtension(fileExtension(text))) return null

  // text 始终是 raw 的前缀(上述处理只从尾部剥离),故长度即已消费的前缀长度
  return { path: text, line, column, length: text.length }
}

/**
 * 扫描一段终端输出,返回其中的路径候选。
 *
 * 只做语法判定,不访问文件系统——存在性交由调用方异步校验,
 * 这样同一份逻辑对本地 / WSL / SSH 会话都成立。
 */
export function detectPaths(text: string): DetectedPath[] {
  const results: DetectedPath[] = []
  if (!text) return results

  PATH_RUN.lastIndex = 0
  for (let match = PATH_RUN.exec(text); match; match = PATH_RUN.exec(text)) {
    const raw = match[0]
    if (raw.length > MAX_CANDIDATE_LENGTH) continue

    const parsed = parseCandidate(raw)
    if (!parsed) continue

    // 行号列号后缀被剥离后,结束下标要跟着回收,否则 `:42` 会被包进链接里
    results.push({
      start: match.index,
      end: match.index + parsed.length,
      path: parsed.path,
      line: parsed.line,
      column: parsed.column,
    })
    if (results.length >= MAX_RESULTS) break
  }
  return results
}

/**
 * 把一段文本按路径候选切成片段,供渲染层直接 v-for。
 * 非路径片段的 `path` 为 undefined。
 */
export interface OutputSegment {
  text: string
  path?: DetectedPath
}

export function splitOutputByPaths(text: string): OutputSegment[] {
  const paths = detectPaths(text)
  if (paths.length === 0) return text ? [{ text }] : []

  const segments: OutputSegment[] = []
  let cursor = 0
  for (const found of paths) {
    if (found.start > cursor) segments.push({ text: text.slice(cursor, found.start) })
    segments.push({ text: text.slice(found.start, found.end), path: found })
    cursor = found.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) })
  return segments
}
