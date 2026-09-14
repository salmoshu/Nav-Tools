import type { StatusEntry } from './statusValue'
import { filterDisplayableStatusEntries } from './statusValue'
import type { StatusSourceDefinition } from './registry'

/**
 * 纯函数聚合：按 moduleId 命中数据源 → 布尔值过滤 →
 * 单源保持裸字段名 / 多源加 `${label}.` 前缀 → 按 order 排序。
 * 与既有 Status View 行为逐条对齐（单源与多源都应用用户排序）。
 */
export function aggregateStatusSources(
  sources: readonly StatusSourceDefinition[],
  moduleIds: ReadonlySet<string>,
  order: readonly string[] = [],
): Record<string, unknown> {
  const matched = sources.filter(source => source.match(moduleIds))

  if (matched.length === 1) {
    return Object.fromEntries(
      orderEntries(filterDisplayableStatusEntries(Object.entries(matched[0].getStatus())), order),
    )
  }

  return Object.fromEntries(
    orderEntries(
      matched.flatMap(source =>
        filterDisplayableStatusEntries(Object.entries(source.getStatus())).map(
          ([key, value]): StatusEntry => [`${source.label}.${key}`, value],
        ),
      ),
      order,
    ),
  )
}

/** 与用户拖拽排序语义一致：在 order 中的字段按其索引排前，不在的保持原顺序跟在后面 */
function orderEntries(entries: StatusEntry[], order: readonly string[]): StatusEntry[] {
  const orderMap = new Map(order.map((key, index) => [key, index]))
  return entries.sort((a, b) => {
    const indexA = orderMap.get(a[0])
    const indexB = orderMap.get(b[0])
    if (indexA !== undefined && indexB !== undefined) return indexA - indexB
    if (indexA !== undefined) return -1
    if (indexB !== undefined) return 1
    return 0
  })
}
