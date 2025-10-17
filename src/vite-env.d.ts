/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'vue-virtual-scroller' {
  import { DefineComponent } from 'vue'

  export const RecycleScroller: DefineComponent<any, any, any>
  export const DynamicScroller: DefineComponent<any, any, any>
  export const DynamicScrollerItem: DefineComponent<any, any, any>

  const plugin: { install: any }
  export default plugin
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
}


