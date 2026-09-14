import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStatusSources, registerStatusSource, unregisterStatusSource, type StatusSourceDefinition } from '../../src/core/status/registry'
import { createStatusSource } from '../../src/core/status/createStatusSource'
import { aggregateStatusSources } from '../../src/core/status/aggregate'

function source(id: string, label: string, moduleIds: string[], status: Record<string, unknown>): StatusSourceDefinition {
  const set = new Set(moduleIds)
  return createStatusSource({ id, label, match: ids => [...set].some(m => ids.has(m)), status: () => status })
}

afterEach(() => {
  for (const definition of getStatusSources()) unregisterStatusSource(definition.id)
  vi.restoreAllMocks()
})

describe('registry', () => {
  it('按注册顺序保存数据源', () => {
    registerStatusSource(source('a', 'A', ['x'], {}))
    registerStatusSource(source('b', 'B', ['x'], {}))
    expect(getStatusSources().map(s => s.id)).toEqual(['a', 'b'])
  })

  it('同 id 重复注册替换旧定义并保持原位置（HMR 幂等）', () => {
    registerStatusSource(source('a', 'A', ['x'], { v: 1 }))
    registerStatusSource(source('b', 'B', ['x'], {}))
    registerStatusSource(source('a', 'A', ['x'], { v: 2 }))
    const list = getStatusSources()
    expect(list.map(s => s.id)).toEqual(['a', 'b'])
    expect(list[0].getStatus()).toEqual({ v: 2 })
  })

  it('unregister 移除指定数据源', () => {
    registerStatusSource(source('a', 'A', ['x'], {}))
    unregisterStatusSource('a')
    expect(getStatusSources()).toHaveLength(0)
  })
})

describe('aggregateStatusSources', () => {
  it('moduleId 未命中时不产出字段', () => {
    registerStatusSource(source('a', 'A', ['flow'], { v: 1 }))
    expect(aggregateStatusSources(getStatusSources(), new Set(['gnss']))).toEqual({})
  })

  it('单源命中时保持裸字段名并过滤布尔值', () => {
    registerStatusSource(source('a', 'A', ['flow'], { visible: 1, hidden: true }))
    expect(aggregateStatusSources(getStatusSources(), new Set(['flow']))).toEqual({ visible: 1 })
  })

  it('多源命中时加 label 前缀', () => {
    registerStatusSource(source('a', 'Flow', ['flow'], { v: 1 }))
    registerStatusSource(source('b', 'GNSS', ['gnss'], { v: 2 }))
    expect(aggregateStatusSources(getStatusSources(), new Set(['flow', 'gnss']))).toEqual({
      'Flow.v': 1,
      'GNSS.v': 2,
    })
  })

  it('排序：在 order 中的字段按索引排前，未列出的保持原顺序跟在后面', () => {
    registerStatusSource(source('a', 'A', ['x'], { c: 1, a: 2, b: 3 }))
    expect(aggregateStatusSources(getStatusSources(), new Set(['x']), ['b', 'a'])).toEqual({
      b: 3,
      a: 2,
      c: 1,
    })
  })

  it('match 按 moduleId 集合判断，共享模块（general）不误伤数据源', () => {
    registerStatusSource(source('flow', 'Flow', ['flow', 'motor'], { v: 1 }))
    // camera 应用（terminal 面板 moduleId=general）不应点亮 Flow 源
    expect(aggregateStatusSources(getStatusSources(), new Set(['general']))).toEqual({})
    expect(aggregateStatusSources(getStatusSources(), new Set(['general', 'motor']))).toEqual({ v: 1 })
  })
})

describe('createStatusSource', () => {
  it('开发期对布尔字段警告一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const definition = createStatusSource({
      id: 'x', label: 'X', match: () => true,
      status: () => ({ on: true, v: 1 }),
    })
    definition.getStatus()
    definition.getStatus()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('on')
  })

  it('无布尔字段时不警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const definition = createStatusSource({
      id: 'x', label: 'X', match: () => true,
      status: () => ({ v: 1, name: 'ok' }),
    })
    definition.getStatus()
    expect(warn).not.toHaveBeenCalled()
  })
})
