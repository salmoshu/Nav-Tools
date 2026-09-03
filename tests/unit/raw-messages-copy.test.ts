import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('RawMessages copy order fix', () => {
  const source = readFileSync('src/components/windows/common/RawMessages.vue', 'utf8')

  it('sorts recycled scroller views before a drag selection starts', () => {
    // RecycleScroller 复用 DOM 节点导致行的 DOM 顺序与视觉顺序不一致,
    // 库自身只在滚动停止约 300ms 后才重排;在重排前拖选会按 DOM 顺序复制出无关行
    expect(source).toContain('@mousedown="sortMessageRows"')
    expect(source).toContain('scroller.sortViews()')
  })

  it('only reacts to the primary mouse button and guards the internal API', () => {
    expect(source).toContain('event.button !== 0')
    expect(source).toContain("typeof scroller.sortViews === 'function'")
  })
})
