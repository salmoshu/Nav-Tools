import { describe, expect, it } from 'vitest'
import {
  detectListingPaths,
  detectPaths,
  detectUrls,
  isListingCommand,
  splitOutputByPaths,
} from '@/core/terminal/PathDetection'
import { fileExtension, isPathExtension, mimeFromPath } from '@/core/terminal/FileMime'

describe('detectPaths', () => {
  it('detects a path with a directory separator', () => {
    const found = detectPaths('opened src/core/terminal/CommandBlocks.ts')
    expect(found).toHaveLength(1)
    expect(found[0].path).toBe('src/core/terminal/CommandBlocks.ts')
    expect(found[0].start).toBe(7)
    expect(found[0].end).toBe(7 + 'src/core/terminal/CommandBlocks.ts'.length)
  })

  it('parses line and column suffix and excludes it from the link range', () => {
    const found = detectPaths('src/main.c:42:9: error: undefined reference')
    expect(found).toHaveLength(1)
    expect(found[0].path).toBe('src/main.c')
    expect(found[0].line).toBe(42)
    expect(found[0].column).toBe(9)
    // `:42:9` 之后的内容不能算进链接
    expect('src/main.c:42:9: error: undefined reference'.slice(found[0].end)).toBe(
      ':42:9: error: undefined reference',
    )
  })

  it('parses line-only suffix', () => {
    const found = detectPaths('see README.md:12')
    expect(found[0].path).toBe('README.md')
    expect(found[0].line).toBe(12)
    expect(found[0].column).toBeUndefined()
  })

  it('detects an extension-only token without separator', () => {
    const found = detectPaths('wrote report.md')
    expect(found).toHaveLength(1)
    expect(found[0].path).toBe('report.md')
  })

  it('rejects version numbers and timestamps', () => {
    expect(detectPaths('released v1.5.0 today')).toHaveLength(0)
    expect(detectPaths('finished at 12:34:56')).toHaveLength(0)
  })

  it('rejects unknown extensions without separator', () => {
    expect(detectPaths('value is 3.14159')).toHaveLength(0)
    expect(detectPaths('token abc.zzz')).toHaveLength(0)
  })

  it('rejects urls', () => {
    expect(detectPaths('see https://example.com/docs/index.html')).toHaveLength(0)
  })

  it('rejects shell variable references', () => {
    expect(detectPaths('cd $HOME/project')).toHaveLength(0)
  })

  it('strips trailing punctuation from adjacent text', () => {
    const found = detectPaths('(see docs/guide.md), and more')
    expect(found).toHaveLength(1)
    expect(found[0].path).toBe('docs/guide.md')
  })

  it('handles windows absolute and UNC paths', () => {
    expect(detectPaths(`at C:\\Users\\dev\\project\\main.c`)[0].path).toBe(
      'C:\\Users\\dev\\project\\main.c',
    )
    expect(detectPaths(`open \\\\wsl$\\Ubuntu\\home\\dev\\a.log`)[0].path).toBe(
      '\\\\wsl$\\Ubuntu\\home\\dev\\a.log',
    )
  })

  it('handles home-relative paths', () => {
    expect(detectPaths('cd ~/E-Wagon/src')[0].path).toBe('~/E-Wagon/src')
  })

  it('detects multiple paths in one block of output', () => {
    const found = detectPaths('diff docs/a.md src/b.c')
    expect(found.map((item) => item.path)).toEqual(['docs/a.md', 'src/b.c'])
  })

  it('caps results to keep huge output bounded', () => {
    const many = Array.from({ length: 600 }, (_, i) => `dir/file${i}.log`).join(' ')
    expect(detectPaths(many)).toHaveLength(500)
  })

  it('returns empty for empty input', () => {
    expect(detectPaths('')).toEqual([])
  })
})

describe('splitOutputByPaths', () => {
  it('splits text into plain and path segments', () => {
    const segments = splitOutputByPaths('open src/a.c now')
    expect(segments.map((s) => s.text)).toEqual(['open ', 'src/a.c', ' now'])
    expect(segments[1].path?.path).toBe('src/a.c')
  })

  it('returns the whole text as one segment when no path exists', () => {
    const segments = splitOutputByPaths('just text')
    expect(segments).toEqual([{ text: 'just text' }])
  })

  it('round-trips: joined segments equal the original text', () => {
    const text = 'error in src/main.c:42 see docs/note.md; done'
    expect(splitOutputByPaths(text).map((s) => s.text).join('')).toBe(text)
  })

  it('marks http(s) links as url segments instead of path candidates', () => {
    const segments = splitOutputByPaths('docs at https://example.com/guide/index.html online')
    const link = segments.find((s) => s.url)
    expect(link?.text).toBe('https://example.com/guide/index.html')
    expect(link?.url?.url).toBe('https://example.com/guide/index.html')
    expect(link?.path).toBeUndefined()
  })

  it('keeps urls and paths side by side, round-tripping the original text', () => {
    const text = 'see https://example.com/a and src/main.c:42'
    const segments = splitOutputByPaths(text)
    expect(segments.map((s) => s.text).join('')).toBe(text)
    expect(segments.find((s) => s.url)?.url?.url).toBe('https://example.com/a')
    expect(segments.find((s) => s.path)?.path?.path).toBe('src/main.c')
  })

  it('does not treat path-like fragments inside a url query as paths', () => {
    const segments = splitOutputByPaths('open https://example.com/b?next=/tmp/c now')
    expect(segments.map((s) => s.text).join('')).toBe('open https://example.com/b?next=/tmp/c now')
    expect(segments.filter((s) => s.path)).toHaveLength(0)
    expect(segments.find((s) => s.url)?.url?.url).toBe('https://example.com/b?next=/tmp/c')
  })

  it('does not report urls as bare names in listing mode', () => {
    const segments = splitOutputByPaths('notes https://example.com/x', { listing: true })
    expect(segments.find((s) => s.url)?.text).toBe('https://example.com/x')
    expect(segments.filter((s) => s.path).map((s) => s.text)).toEqual(['notes'])
  })
})

describe('detectUrls', () => {
  it('detects http and https links with offsets', () => {
    const text = 'home http://example.com and https://example.com/docs'
    const found = detectUrls(text)
    expect(found.map((item) => item.url)).toEqual([
      'http://example.com',
      'https://example.com/docs',
    ])
    for (const item of found) {
      expect(text.slice(item.start, item.end)).toBe(item.url)
    }
  })

  it('keeps query strings, ports and fragments intact', () => {
    const found = detectUrls('see https://example.com:8080/a?x=1&y=2#frag')
    expect(found).toHaveLength(1)
    expect(found[0].url).toBe('https://example.com:8080/a?x=1&y=2#frag')
  })

  it('strips trailing ASCII and CJK punctuation from links', () => {
    expect(detectUrls('详见 https://example.com/a。')[0].url).toBe('https://example.com/a')
    expect(detectUrls('docs: https://example.com/a, more')[0].url).toBe('https://example.com/a')
    expect(detectUrls('(https://example.com/a)')[0].url).toBe('https://example.com/a')
  })

  it('stops at whitespace and quotes', () => {
    expect(detectUrls('a https://example.com/x y')[0].url).toBe('https://example.com/x')
    expect(detectUrls('"https://example.com/x"')[0].url).toBe('https://example.com/x')
  })

  it('ignores bare schemes and non-http schemes', () => {
    expect(detectUrls('https://')).toHaveLength(0)
    expect(detectUrls('ftp://example.com/x')).toHaveLength(0)
    expect(detectUrls('')).toEqual([])
  })
})


describe('isListingCommand', () => {
  it('matches listing commands and aliases', () => {
    expect(isListingCommand('ls')).toBe(true)
    expect(isListingCommand('ls -la')).toBe(true)
    expect(isListingCommand('ll')).toBe(true)
    expect(isListingCommand('dir')).toBe(true)
    expect(isListingCommand('Get-ChildItem -Recurse')).toBe(true)
    expect(isListingCommand('gci')).toBe(true)
    expect(isListingCommand('sudo ls /root')).toBe(true)
    expect(isListingCommand('/bin/ls -l')).toBe(true)
  })

  it('rejects non-listing commands', () => {
    expect(isListingCommand('pwd')).toBe(false)
    expect(isListingCommand('cat file.txt')).toBe(false)
    expect(isListingCommand('')).toBe(false)
    expect(isListingCommand('lsof -i')).toBe(false)
  })
})

describe('detectListingPaths', () => {
  it('detects bare names in PowerShell ls table output, skipping mode/date/time/size columns', () => {
    const output = [
      'Mode                 LastWriteTime         Length Name',
      '----                 -------------         ------ ----',
      'd-----         2026/9/26     15:05                Contacts',
      'd-r---         2026/10/3      0:48                Desktop',
      '-a----         2026/9/27     22:31       12332    .bash_history',
    ].join('\n')
    const found = detectListingPaths(output)
    const paths = found.map((item) => item.path)
    expect(paths).toContain('Contacts')
    expect(paths).toContain('Desktop')
    expect(paths).toContain('.bash_history')
    expect(paths).not.toContain('d-----')
    expect(paths).not.toContain('2026/9/26')
    expect(paths).not.toContain('15:05')
    expect(paths).not.toContain('12332')
  })

  it('detects bare names in POSIX ls -l output, skipping permission bits', () => {
    const output = '-rw-r--r-- 1 winch winch 136 Sep 27 22:31 notes\ndrwxr-xr-x 3 winch winch 4096 Sep 26 10:00 src'
    const paths = detectListingPaths(output).map((item) => item.path)
    expect(paths).toContain('notes')
    expect(paths).toContain('src')
    expect(paths).not.toContain('-rw-r--r--')
    expect(paths).not.toContain('136')
  })

  it('detects names in plain multi-column ls output, including non-ASCII names', () => {
    const output = 'Desktop  Documents  迅雷下载  readme'
    const paths = detectListingPaths(output).map((item) => item.path)
    expect(paths).toEqual(['Desktop', 'Documents', '迅雷下载', 'readme'])
  })

  it('keeps offsets pointing at the original text', () => {
    const output = 'd-----  2026/9/26  15:05  Contacts'
    const found = detectListingPaths(output).find((item) => item.path === 'Contacts')
    expect(output.slice(found.start, found.end)).toBe('Contacts')
  })

  it('does not duplicate tokens already detected as standard paths', () => {
    const output = 'src/main.c  notes'
    const found = detectListingPaths(output)
    expect(found.filter((item) => item.path === 'src/main.c')).toHaveLength(1)
    expect(found.map((item) => item.path)).toEqual(['src/main.c', 'notes'])
  })

  it('round-trips through splitOutputByPaths with listing enabled', () => {
    const text = 'd-----  2026/9/26  15:05  Saved Games'
    const segments = splitOutputByPaths(text, { listing: true })
    expect(segments.map((segment) => segment.text).join('')).toBe(text)
    // 带空格的名字按既有约定不支持(漏检换低误报)
    expect(segments.find((segment) => segment.text === 'Saved')?.path?.path).toBe('Saved')
  })

  it('leaves free-text output untouched when listing is off', () => {
    const text = 'wrote notes today'
    expect(splitOutputByPaths(text, { listing: false }).every((segment) => !segment.path)).toBe(true)
    expect(splitOutputByPaths(text).every((segment) => !segment.path)).toBe(true)
  })
})

describe('FileMime', () => {
  it('maps extensions to mime with text/plain fallback', () => {
    expect(mimeFromPath('a/b.md')).toBe('text/markdown')
    expect(mimeFromPath('a/b.json')).toBe('application/json')
    expect(mimeFromPath('a/b.png')).toBe('image/png')
    expect(mimeFromPath('a/b.unknown-ext')).toBe('text/plain')
  })

  it('extracts lowercase extension, ignoring hidden files', () => {
    expect(fileExtension('a/b/C.MD')).toBe('md')
    expect(fileExtension('a/b/.gitignore')).toBe('')
    expect(fileExtension('a/b')).toBe('')
  })

  it('whitelists common embedded extensions and rejects numeric ones', () => {
    expect(isPathExtension('c')).toBe(true)
    expect(isPathExtension('hex')).toBe(true)
    expect(isPathExtension('log')).toBe(true)
    expect(isPathExtension('0')).toBe(false)
  })
})
