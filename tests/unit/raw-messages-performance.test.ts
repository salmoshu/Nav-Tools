import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Raw Messages realtime rendering', () => {
  const source = readFileSync('src/components/windows/common/RawMessages.vue', 'utf8')

  it('uses fixed-height recycling without synchronous scroll measurements', () => {
    expect(source).toContain('<RecycleScroller')
    expect(source).toContain(':item-size="25"')
    expect(source).not.toContain('<DynamicScroller')
    expect(source).not.toContain('el.scrollHeight')
  })
})
