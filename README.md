# Nav-Tools

🥳 Nav-Tools is a desktop-grade visualization workbench built with Electron & Vue3, tailored for roboticists.

<!-- [![awesome-vite](https://awesome.re/mentioned-badge.svg)](https://github.com/vitejs/awesome-vite) -->
<!-- [![Netlify Status](https://api.netlify.com/api/v1/badges/ae3863e3-1aec-4eb1-8f9f-1890af56929d/deploy-status)](https://app.netlify.com/sites/electron-vite/deploys) -->
<!-- [![GitHub license](https://img.shields.io/github/license/caoxiemeihao/electron-vite-vue)](https://github.com/electron-vite/electron-vite-vue/blob/main/LICENSE) -->
<!-- [![GitHub stars](https://img.shields.io/github/stars/caoxiemeihao/electron-vite-vue?color=fa6470)](https://github.com/electron-vite/electron-vite-vue) -->
<!-- [![GitHub forks](https://img.shields.io/github/forks/caoxiemeihao/electron-vite-vue)](https://github.com/electron-vite/electron-vite-vue) -->

<!-- [![GitHub Build](https://github.com/electron-vite/electron-vite-vue/actions/workflows/build.yml/badge.svg)](https://github.com/electron-vite/electron-vite-vue/actions/workflows/build.yml)
[![GitHub Discord](https://img.shields.io/badge/chat-discord-blue?logo=discord)](https://discord.gg/sRqjYpEAUK) -->

## Features

📦 Out of the box  
🎯 Based on the official [template-vue-ts](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-vue-ts), less invasive  
🌱 Extensible, really simple directory structure  
💪 Support using Node.js API in Electron-Renderer  
🔩 Support C/C++ native addons  
🖥 It's easy to implement multiple windows

## Applications

1. ROBOT
   - Follow: 跟随机器人
2. PNC
   - Ultrasonic: 超声波传感器
3. PNC
   - FollowSim: PID跟随仿真
4. POS
   - GNSS:  GNSS定位

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
      },

   ```

2. 在 `src\components` 和 `src\composables` 目录下增加相应的组件和钩子

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

3. 在 `src\stores` 目录下增加相应的组件间状态管理文件（这里使用了 Pinia）

   ```text
   src
   ├── stores
   │   ├── demo1.ts
   │   ├── demo2.ts
   │   └── ...
   ```

4. 模块运行状态
   - 在 `src\stores\demo1.ts` 中增加相应的状态字段 `status`
   - 在 `src\composables\useStatusManager.ts` 中应用 Pinia 定义好的状态
   - 在 `src\components\StatusBar.vue` 中应用状态

## Externel Tools

1. Echarts
2. Element-Plus

## Debug

![electron-vite-react-debug.gif](https://github.com/electron-vite/electron-vite-react/blob/main/electron-vite-react-debug.gif?raw=true)

## Directory

```diff
  ├─┬ electron
  │ ├─┬ main
  │ │ └── index.ts    entry of Electron-Main
  │ └─┬ preload
  │   └── index.ts    entry of Preload-Scripts
  ├─┬ src
  │ ├── assets
  │ ├── components
  │ ├── composables
  │ ├── hooks
  │ ├── stores
  │ ├─┬ types
  │ │ ├── config.ts    types of app config
  │ │ └── icon.ts      types of icon
  │ ├── App.vue
  │ ├── main.ts       entry of Electron-Renderer
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

## Release

0.1.0: 初始版本
