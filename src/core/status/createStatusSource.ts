import type { StatusSourceDefinition } from './registry'

export interface CreateStatusSourceOptions {
  id: string
  label: string
  match: (moduleIds: ReadonlySet<string>) => boolean
  /** 响应式取值函数；store 的 computed/ref 解包后的对象均可 */
  status: () => Record<string, unknown>
}

/**
 * 数据源工厂：组件约定统一的落点。当前校验：status 快照里出现布尔值时
 * 在开发期警告一次（布尔会被聚合层静默过滤，几乎总是不符合预期）。
 */
export function createStatusSource(options: CreateStatusSourceOptions): StatusSourceDefinition {
  let booleanWarned = false
  return {
    id: options.id,
    label: options.label,
    match: options.match,
    getStatus() {
      const status = options.status()
      if (import.meta.env.DEV && !booleanWarned) {
        const booleans = Object.keys(status).filter(key => typeof status[key] === 'boolean')
        if (booleans.length > 0) {
          booleanWarned = true
          console.warn(
            `[status] source "${options.id}" 的布尔字段将被过滤，请转成数值/字符串: ${booleans.join(', ')}`,
          )
        }
      }
      return status
    },
  }
}
