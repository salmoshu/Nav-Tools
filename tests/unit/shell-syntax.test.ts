import { describe, expect, it } from 'vitest'
import { tokenizeShellLine } from '../../src/core/terminal/ShellSyntax'

/** 展开成 `kind:chunks` 的紧凑形式,断言可读 */
function outline(line: string, family: 'posix' | 'powershell' | 'cmd' = 'posix') {
  return tokenizeShellLine(line, family).map(
    (token) => `${token.kind}:${JSON.stringify(token.text)}`,
  )
}

describe('tokenizeShellLine (posix)', () => {
  it('命令位置的首词高亮为 command,操作符后恢复命令位置', () => {
    expect(outline('git status | grep -i foo')).toEqual([
      'command:"git"',
      'text:" "',
      'text:"status"',
      'text:" "',
      'operator:"|"',
      'text:" "',
      'command:"grep"',
      'text:" "',
      'option:"-i"',
      'text:" "',
      'text:"foo"',
    ])
  })

  it('长选项/短选项/裸 - 归 option', () => {
    expect(outline('tar --create -f -')).toEqual([
      'command:"tar"',
      'text:" "',
      'option:"--create"',
      'text:" "',
      'option:"-f"',
      'text:" "',
      'option:"-"',
    ])
  })

  it('引号字符串整体着色,未闭合渲染到行尾', () => {
    expect(outline('echo "hello world')).toEqual([
      'command:"echo"',
      'text:" "',
      'string:"\\"hello world"',
    ])
  })

  it('双引号内的转义引号不终止字符串', () => {
    const line = 'echo "a \\" b" c'
    expect(outline(line)).toEqual([
      'command:"echo"',
      'text:" "',
      'string:' + JSON.stringify('"a \\" b"'),
      'text:" "',
      'text:"c"',
    ])
  })

  it('$VAR 与 ${...} 着色为 variable,裸 $ 保持文本', () => {
    expect(outline('echo $HOME ${X_Y} $')).toEqual([
      'command:"echo"',
      'text:" "',
      'variable:"$HOME"',
      'text:" "',
      'variable:"${X_Y}"',
      'text:" "',
      'text:"$"',
    ])
  })

  it('多字符操作符 && || >> 不拆散,描述符数字并入重定向', () => {
    expect(outline('a && b || c 2> err.log')).toEqual([
      'command:"a"',
      'text:" "',
      'operator:"&&"',
      'text:" "',
      'command:"b"',
      'text:" "',
      'operator:"||"',
      'text:" "',
      'command:"c"',
      'text:" "',
      'operator:"2>"',
      'text:" "',
      'text:"err.log"',
    ])
  })

  it('bash 词首 # 是注释,词中 # 不是', () => {
    expect(outline('ls # comment here')).toEqual([
      'command:"ls"',
      'text:" "',
      'comment:"# comment here"',
    ])
    expect(outline('echo a#b')).toEqual(['command:"echo"', 'text:" "', 'text:"a#b"'])
  })

  it('含通配符的词是 glob', () => {
    expect(outline('rm *.tmp src/?ain.ts')).toEqual([
      'command:"rm"',
      'text:" "',
      'glob:"*.tmp"',
      'text:" "',
      'glob:"src/?ain.ts"',
    ])
  })

  it('空白作为独立 text token 保留原样(与 textarea 对齐)', () => {
    const tokens = tokenizeShellLine('a  b', 'posix')
    expect(tokens.map((t) => t.text).join('')).toBe('a  b')
    expect(outline('a  b')).toEqual(['command:"a"', 'text:"  "', 'text:"b"'])
  })
})

describe('tokenizeShellLine (powershell)', () => {
  it('/ 参数归 option,任意位置 # 开始注释', () => {
    expect(outline('Get-ChildItem /Recurse item#x', 'powershell')).toEqual([
      'command:"Get-ChildItem"',
      'text:" "',
      'option:"/Recurse"',
      'text:" "',
      'text:"item"',
      'comment:"#x"',
    ])
  })

  it('$env:NAME 变量与反引号转义', () => {
    const line = 'echo $env:PATH "a`"b"'
    expect(outline(line, 'powershell')).toEqual([
      'command:"echo"',
      'text:" "',
      'variable:"$env:PATH"',
      'text:" "',
      'string:' + JSON.stringify('"a`"b"'),
    ])
  })
})

describe('tokenizeShellLine (不变量)', () => {
  it('任意输入的 token 拼接恒等于原文(着色层对齐的前提)', () => {
    const samples = [
      'git commit -m "wip: 联调"',
      'a|b&&c>>d;e<f',
      '"unclosed',
      'echo $ ${ } 2>&1',
      '  leading spaces',
      '#only comment',
      'foo-bar --baz=1 $x${y} *.',
    ]
    for (const line of samples) {
      for (const family of ['posix', 'powershell', 'cmd'] as const) {
        expect(
          tokenizeShellLine(line, family)
            .map((t) => t.text)
            .join(''),
        ).toBe(line)
      }
    }
  })
})
