import { describe, expect, it } from 'vitest'
import {
  completeCommandLine,
  completionToken,
  type CommandSpec,
} from '@/core/terminal/CommandCompletion'

const SPECS: CommandSpec[] = [
  {
    name: 'git',
    subcommands: ['add', 'branch', 'stash', 'status', 'switch'],
    options: ['--amend', '--oneline', '-m'],
  },
  { name: 'cat', options: ['--number', '-n'] },
]

describe('completionToken', () => {
  it('定位光标所在 token 的起点', () => {
    expect(completionToken('git status', 10)).toEqual({ start: 4, text: 'status' })
    expect(completionToken('git status', 6)).toEqual({ start: 4, text: 'st' })
  })

  it('空输入与越界光标都不抛错', () => {
    expect(completionToken('', 0)).toEqual({ start: 0, text: '' })
    expect(completionToken('abc', 99)).toEqual({ start: 0, text: 'abc' })
  })

  it('把引号当成 token 的一部分,于是引号内匹配不到候选', () => {
    expect(completionToken('cat "README', 12)).toEqual({ start: 4, text: '"README' })
  })
})

describe('completeCommandLine 命令位', () => {
  it('按前缀补内置命令名', () => {
    expect(completeCommandLine('gi', 2, [], SPECS)).toEqual([{ text: 'git', kind: 'command' }])
    // cat 不以 g 开头,不应出现在候选里
    expect(completeCommandLine('g', 1, [], SPECS).map((item) => item.text)).toEqual(['git'])
    expect(completeCommandLine('c', 1, [], SPECS).map((item) => item.text)).toEqual(['cat'])
  })

  it('历史里用过的命令名补在内置命令之后,最近的在前', () => {
    const result = completeCommandLine('gs', 2, ['gst', 'gsa'], SPECS)
    expect(result).toEqual([
      { text: 'gsa', kind: 'history' },
      { text: 'gst', kind: 'history' },
    ])
  })

  it('内置命令与历史重名时以内置为准,不重复出现', () => {
    expect(completeCommandLine('gi', 2, ['git status'], SPECS)).toEqual([
      { text: 'git', kind: 'command' },
    ])
  })
})

describe('completeCommandLine 参数位', () => {
  it('第一个参数位补子命令', () => {
    // switch 以 sw 开头,不匹配 st
    expect(completeCommandLine('git st', 6, [], SPECS).map((item) => item.text)).toEqual([
      'stash',
      'status',
    ])
  })

  it('以 - 开头只补选项', () => {
    expect(completeCommandLine('git commit --', 13, [], SPECS).map((item) => item.text)).toEqual([
      '--amend',
      '--oneline',
    ])
  })

  it('第二个及以后的参数位没有规格可依,只取历史同位 token', () => {
    expect(
      completeCommandLine(
        'git commit ',
        11,
        ['git commit -m "init"', 'git commit -m "wip"'],
        SPECS,
      ),
    ).toEqual([{ text: '-m', kind: 'history' }])
  })

  it('未收录的命令仍能用历史补全参数', () => {
    expect(completeCommandLine('foo ba', 6, ['foo bar'], SPECS)).toEqual([
      { text: 'bar', kind: 'history' },
    ])
  })

  it('有子命令的命令在第一个参数位不补选项', () => {
    expect(completeCommandLine('git -', 5, [], SPECS).map((item) => item.text)).toEqual([
      '--amend',
      '--oneline',
      '-m',
    ])
  })

  it('无子命令的命令在第一个参数位不内联选项', () => {
    expect(completeCommandLine('cat readme', 10, [], SPECS)).toEqual([])
  })
})

describe('completeCommandLine 边界', () => {
  it('无匹配时返回空数组', () => {
    expect(completeCommandLine('zzzz', 4, [], SPECS)).toEqual([])
  })

  it('引号内不产出候选', () => {
    expect(completeCommandLine('cat "README', 12, ['cat README.md'], SPECS)).toEqual([])
  })

  it('limit 生效', () => {
    expect(completeCommandLine('git ', 4, [], SPECS, 3).map((item) => item.text)).toEqual([
      'add',
      'branch',
      'stash',
    ])
  })

  it('光标在行中间时按光标处的 token 补全', () => {
    // 光标停在 sta 后面,补的是这个 token 而不是行尾
    expect(completeCommandLine('git sta -m', 7, [], SPECS).map((item) => item.text)).toEqual([
      'stash',
      'status',
    ])
  })
})
