# Nav-Tools

🥳 Really simple `Electron` + `Vue` + `Vite` boilerplate.

<!-- [![awesome-vite](https://awesome.re/mentioned-badge.svg)](https://github.com/vitejs/awesome-vite) -->
<!-- [![Netlify Status](https://api.netlify.com/api/v1/badges/ae3863e3-1aec-4eb1-8f9f-1890af56929d/deploy-status)](https://app.netlify.com/sites/electron-vite/deploys) -->
<!-- [![GitHub license](https://img.shields.io/github/license/caoxiemeihao/electron-vite-vue)](https://github.com/electron-vite/electron-vite-vue/blob/main/LICENSE) -->
<!-- [![GitHub stars](https://img.shields.io/github/stars/caoxiemeihao/electron-vite-vue?color=fa6470)](https://github.com/electron-vite/electron-vite-vue) -->
<!-- [![GitHub forks](https://img.shields.io/github/forks/caoxiemeihao/electron-vite-vue)](https://github.com/electron-vite/electron-vite-vue) -->

[![GitHub Build](https://github.com/electron-vite/electron-vite-vue/actions/workflows/build.yml/badge.svg)](https://github.com/electron-vite/electron-vite-vue/actions/workflows/build.yml)
[![GitHub Discord](https://img.shields.io/badge/chat-discord-blue?logo=discord)](https://discord.gg/sRqjYpEAUK)

## Features

📦 Out of the box  
🎯 Based on the official [template-vue-ts](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-vue-ts), less invasive  
🌱 Extensible, really simple directory structure  
💪 Support using Node.js API in Electron-Renderer  
🔩 Support C/C++ native addons  
🖥 It's easy to implement multiple windows

## Applications

1. PNC
   - Follow
   - BehaviorTree
2. POS
   - GNSS
   - IMU
   - Vision

## Quick Setup

```sh
# clone the project
git clone https://github.com/salmoshu/Nav-Tools.git

# enter the project directory
cd Nav-Tools

# set pnpm mirror in .npmrc
electron_mirror=https://npmmirror.com/mirrors/electron/

# install dependency
pnpm install
pnpm approve-builds # for electron, esbuild

# develop
pnpm run dev
```

## Development Process

1. 在 `src\types\config.ts` 的 `appConfig` 中配置应用信息

   ```typescript
      example:                                  // example 为新 App 名称，会加载在 Electron 窗口上
      {
         module: {
            demo1: createModuleItem({
               title: 'Demo1',                  // 模块名称（与 module 的键名相同，采用 PascalCase 命名规范）
               icon: toolBarIcon.default,       // 模块图标
               action: ['draw', 'data', 'config'], // 模块包含的子模块（draw、data、config）
            }),
            demo2: createModuleItem({
               title: 'Demo2',
               icon: toolBarIcon.default,
               action: ['draw', 'data', 'config'],
            }),
            ...
         }
      },

   ```

2. 在 AppMode 和 FuncMode 中增加相应的枚举

   ```typescript
   export enum AppMode {
      Example = 'Example',
      ...
   }
   ```

   ```typescript
   export enum FuncMode {
      Demo1 = 10,
      Demo2 = 11,
      ...
   }
   ```

3. 在 `src\components` 和 `src\composables` 目录下增加相应的组件和钩子

   ```text
   # 组件和钩子采用扁平化文件结构
   src
   ├── components
   │   ├── demo1
   │   │   ├── Demo1Draw.vue
   │   │   ├── Demo1Data.vue
   │   │   └── Demo1Config.vue
   │   ├── demo2
   │   │   ├── Demo2Draw.vue
   │   │   ├── Demo2Data.vue
   │   │   └── Demo2Config.vue
   │   └── ...
   ├── composables
   │   ├── demo1
   │   │   └── useDemo1Props.ts
   │   ├── demo2
   │   │   └── useDemo2Props.ts
   │   └── ...
   ```

## Debug

![electron-vite-react-debug.gif](https://github.com/electron-vite/electron-vite-react/blob/main/electron-vite-react-debug.gif?raw=true)

## Directory

```diff
+ ├─┬ electron
+ │ ├─┬ main
+ │ │ └── index.ts    entry of Electron-Main
+ │ └─┬ preload
+ │   └── index.ts    entry of Preload-Scripts
  ├─┬ src
  │ └── main.ts       entry of Electron-Renderer
  ├── index.html
  ├── package.json
  └── vite.config.ts
```

<!--
## Be aware

🚨 By default, this template integrates Node.js in the Renderer process. If you don't need it, you just remove the option below. [Because it will modify the default config of Vite](https://github.com/electron-vite/vite-plugin-electron-renderer#config-presets-opinionated).

```diff
# vite.config.ts

export default {
  plugins: [
-   // Use Node.js API in the Renderer-process
-   renderer({
-     nodeIntegration: true,
-   }),
  ],
}
```
-->

## FAQ

- [C/C++ addons, Node.js modules - Pre-Bundling](https://github.com/electron-vite/vite-plugin-electron-renderer#dependency-pre-bundling)
- [dependencies vs devDependencies](https://github.com/electron-vite/vite-plugin-electron-renderer#dependencies-vs-devdependencies)
