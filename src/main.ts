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
// Kimi 品牌令牌最后引入：与 EP 变量同优先级时靠后生效
import './styles/kimi-tokens.css'
import './styles/interaction-spacing.css'
import VirtualScroller from 'vue-virtual-scroller'
import { i18n } from './i18n'

const app = createApp(App)
const pinia = createPinia()
const { removeCurrDevice } = useDevice()
const messageDefaults = { placement: 'bottom-right', offset: 50, showClose: true } as const

// Command-style messages (ElMessage.error/success/...) use this singleton
// instead of the plugin's injected configuration.
Object.assign(messageConfig, messageDefaults)

// 使用Pinia
app.use(pinia)

// 使用VueVirtualScroller
app.use(VirtualScroller)

// 使用ElementPlus
app.use(ElementPlus, {
  message: messageDefaults,
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
