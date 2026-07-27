import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default defineConfig({
  plugins: [vue(), monacoEditorPlugin({})],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Ensure a single copy of Vue is used across the app, Element Plus,
    // vue-i18n and vue-demi — otherwise the optimizer can split @vue/reactivity
    // and hit a "RefImpl is not a constructor" TDZ at runtime.
    dedupe: ['vue'],
  },
  // Pre-bundle the Vue family together so esbuild emits one self-contained
  // chunk with a correct __esm init order (avoids the RefImpl TDZ that
  // appears once vue-i18n/vue-demi add a second entry into `vue`).
  optimizeDeps: {
    include: [
      'vue',
      '@vue/shared',
      '@vue/reactivity',
      '@vue/runtime-core',
      '@vue/runtime-dom',
      'element-plus',
      '@element-plus/icons-vue',
      'vue-i18n',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
})
