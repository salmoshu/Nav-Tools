import { describe, expect, it } from 'vitest'
import {
  CommandBlockAssembler,
  MAX_RICH_PAYLOAD_CHARS,
  decodeBase64Text,
} from '@/core/terminal/CommandBlocks'
import { renderMarkdownLite } from '@/core/terminal/MarkdownLite'
import { parseCsv } from '@/core/terminal/CsvLite'

const BEL = '\x07'
const osc133 = (letter: string, params = '') =>
  `\x1b]133;${letter}${params ? `;${params}` : ''}${BEL}`
const rich = (mime: string, text: string) =>
  `\x1b]1338;${mime};${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}${BEL}`

describe('CommandBlockAssembler rich payloads (OSC 1338)', () => {
  it('attaches rich content to the running command block', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`${osc133('A')}$ nav-render a.md\r\n${osc133('C')}`)
    assembler.feed(rich('text/markdown', '# Title'))
    assembler.feed(`${osc133('D', '0')}${osc133('A')}`)
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].rich).toHaveLength(1)
    expect(blocks[0].rich?.[0].mime).toBe('text/markdown')
    expect(decodeBase64Text(blocks[0].rich?.[0].data || '')).toBe('# Title')
    expect(blocks[0].output).toBe('')
    expect(blocks[0].exitCode).toBe(0)
  })

  it('creates a standalone block for rich content outside any command cycle', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(rich('application/json', '{"a":1}'))
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].rich?.[0].mime).toBe('application/json')
  })

  it('handles a rich payload split across many chunks', () => {
    const assembler = new CommandBlockAssembler()
    const payload = rich('text/plain', 'chunky '.repeat(1000))
    for (let index = 0; index < payload.length; index += 97) {
      assembler.feed(payload.slice(index, index + 97))
    }
    assembler.feed(osc133('A'))
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(decodeBase64Text(blocks[0].rich?.[0].data || '')).toBe('chunky '.repeat(1000))
  })

  it('ignores non-whitelisted MIME types', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(rich('text/html', '<b>hi</b>'))
    assembler.feed(rich('application/x-msdownload', 'MZ'))
    expect(assembler.getBlocks()).toHaveLength(0)
  })

  it('drops oversized payloads without corrupting following markers', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(`\x1b]1338;text/plain;${'A'.repeat(MAX_RICH_PAYLOAD_CHARS + 10)}${BEL}`)
    assembler.feed(`${osc133('C')}ok${osc133('D', '0')}${osc133('A')}`)
    const blocks = assembler.getBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].rich).toBeUndefined()
    expect(blocks[0].output).toBe('ok')
  })

  it('collects multiple rich payloads in one command block', () => {
    const assembler = new CommandBlockAssembler()
    assembler.feed(
      `${osc133('C')}${rich('image/png', 'fakepng')}${rich('text/csv', 'a,b')}${osc133('D', '0')}${osc133('A')}`,
    )
    expect(assembler.getBlocks()[0].rich?.map((payload) => payload.mime)).toEqual([
      'image/png',
      'text/csv',
    ])
  })
})

describe('renderMarkdownLite', () => {
  it('renders headings, emphasis, code and lists', () => {
    const html = renderMarkdownLite('# Title\n\nsome **bold** and *italic* and `code`\n\n- one\n- two')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
  })

  it('renders fenced code blocks and pipe tables', () => {
    const html = renderMarkdownLite('```js\nconst a = 1 < 2\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<pre class="md-code"><code>const a = 1 &lt; 2</code></pre>')
    expect(html).toContain('<table class="md-table">')
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('<td>2</td>')
  })

  it('escapes raw HTML and script tags (XSS safe by construction)', () => {
    const html = renderMarkdownLite('<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<img')
  })

  it('allows safe links and rejects dangerous protocols', () => {
    const html = renderMarkdownLite(
      '[ok](https://example.com) [rel](./file.md) [bad](javascript:alert(1)) [data](data:text/html,x)',
    )
    expect(html).toContain('<a href="https://example.com"')
    expect(html).toContain('<a href="./file.md"')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text/html')
  })
})

describe('parseCsv', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with commas, newlines and escaped quotes', () => {
    expect(parseCsv('"a,b","line1\nline2","say ""hi"""')).toEqual([
      ['a,b', 'line1\nline2', 'say "hi"'],
    ])
  })

  it('handles CRLF and skips empty trailing lines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})
