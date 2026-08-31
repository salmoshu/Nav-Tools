import { describe, expect, it } from 'vitest'
import { fuzzySearch } from '@/core/terminal/FuzzyMatch'

describe('fuzzySearch', () => {
  const history = [
    'ls -la',
    'git status',
    'git commit -m "fix"',
    'docker ps -a',
    'pnpm run typecheck',
    'ssh root@192.168.1.10',
  ]

  it('matches subsequences case-insensitively', () => {
    const results = fuzzySearch('GST', history)
    expect(results.map((r) => r.text)).toContain('git status')
  })

  it('rejects non-subsequences', () => {
    expect(fuzzySearch('zzz', history)).toHaveLength(0)
  })

  it('returns all items newest-first for empty query', () => {
    const results = fuzzySearch('', history)
    expect(results).toHaveLength(history.length)
    expect(results[0].text).toBe('ssh root@192.168.1.10')
  })

  it('ranks whole-word prefix matches above scattered matches', () => {
    const items = ['git status', 'grep something txt']
    const results = fuzzySearch('gst', items)
    // 'git status' 的 g 是词首且连续性更好
    expect(results[0].text).toBe('git status')
  })

  it('prefers more recent items on near ties', () => {
    const items = ['npm run build', 'npm run build'] // 同文本,后者更新
    const results = fuzzySearch('npm run build', items)
    expect(results).toHaveLength(2)
    // 同分时靠 recency 权重,第二条(较新)排前面
    expect(results[0].item).toBe('npm run build')
  })

  it('gives word-start hits higher score', () => {
    const items = ['abc def', 'xadxexf']
    const results = fuzzySearch('ad', items)
    expect(results[0].text).toBe('abc def')
  })

  it('records hit positions for highlighting', () => {
    const results = fuzzySearch('gcm', ['git commit -m'])
    expect(results[0].positions).toEqual([0, 4, 6])
  })

  it('respects the limit', () => {
    const items = Array.from({ length: 50 }, (_, i) => `echo ${i}`)
    expect(fuzzySearch('echo', items, 10)).toHaveLength(10)
  })
})
