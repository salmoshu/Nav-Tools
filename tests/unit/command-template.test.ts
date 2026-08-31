import { describe, expect, it } from 'vitest'
import { interpolateCommandTemplate, parseCommandTemplate } from '@/core/terminal/CommandTemplate'
import { splitPosixCommands } from '../helpers/shell-tokens'

describe('parseCommandTemplate', () => {
  it('splits name, default and extra options', () => {
    expect(parseCommandTemplate('make -j{{jobs:8|4|16}} TARGET={{target:arm64|amd64}}')).toEqual([
      { name: 'jobs', defaultValue: '8', options: ['8', '4', '16'] },
      { name: 'target', defaultValue: 'arm64', options: ['arm64', 'amd64'] },
    ])
  })

  it('treats a single option as a free-text field', () => {
    const fields = parseCommandTemplate('git checkout {{branch:main}}')
    expect(fields).toEqual([{ name: 'branch', defaultValue: 'main', options: ['main'] }])
  })

  it('accepts a placeholder without a default', () => {
    expect(parseCommandTemplate('echo {{msg}}')).toEqual([
      { name: 'msg', defaultValue: '', options: [] },
    ])
  })

  it('returns no fields for a plain command', () => {
    expect(parseCommandTemplate('git pull --rebase')).toEqual([])
  })

  it('keeps only the first occurrence of a repeated name', () => {
    expect(
      parseCommandTemplate('cp {{src:a}} {{src:b}}').map((field) => field.defaultValue),
    ).toEqual(['a'])
  })

  it('ignores placeholders without a name', () => {
    expect(parseCommandTemplate('echo {{:8}} {{ }}')).toEqual([])
  })
})

describe('interpolateCommandTemplate', () => {
  it('falls back to the default value when nothing is supplied', () => {
    expect(interpolateCommandTemplate('make -j{{jobs:8|4}}', {}, 'posix')).toBe("make -j'8'")
  })

  it('uses supplied values', () => {
    const result = interpolateCommandTemplate(
      'make -j{{jobs:8|4}} TARGET={{target:arm64|amd64}}',
      { jobs: '16', target: 'amd64' },
      'posix',
    )
    expect(result).toBe("make -j'16' TARGET='amd64'")
  })

  it('leaves unparsable placeholders untouched', () => {
    expect(interpolateCommandTemplate('echo {{:8}}', {}, 'posix')).toBe('echo {{:8}}')
  })

  it('escapes per shell family', () => {
    const template = 'echo {{value:a b}}'
    expect(interpolateCommandTemplate(template, {}, 'posix')).toBe("echo 'a b'")
    expect(interpolateCommandTemplate(template, {}, 'powershell')).toBe("echo 'a b'")
    expect(interpolateCommandTemplate(template, {}, 'cmd')).toBe('echo "a b"')
    expect(interpolateCommandTemplate("echo {{value:it's}}", {}, 'powershell')).toBe("echo 'it''s'")
  })

  /**
   * 恶意参数值的契约测试：与 `shell-quote.test.ts` 的 hostile 用例同一思路——
   * 不逐字符比转义串，而是分词后断言「分号没有把命令行切成多条命令」。
   */
  it('keeps a hostile parameter value from breaking out of the command', () => {
    const hostile = '8; rm -rf ~'
    const result = interpolateCommandTemplate(
      'make -j{{jobs:8}} TARGET={{t:x}}',
      {
        jobs: hostile,
      },
      'posix',
    )
    expect(splitPosixCommands(result)).toEqual([['make', `-j${hostile}`, 'TARGET=x']])
  })

  it('does not let a hostile value open a second command even with shell metacharacters', () => {
    const result = interpolateCommandTemplate(
      'git checkout {{branch:main}}',
      {
        branch: 'main && echo pwned',
      },
      'posix',
    )
    expect(splitPosixCommands(result)).toEqual([['git', 'checkout', 'main && echo pwned']])
  })
})
