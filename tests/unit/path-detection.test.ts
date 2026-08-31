import { describe, expect, it } from 'vitest'
import { detectPaths, splitOutputByPaths } from '@/core/terminal/PathDetection'
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
