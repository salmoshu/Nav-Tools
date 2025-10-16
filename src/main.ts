import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import './hooks/useIpc'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { useDevice } from '@/hooks/useDevice'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import VirtualScroller from 'vue-virtual-scroller'

const app = createApp(App)
const pinia = createPinia()
const { removeCurrDevice } = useDevice()

// 使用Pinia
app.use(pinia)

// 使用VueVirtualScroller
app.use(VirtualScroller)

// 使用ElementPlus
app.use(ElementPlus)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app').$nextTick(() => {
  postMessage({ payload: 'removeLoading' }, '*')
})

window.addEventListener('beforeunload', () => {
  removeCurrDevice()
})
