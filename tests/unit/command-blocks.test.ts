import { describe, expect, it } from 'vitest'
import {
  CommandBlockAssembler,
  MAX_BLOCK_OUTPUT_CHARS,
  MAX_COMMAND_BLOCKS,
  normalizeTerminalLayout,
  stripAnsiSequences,
} from '@/core/terminal/CommandBlocks'

const BEL = '\x07'
const ST = '\x1b\\'
const osc = (letter: string, params = '', terminator = BEL) =>
  `\x1b]133;${letter}${params ? `;${params}` : ''}${terminator}`

function base64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
}

describe('CommandBlockAssembler', () => {
  it('assembles a full A→C→D cycle into one block with command and exit code', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('A')}$ `)
    assembler.feed(`ls -la\r\n`)
    assembler.feed(`${osc('C', base64('ls -la'))}file1\r\nfile2\r\n`)
    assembler.feed(`${osc('D', '0')}${osc('A')}$ `)

    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].command).toBe('ls -la')
    expect(blocks[0].output).toBe('file1\r\nfile2\r\n')
    expect(blocks[0].exitCode).toBe(0)
    expect(blocks[0].finishedAt).toBeTypeOf('number')
  })

  it('decodes UTF-8 command text carried in the C marker', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('C', base64('echo 你好'))}你好\r\n${osc('D', '0')}${osc('A')}`)
    expect(assembler.getBlocks()[0].command).toBe('echo 你好')
  })

  it('handles markers split across chunks', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed('\x1b]13')
    assembler.feed('3;A')
    expect(assembler.hasMarkers).toBe(false)
    assembler.feed(`$ echo hi\r${osc('C')}`)
    assembler.feed('hi\r\n')
    assembler.feed(`\x1b]133;D;0${ST}`)
    assembler.feed(osc('A'))
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].output).toBe('hi\r\n')
    expect(blocks[0].exitCode).toBe(0)
  })

  it('keeps the whole cycle as block content for shells without C markers (PowerShell)', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('A')}PS C:\\> echo hi\r\nhi\r\n${osc('D', '0')}${osc('A')}`)
    assembler.feed(`PS C:\\> exit 3\r\n${osc('D', '3')}${osc('A')}`)
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(2)
    expect(blocks[0].command).toBeUndefined()
    expect(blocks[0].output).toContain('PS C:\\> echo hi')
    expect(blocks[0].exitCode).toBeUndefined()
    expect(blocks[1].exitCode).toBeUndefined()
  })

  it('closes a running block at the next prompt when D is missing (Ctrl+C)', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('A')}$ sleep 99\r\n${osc('C', base64('sleep 99'))}partial\r\n`)
    assembler.feed(osc('A'))
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].command).toBe('sleep 99')
    expect(blocks[0].exitCode).toBeUndefined()
    expect(blocks[0].finishedAt).toBeTypeOf('number')
  })

  it('exposes the in-flight block before D so long-running commands stay visible', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('A')}$ git log\r\n${osc('C', base64('git log'))}`)
    assembler.feed('commit abc123\r\nAuthor: Tester\r\n')
    // git log 走分页器,less 退出前不会有 D——块必须已在列表中且输出实时可见
    let blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].command).toBe('git log')
    expect(blocks[0].output).toBe('commit abc123\r\nAuthor: Tester\r\n')
    expect(blocks[0].finishedAt).toBeUndefined()

    // 输出继续流入同一块,id 保持稳定;D 到达后块转为完成态
    assembler.feed('Date: today\r\n')
    assembler.feed(`${osc('D', '0')}${osc('A')}$ `)
    blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].output).toContain('Date: today')
    expect(blocks[0].exitCode).toBe(0)
    expect(blocks[0].finishedAt).toBeTypeOf('number')
  })

  it('does not surface the bare prompt as a block while idle', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('A')}$ `)
    expect(assembler.getBlocks()).toHaveLength(0)
  })

  it('drops cycles whose pending holds only prompt-repaint escape sequences', () => {
    const assembler = new CommandBlockAssembler()
    // ConPTY 提示符行重绘:整段都是 CSI/SGR,strip 后无可见文本
    assembler.feed(`${osc('A')}\x1b[1;1H\x1b[32m\x1b[1m\x1b[K${osc('A')}`)
    expect(assembler.getBlocks()).toHaveLength(0)
  })

  it('ignores output outside any command cycle', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed('welcome banner\r\n')
    expect(assembler.getBlocks()).toHaveLength(0)
    expect(assembler.hasMarkers).toBe(false)
  })

  it('tolerates malformed params and unknown markers', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('C', '!!!not-base64!!!')}out${osc('D', 'abc')}${osc('A')}`)
    assembler.feed(`${osc('B')}${osc('E', 'x')}${osc('A')}`)
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].command).toBeUndefined()
    expect(blocks[0].exitCode).toBeUndefined()
  })

  it('caps the number of retained blocks', () => {
    const assembler = new CommandBlockAssembler()
    for (let i = 0; i < MAX_COMMAND_BLOCKS + 20; i += 1) {
      assembler.feed(`${osc('C', base64(`cmd${i}`))}out${i}${osc('D', '0')}${osc('A')}`)
    }
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(MAX_COMMAND_BLOCKS)
    expect(blocks[blocks.length - 1].command).toBe(`cmd${MAX_COMMAND_BLOCKS + 19}`)
  })

  it('caps per-block output and marks truncation', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(osc('C'))
    assembler.feed('x'.repeat(MAX_BLOCK_OUTPUT_CHARS + 1000))
    assembler.feed(`${osc('D', '0')}${osc('A')}`)
    const block = assembler.getBlocks()[0]
    expect(block.output).toHaveLength(MAX_BLOCK_OUTPUT_CHARS)
    expect(block.truncated).toBe(true)
  })

  it('accepts ST-terminated markers', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('A', '', ST)}$ x\r${osc('C', '', ST)}ok${osc('D', '1', ST)}${osc('A', '', ST)}`)
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].exitCode).toBe(1)
  })

  it('reset clears all state', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc('C')}out${osc('D', '0')}${osc('A')}`)
    assembler.reset()
    expect(assembler.getBlocks()).toHaveLength(0)
    expect(assembler.hasMarkers).toBe(false)
    assembler.feed('plain text only')
    expect(assembler.getBlocks()).toHaveLength(0)
  })
})

describe('stripAnsiSequences', () => {
  it('removes SGR, cursor and OSC sequences for plain-text rendering', () => {
    expect(stripAnsiSequences('\x1b[31mred\x1b[0m plain \x1b[2Kdone')).toBe('red plain done')
    expect(stripAnsiSequences('\x1b]7;file://host/path\x07text')).toBe('text')
  })
})

describe('normalizeTerminalLayout', () => {
  it('expands ConPTY CUF space shorthand so columnar output stays aligned', () => {
    // 真实捕获:wsl ls --color=auto 经 ConPTY 的重绘优化片段;
    // ECH(\x1b[11X)只擦除不移动光标,空白由随后的 \x1b[11C 跳过补齐
    const raw =
      '\x1b[34m\x1b[1mE-Wagon\x1b[m\x1b[11X\x1b[34m\x1b[1m\x1b[11CE-Wagon-Lidar\x1b[m   Env-Tools\r\n'
    expect(normalizeTerminalLayout(raw)).toBe(`E-Wagon${' '.repeat(11)}E-Wagon-Lidar   Env-Tools`)
  })

  it('turns cursor positioning (CUP/CHA) into line structure and padding', () => {
    // CUP 换行号 = 提交当前行并开始新行
    expect(normalizeTerminalLayout('ab\x1b[3;1Hcd')).toBe('ab\ncd')
    expect(normalizeTerminalLayout('ab\x1b[1;6Hcd')).toBe('ab\n     cd')
    // CHA 只移动列,仍在同一行
    expect(normalizeTerminalLayout('ab\x1b[5Gcd')).toBe('ab  cd')
  })

  it('overwrites on carriage return so progress rewrites keep only the final state', () => {
    // apt 风格:\r 同行重写(ConPTY 透传 CR)
    expect(normalizeTerminalLayout('Reading package lists... 0%\rReading package lists... Done\n'))
      .toBe('Reading package lists... Done')
    // 真实捕获:进度循环 Progress: [ n%]\r 反复重写
    expect(
      normalizeTerminalLayout('Progress: [ 1%]\rProgress: [ 2%]\rProgress: [ 3%]\r\r\n'),
    ).toBe('Progress: [ 3%]')
    // 无 EL 时较短的重写保留旧行尾部——与真实终端一致
    expect(normalizeTerminalLayout('aaaa bbbb\rxy\n')).toBe('xyaa bbbb')
  })

  it('collapses same-row CUP repaints into one line', () => {
    // dpkg 进度帧风格:ConPTY 对同一屏幕行的反复 CUP 重绘
    expect(normalizeTerminalLayout('one\n\x1b[2;1Htwo\x1b[2;1Hthree\n')).toBe('one\nthree')
  })

  it('honors EL erase-in-line before rewrites', () => {
    expect(normalizeTerminalLayout('aaaa bbbb cccc\r\x1b[Kshort\n')).toBe('short')
    expect(normalizeTerminalLayout('abcdef\r\x1b[3X\n')).toBe('   def')
  })

  it('expands tabs to the next multiple of 8 columns', () => {
    expect(normalizeTerminalLayout('a\tb')).toBe(`a${' '.repeat(7)}b`)
  })

  it('strips SGR/OSC and normalizes CR to line starts', () => {
    expect(normalizeTerminalLayout('\x1b[31mred\x1b[0m\r\nplain')).toBe('red\nplain')
    expect(normalizeTerminalLayout('\x1b]0;title\x07text')).toBe('text')
  })

  it('counts wide CJK characters as two columns when padding', () => {
    expect(normalizeTerminalLayout('你好\x1b[2C!')).toBe(`你好${' '.repeat(2)}!`)
    expect(normalizeTerminalLayout('你好\x1b[6G!')).toBe(`你好 !`)
  })
})

describe('CommandBlockAssembler cwd tracking', () => {
  it('stamps blocks with the OSC 7 cwd and compresses the home prefix', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed('\x1b]7;file://LAPTOP-P70CKHGG/home/winchell/E-Wagon\x07')
    assembler.feed(`${osc('A')}$ ls\r${osc('C', base64('ls'))}out\r\n${osc('D', '0')}${osc('A')}`)
    const blocks = assembler.getBlocks()
    expect(blocks[0].cwd).toBe('LAPTOP-P70CKHGG:~/E-Wagon')
    expect(assembler.currentCwd).toBe('LAPTOP-P70CKHGG:~/E-Wagon')
  })

  it('accepts ConPTY OSC 9;9 Windows paths', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed('\x1b]9;9;"C:\\Users\\Salmos"\x07')
    assembler.feed(`${osc('C', base64('dir'))}out${osc('D', '0')}${osc('A')}`)
    expect(assembler.getBlocks()[0].cwd).toBe('C:\\Users\\Salmos')
    expect(assembler.currentCwd).toBe('C:\\Users\\Salmos')
  })

  it('keeps cwd sequences out of block output and resets with the session', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed('\x1b]7;file://h/home/u\x07')
    assembler.feed(`${osc('C')}text${osc('D', '0')}${osc('A')}`)
    expect(assembler.getBlocks()[0].output).toBe('text')
    assembler.reset()
    expect(assembler.currentCwd).toBe('')
  })
})
