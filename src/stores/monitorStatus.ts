import { reactive } from 'vue'

// 全局唯一的响应式对象
export const monitorStatus = reactive<Record<string, any>>({})

export function emptyMonitorStatus() {
  Object.keys(monitorStatus).forEach(k => delete monitorStatus[k])
}
