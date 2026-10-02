/**
 * 输入行/块头的 shell 语法着色 tokenizer。
 *
 * 目标是 Warp 风格的"输入即着色"体验:命令绿、选项蓝、字符串黄、变量紫、
 * 操作符弱化、注释灰斜体。只做词法着色,不做语义分析(不求完整,求稳):
 * 不完整引用(打字中途)按字符串渲染到行尾,保证输入过程任意中间态都不闪。
 */
import type { ShellFamily } from './ShellQuote'

export type ShellSyntaxTokenKind =
  | 'command' // 命令位置的首词(行首或操作符后的第一个词)
  | 'option' // -x / --xxx(posix)或 /X(powershell)
  | 'string' // 引号内(含未闭合到行尾)
  | 'variable' // $VAR / ${...} / $env:NAME
  | 'operator' // | && || ; > >> < 2>
  | 'comment' // # 到行尾(powershell 的 # 同样)
  | 'glob' // 含 * 或 ? 的词
  | 'text' // 普通参数与空白

export interface ShellSyntaxToken {
  text: string
  kind: ShellSyntaxTokenKind
}

const OPERATORS = ['&&', '||', '>>', '>', '<', '|', ';', '&']
const VARIABLE_CHARS = /[A-Za-z0-9_]/

export function tokenizeShellLine(line: string, family: ShellFamily): ShellSyntaxToken[] {
  const tokens: ShellSyntaxToken[] = []
  let position = 0
  // 命令位置:行首、操作符、或 `(` 之后的首个非空白词
  let atCommandPosition = true

  const push = (text: string, kind: ShellSyntaxTokenKind): void => {
    if (text) tokens.push({ text, kind })
  }

  while (position < line.length) {
    const char = line[position]!

    // 空白:原样保留(着色层要与 textarea 的换行/空格逐字对齐)
    if (/\s/.test(char)) {
      let end = position
      while (end < line.length && /\s/.test(line[end]!)) end++
      push(line.slice(position, end), 'text')
      position = end
      continue
    }

    // 注释:bash 仅在词首才把 # 当注释;PowerShell 任意位置的 # 都开始注释
    if (
      char === '#' &&
      (family === 'powershell' || atCommandPosition || isWordStart(line, position))
    ) {
      push(line.slice(position), 'comment')
      break
    }

    // 引号字符串:未闭合渲染到行尾(输入中间态)
    if (char === '"' || char === "'") {
      let end = position + 1
      while (end < line.length && line[end] !== char) {
        // 双引号里的 \" 跳过;powershell 双引号里的 `` 也跳过
        if (line[end] === '\\' && char === '"') end++
        else if (family === 'powershell' && line[end] === '`' && char === '"') end++
        end++
      }
      push(line.slice(position, Math.min(end + 1, line.length)), 'string')
      position = Math.min(end + 1, line.length)
      atCommandPosition = false
      continue
    }

    // 变量:$VAR ${...} $1 $env:NAME
    if (char === '$') {
      let end = position + 1
      if (line[end] === '{') {
        while (end < line.length && line[end] !== '}') end++
        end = Math.min(end + 1, line.length)
      } else if (family === 'powershell' && line.startsWith('env:', end)) {
        end += 4
        while (end < line.length && VARIABLE_CHARS.test(line[end]!)) end++
      } else {
        while (end < line.length && VARIABLE_CHARS.test(line[end]!)) end++
      }
      // 裸 $ 后面什么都没有:按普通文本,避免孤零零的着色
      if (end === position + 1) {
        push(char, 'text')
        position++
      } else {
        push(line.slice(position, end), 'variable')
        position = end
      }
      atCommandPosition = false
      continue
    }

    // 操作符
    const operator = OPERATORS.find((candidate) => line.startsWith(candidate, position))
    if (operator) {
      // 2> 这类重定向描述符粘着数字,把数字一起归入操作符
      let start = position
      if (/[0-9]/.test(line[position - 1] ?? '') && (operator === '>' || operator === '>>')) {
        start -= 1
        const previous = tokens[tokens.length - 1]
        if (previous && previous.kind === 'text') {
          previous.text = previous.text.slice(0, -1)
          if (!previous.text) tokens.pop()
        }
      }
      push(line.slice(start, position + operator.length), 'operator')
      position += operator.length
      // 控制操作符后是命令位置;重定向后是文件名,不恢复命令位置
      atCommandPosition = operator !== '>' && operator !== '>>' && operator !== '<'
      continue
    }

    // 普通词:吃到空白/引号/操作符/注释边界
    let end = position
    while (end < line.length) {
      const next = line[end]!
      if (/\s/.test(next)) break
      if (next === '"' || next === "'" || next === '$') break
      if (OPERATORS.some((candidate) => line.startsWith(candidate, end))) break
      if (next === '#' && family === 'powershell') break
      end++
    }
    const word = line.slice(position, end)
    if (atCommandPosition) {
      push(word, 'command')
      atCommandPosition = false
    } else if (
      family === 'powershell' ? /^\/[A-Za-z]/.test(word) : /^--?[^-\s]/.test(word) || word === '-'
    ) {
      push(word, 'option')
    } else if (/[*?]/.test(word)) {
      push(word, 'glob')
    } else {
      push(word, 'text')
    }
    position = end
  }

  return tokens
}

/** # 前一个字符不是词字符时视为注释起点(bash 词首判定) */
function isWordStart(line: string, position: number): boolean {
  const previous = line[position - 1]
  return !previous || /[\s;|&]/.test(previous)
}
