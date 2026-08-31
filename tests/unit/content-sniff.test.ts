import { describe, expect, it } from 'vitest'
import { sniffContent } from '@/core/terminal/ContentSniff'

describe('sniffContent', () => {
  describe('json', () => {
    it('detects object and array json', () => {
      expect(sniffContent('{"a": 1}')).toBe('json')
      expect(sniffContent('[1, 2, 3]')).toBe('json')
      expect(sniffContent('{\n  "name": "nav",\n  "version": 2\n}')).toBe('json')
    })

    it('rejects scalar json and broken json', () => {
      expect(sniffContent('42')).toBeNull()
      expect(sniffContent('true')).toBeNull()
      expect(sniffContent('{"a": 1,,}')).toBeNull()
      expect(sniffContent('{"a": 1\n{"b": 2}')).toBeNull()
    })

    it('rejects json embedded in other text', () => {
      expect(sniffContent('result: {"a": 1}')).toBeNull()
    })
  })

  describe('csv', () => {
    it('detects comma-separated tables with consistent columns', () => {
      expect(sniffContent('name,age\nalice,30\nbob,25')).toBe('csv')
    })

    it('detects tab-separated tables', () => {
      expect(sniffContent('a\tb\n1\t2\n3\t4')).toBe('csv')
    })

    it('rejects inconsistent column counts', () => {
      expect(sniffContent('a,b\n1\n2,3')).toBeNull()
    })

    it('rejects single-column text and prose with commas', () => {
      expect(sniffContent('a\nb\nc')).toBeNull()
      expect(sniffContent('line one, with comma\nline two, also comma')).toBeNull()
    })

    it('rejects too few lines', () => {
      expect(sniffContent('a,b\n1,2')).toBeNull()
    })
  })

  describe('markdown', () => {
    it('detects fenced code blocks', () => {
      expect(sniffContent('title\n\n```\ncode here\n```')).toBe('markdown')
    })

    it('detects mixed headings and lists', () => {
      expect(sniffContent('# Title\n\n- item one\n- item two')).toBe('markdown')
    })

    it('detects headings with links and emphasis', () => {
      expect(sniffContent('# Readme\n\nSee [docs](https://example.com) for **details**.')).toBe(
        'markdown',
      )
    })

    it('rejects plain command output that only looks slightly like markdown', () => {
      // 编译器输出里的单个 `- ` 前缀行,不足以判定
      expect(sniffContent('building...\n- warning: unused variable\n- warning: unused import')).toBeNull()
    })

    it('rejects ordinary text', () => {
      expect(sniffContent('total 12\ndrwxr-xr-x 2 user user 4096 Jan 1 10:00 .\nhello world')).toBeNull()
    })
  })

  describe('bounds', () => {
    it('returns null for empty and oversized input', () => {
      expect(sniffContent('')).toBeNull()
      expect(sniffContent('   \n  ')).toBeNull()
      expect(sniffContent('x'.repeat(200_001))).toBeNull()
    })

    it('json wins over other candidates (checked first)', () => {
      // JSON 数组里恰好每行都有逗号,不能被误判成 CSV
      expect(sniffContent('[\n  {"a": 1, "b": 2},\n  {"a": 3, "b": 4}\n]')).toBe('json')
    })
  })
})
