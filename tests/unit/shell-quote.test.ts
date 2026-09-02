import { describe, expect, it } from 'vitest'
import {
  buildShellCdCommand,
  buildShellCommand,
  joinShellCommands,
  quoteShellArg,
  shellFamilyFor,
} from '@/core/terminal/ShellQuote'
import { splitPosixCommands } from '../helpers/shell-tokens'

describe('shellFamilyFor', () => {
  it('maps session kinds to families', () => {
    expect(shellFamilyFor('ssh', undefined, 'win32')).toBe('posix')
    expect(shellFamilyFor('wsl', undefined, 'win32')).toBe('posix')
    expect(shellFamilyFor('local', 'cmd', 'win32')).toBe('cmd')
    expect(shellFamilyFor('local', 'git-bash', 'win32')).toBe('posix')
    expect(shellFamilyFor('local', 'powershell', 'win32')).toBe('powershell')
  })

  it('按运行平台校准 system 与缺省本地 shell 家族', () => {
    expect(shellFamilyFor('local', 'system', 'win32')).toBe('powershell')
    expect(shellFamilyFor('local', 'system', 'linux')).toBe('posix')
    expect(shellFamilyFor('local', 'system', 'darwin')).toBe('posix')
    expect(shellFamilyFor('local', undefined, 'linux')).toBe('posix')
  })
})

describe('quoteShellArg', () => {
  it('wraps plain text in family quotes', () => {
    expect(quoteShellArg('hello', 'posix')).toBe("'hello'")
    expect(quoteShellArg('hello', 'powershell')).toBe("'hello'")
    expect(quoteShellArg('hello', 'cmd')).toBe('"hello"')
  })

  it('escapes embedded quotes per family', () => {
    expect(quoteShellArg("it's", 'posix')).toBe("'it'\\''s'")
    expect(quoteShellArg("it's", 'powershell')).toBe("'it''s'")
    // cmd 无转义机制,剔除双引号避免截断
    expect(quoteShellArg('a"b', 'cmd')).toBe('"ab"')
  })

  it('keeps spaces inside the quoted word', () => {
    expect(quoteShellArg('C:\\Program Files\\x', 'powershell')).toBe("'C:\\Program Files\\x'")
  })
})

describe('buildShellCdCommand', () => {
  it('uses /d for cmd to cross drives', () => {
    expect(buildShellCdCommand('D:\\work', 'cmd')).toBe('cd /d "D:\\work"')
  })

  it('quotes posix paths', () => {
    expect(buildShellCdCommand('/home/my dir', 'posix')).toBe("cd '/home/my dir'")
  })
})

describe('joinShellCommands / buildShellCommand', () => {
  it('joins with family separators', () => {
    expect(joinShellCommands(['cd /x', 'ls'], 'posix')).toBe('cd /x; ls')
    expect(joinShellCommands(['cd "C:\\x"', 'dir'], 'cmd')).toBe('cd "C:\\x" && dir')
  })

  it('combines cwd and command', () => {
    expect(buildShellCommand('git pull', '~/E-Wagon', 'posix')).toBe("cd '~/E-Wagon'; git pull")
    expect(buildShellCommand('git pull', undefined, 'posix')).toBe('git pull')
    expect(buildShellCommand('  ', '/x', 'posix')).toBe('')
  })

  it('escapes hostile cwd values instead of breaking the command', () => {
    // 注入尝试:引号闭合后接 rm -rf;转义后整体仍是一个 cd 参数
    const hostile = "/x'; rm -rf ~; '"
    // 不逐字符比字符串(手算转义串极易出错),改按 POSIX 语义分词后校验结构:
    // 分号必须落在一个单词内部,不能把命令行切成 cd / 空 / rm -rf ~ 三段
    expect(splitPosixCommands(buildShellCommand('ls', hostile, 'posix'))).toEqual([
      ['cd', hostile],
      ['ls'],
    ])
  })
})
