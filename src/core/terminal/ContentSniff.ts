/**
 * 输出内容嗅探(纯函数,可单测):不管命令是什么,看输出「像什么」。
 *
 * 服务于没有 shell 注入的会话(SSH 远程)与长尾命令:渲染侧直接从文本特征
 * 判断能否富化。设计上只认高置信度特征(见 doc/terminal-component/04-design.md §5),
 * 嗅探结果一律可由块头的「渲染 / 原始」切换撤销。
 *
 * 明确不做的事:
 * - 不把 `ls` 风格的单 token 行渲染成文件树——纯文本分不清文件与目录;
 * - 不做 diff 视图(中置信度),避免第一版就引入新渲染器。
 */

/** 嗅探可渲染的内容类型;null 表示「没有把握,保持原始文本」 */
export type SniffedContent = 'markdown' | 'json' | 'csv' | null

/** 参与嗅探的最大文本长度:超出说明是超长输出,嗅探收益低还拖慢渲染 */
const MAX_SNIFF_CHARS = 200_000
/** CSV 判定最少行数(含表头) */
const MIN_CSV_LINES = 3

/** 单行 Markdown 信号:围栏 / 标题 / 列表 / 引用 / 链接 / 粗斜体 */
const MD_HEADING = /^#{1,6}\s+\S/
const MD_LIST = /^\s*(?:[-*+]|\d+[.)])\s+\S/
const MD_FENCE = /^\s*```/
const MD_QUOTE = /^>\s?\S/
const MD_LINK = /\[[^\]\n]+\]\([^)\n]+\)/
const MD_EMPHASIS = /\*\*[^*\n]+\*\*|__[^_\n]+__/

export function sniffContent(raw: string): SniffedContent {
  const text = raw.trim()
  if (!text || text.length > MAX_SNIFF_CHARS) return null

  if (looksLikeJson(text)) return 'json'
  if (looksLikeCsv(text)) return 'csv'
  if (looksLikeMarkdown(text)) return 'markdown'
  return null
}

/** JSON:整体可解析,且是对象/数组(排除 `42`、`true` 这类标量误判) */
function looksLikeJson(text: string): boolean {
  if (!text.startsWith('{') && !text.startsWith('[')) return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * CSV:首行为表头、分隔符一致。要求全部行的列数相同且 ≥2 列,
 * 行数达到下限,避免把普通逗号句子(如日志一行)当成表格。
 */
function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < MIN_CSV_LINES) return false
  const delimiter = pickCsvDelimiter(lines[0])
  if (!delimiter) return false
  const columns = lines[0].split(delimiter).length
  if (columns < 2) return false
  return lines.every((line) => line.split(delimiter).length === columns)
}

/** 行内分隔符取逗号或制表符中较多者;两者都只有 0 个则不成表 */
function pickCsvDelimiter(line: string): ',' | '\t' | null {
  const commas = countChar(line, ',')
  const tabs = countChar(line, '\t')
  if (commas === 0 && tabs === 0) return null
  return commas >= tabs ? ',' : '\t'
}

function countChar(text: string, char: string): number {
  let count = 0
  for (const current of text) if (current === char) count += 1
  return count
}

/**
 * Markdown:信号行(围栏/标题/列表/引用/链接/粗斜体)占非空行的比例过半。
 * 单一信号(如整屏 `- ` 列表)可能是命令输出,要求至少出现两类信号,
 * 除非出现代码围栏——围栏在普通命令输出里几乎不出现,单独即可判定。
 */
function looksLikeMarkdown(text: string): boolean {
  const lines = text.split(/\r?\n/)
  let nonEmpty = 0
  let signals = 0
  const kinds = new Set<string>()
  let hasFence = false
  for (const line of lines) {
    if (!line.trim()) continue
    nonEmpty += 1
    if (MD_FENCE.test(line)) {
      hasFence = true
      signals += 1
      kinds.add('fence')
      continue
    }
    let matched = false
    if (MD_HEADING.test(line)) {
      kinds.add('heading')
      matched = true
    }
    if (MD_LIST.test(line)) {
      kinds.add('list')
      matched = true
    }
    if (MD_QUOTE.test(line)) {
      kinds.add('quote')
      matched = true
    }
    if (MD_LINK.test(line) || MD_EMPHASIS.test(line)) {
      kinds.add('inline')
      matched = true
    }
    if (matched) signals += 1
  }
  if (nonEmpty === 0 || signals === 0) return false
  if (hasFence) return true
  return kinds.size >= 2 && signals >= Math.ceil(nonEmpty / 2)
}
