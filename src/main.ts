import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import './hooks/useIpc'
import ElementPlus, { messageConfig } from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { useDevice } from '@/hooks/useDevice'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import VirtualScroller from 'vue-virtual-scroller'
import { i18n } from './i18n'

const app = createApp(App)
const pinia = createPinia()
const { removeCurrDevice } = useDevice()
const APP_HEADER_HEIGHT = 38
const MESSAGE_HEADER_GAP = 12
const MESSAGE_TOP_OFFSET = APP_HEADER_HEIGHT + MESSAGE_HEADER_GAP

// Command-style messages (ElMessage.error/success/...) use this singleton
// instead of the plugin's injected configuration.
messageConfig.offset = MESSAGE_TOP_OFFSET

// 使用Pinia
app.use(pinia)

// 使用VueVirtualScroller
app.use(VirtualScroller)

// 使用ElementPlus
app.use(ElementPlus, {
  message: {
    offset: MESSAGE_TOP_OFFSET,
  },
})

// 使用 vue-i18n（中英文）
app.use(i18n)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app').$nextTick(() => {
  postMessage({ payload: 'removeLoading' }, '*')
})

window.addEventListener('beforeunload', () => {
  removeCurrDevice()
})
