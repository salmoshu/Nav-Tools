/**
 * 安全子集 Markdown 渲染器:面向终端富内容块(nav-render 上报的不可信文本),
 * 不引入第三方依赖。安全模型是「先全文转义 HTML,再做子集变换」——
 * 任何原始标签/属性都不可能进入输出;链接只允许 http/https/mailto/相对地址,
 * javascript:/data: 等协议一律按纯文本处理。
 *
 * 支持:标题、段落、粗体、斜体、删除线、行内代码、代码围栏、链接、
 * 无序/有序列表、引用、分割线、管道表格。其余按纯文本原样呈现。
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim()
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return true
  // 相对地址:不含协议冒号即视为安全(#、./、path 等)
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
}

/** 行内强调/链接等变换,不处理行内代码 */
function renderInlinePlain(escaped: string): string {
  let out = escaped
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) =>
    isSafeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : label,
  )
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return out
}

/** 行内变换;输入必须已通过 escapeHtml。按反引号切段,奇数段为行内代码,不做强调变换 */
function renderInline(escaped: string): string {
  if (!escaped.includes('`')) return renderInlinePlain(escaped)
  const segments = escaped.split('`')
  // 反引号不成对时,最后一段按普通文本处理
  const codeEnd = segments.length % 2 === 0 ? segments.length : segments.length - 1
  return segments
    .map((segment, index) => {
      if (index < codeEnd && index % 2 === 1) return `<code>${segment}</code>`
      return renderInlinePlain(segment)
    })
    .join('')
}

function isTableDivider(line: string): boolean {
  return /^\|?[\s:|-]*-[\s:|-]*(\|[\s:|-]*)*$/.test(line) && line.includes('-')
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/** 把 Markdown 子集渲染为 HTML 字符串;输出配合 v-html 与 scoped 样式使用 */
export function renderMarkdownLite(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const html: string[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }
    // 代码围栏
    const fence = /^```(\w*)/.exec(trimmed)
    if (fence) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      index += 1 // 跳过收尾围栏(或 EOF)
      html.push(`<pre class="md-code"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }
    // 表格(当前行含 | 且下一行是分隔行)
    if (trimmed.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1].trim())) {
      const header = splitTableRow(line)
      index += 2
      const bodyRows: string[][] = []
      while (index < lines.length && lines[index].trim().includes('|') && lines[index].trim()) {
        bodyRows.push(splitTableRow(lines[index]))
        index += 1
      }
      const head = header.map((cell) => `<th>${renderInline(escapeHtml(cell))}</th>`).join('')
      const body = bodyRows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${renderInline(escapeHtml(cell))}</td>`).join('')}</tr>`,
        )
        .join('')
      html.push(`<table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`)
      continue
    }
    // 标题
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`)
      index += 1
      continue
    }
    // 分割线
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      html.push('<hr />')
      index += 1
      continue
    }
    // 引用
    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
        index += 1
      }
      html.push(`<blockquote>${renderInline(escapeHtml(quoteLines.join(' ')))}</blockquote>`)
      continue
    }
    // 列表
    const unordered = /^\s*[-*+]\s+/.test(line)
    const ordered = /^\s*\d+\.\s+/.test(line)
    if (unordered || ordered) {
      const items: string[] = []
      const itemPattern = unordered ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/
      while (index < lines.length) {
        const item = itemPattern.exec(lines[index])
        if (!item) break
        items.push(`<li>${renderInline(escapeHtml(item[1]))}</li>`)
        index += 1
      }
      html.push(unordered ? `<ul>${items.join('')}</ul>` : `<ol>${items.join('')}</ol>`)
      continue
    }
    // 段落:聚合同一段落内的连续行
    const paragraph: string[] = [trimmed]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6}\s|```|>|(-{3,}|\*{3,})$)/.test(lines[index].trim()) &&
      !/^\s*([-*+]\s+|\d+\.\s+)/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    html.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`)
  }
  return html.join('\n')
}
