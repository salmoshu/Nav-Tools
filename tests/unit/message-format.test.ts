import { describe, expect, it } from 'vitest'
import { formatMessageContent } from '@/core/data/MessageFormat'

describe('message display format', () => {
  it('converts ASCII and UTF-8 text to uppercase HEX without spaces', () => {
    expect(formatMessageContent('Hello', 'ascii', 'hex')).toBe('48656C6C6F')
    expect(formatMessageContent('A中', 'ascii', 'hex')).toBe('41E4B8AD')
  })

  it('decodes HEX with optional whitespace back to text', () => {
    expect(formatMessageContent('48 65 6C 6C 6F', 'hex', 'ascii')).toBe('Hello')
    expect(formatMessageContent('41E4B8AD', 'hex', 'ascii')).toBe('A中')
  })

  it('preserves content when formats match or HEX is invalid', () => {
    expect(formatMessageContent('AABB', 'hex', 'hex')).toBe('AABB')
    expect(formatMessageContent('ABC', 'hex', 'ascii')).toBe('ABC')
    expect(formatMessageContent('XYZ', 'hex', 'ascii')).toBe('XYZ')
  })
})
