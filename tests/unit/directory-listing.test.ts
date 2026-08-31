import { describe, expect, it } from 'vitest'
import { parseFindListing, sortDirectoryEntries } from '@/core/terminal/DirectoryListing'

/** 拼一条 `find -printf '%y\t%s\t%T@\t%f\n'` 记录 */
function record(type: string, size: unknown, mtime: unknown, name: string): string {
  return `${type}\t${size}\t${mtime}\t${name}`
}

describe('parseFindListing', () => {
  it('maps find fields onto entries and puts directories first', () => {
    const output = [
      record('f', 12, 1700000001.5, 'README.md'),
      record('d', 4096, 1700000000, 'src'),
    ].join('\n')
    expect(parseFindListing(output, '/home/user')).toEqual([
      {
        name: 'src',
        path: '/home/user/src',
        directory: true,
        size: 4096,
        modifiedAt: 1700000000000,
        mode: 0,
      },
      {
        name: 'README.md',
        path: '/home/user/README.md',
        directory: false,
        size: 12,
        modifiedAt: 1700000001500,
        mode: 0,
      },
    ])
  })

  it('keeps tab characters inside the file name', () => {
    const entries = parseFindListing(record('f', 3, 0, 'a\tb\tc'), '/x')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('a\tb\tc')
    expect(entries[0].path).toBe('/x/a\tb\tc')
  })

  it('never doubles the separator for the root directory', () => {
    expect(parseFindListing(record('d', 0, 0, 'etc'), '/')[0].path).toBe('/etc')
    expect(parseFindListing(record('d', 0, 0, 'b'), '/a/')[0].path).toBe('/a/b')
  })

  it('drops malformed records instead of emitting partial entries', () => {
    const output = ['f\t12\t1.5\tkeep', 'f\t12', 'no-tabs-here', ''].join('\n')
    const entries = parseFindListing(output, '/x')
    expect(entries.map((entry) => entry.name)).toEqual(['keep'])
  })

  it('falls back to 0 for unparsable numbers', () => {
    const entry = parseFindListing(record('f', 'n/a', 'n/a', 'blob'), '/x')[0]
    expect(entry.size).toBe(0)
    expect(entry.modifiedAt).toBe(0)
  })

  it('returns an empty list for empty output', () => {
    expect(parseFindListing('', '/x')).toEqual([])
  })
})

describe('sortDirectoryEntries', () => {
  it('sorts directories before files, then by name', () => {
    const entries = [
      { name: 'b.txt', directory: false },
      { name: 'a-dir', directory: true },
      { name: 'a.txt', directory: false },
    ].map((entry) => ({
      ...entry,
      path: `/${entry.name}`,
      size: 0,
      modifiedAt: 0,
      mode: 0,
    }))
    expect(sortDirectoryEntries(entries).map((entry) => entry.name)).toEqual([
      'a-dir',
      'a.txt',
      'b.txt',
    ])
  })
})
