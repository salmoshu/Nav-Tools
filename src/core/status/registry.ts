import { shallowRef } from 'vue'

/**
 * Status View 的一个数据源声明。各组件在自己的模块里就近注册
 * （stores/flow.ts、stores/gnss.ts 等），聚合层（aggregate.ts）只按
 * match 命中并拼接，不感知具体组件。
 */
export interface StatusSourceDefinition {
  /** 唯一 id；重复注册时替换旧定义并保持原位置（HMR 幂等） */
  id: string
  /** 多源聚合时的字段前缀，如 'Flow'/'GNSS'；字段名会变成 `${label}.${key}` */
  label: string
  /**
   * 命中条件：按当前应用包含面板的 moduleId 集合判断
   * （见 core/panels/registry.ts）。不要按 funcMode 匹配——
   * 'general' 是共享面板（plot/raw-messages/terminal）的 funcMode，会误伤。
   */
  match: (moduleIds: ReadonlySet<string>) => boolean
  /**
   * 返回当前状态快照。注意：布尔值会被聚合层过滤（不显示），
   * 需要展示的状态请自行转成数值或字符串。
   */
  getStatus: () => Record<string, unknown>
}

const sources = shallowRef<readonly StatusSourceDefinition[]>([])

/** 幂等注册：同 id 替换并保持原位置，便于 HMR 与重复加载 */
export function registerStatusSource(definition: StatusSourceDefinition): void {
  const list = sources.value
  const index = list.findIndex(source => source.id === definition.id)
  if (index === -1) {
    sources.value = [...list, definition]
    return
  }
  const next = list.slice()
  next[index] = definition
  sources.value = next
}

export function unregisterStatusSource(id: string): void {
  sources.value = sources.value.filter(source => source.id !== id)
}

export function getStatusSources(): readonly StatusSourceDefinition[] {
  return sources.value
}
