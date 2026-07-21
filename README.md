# Nav-Tools

<img src="https://raw.githubusercontent.com/salmoshu/Winchell-ImgBed/main/img/20251020-145700.jpg"/>

Nav-Tools 是一个基于 Electron + Vue 3 开发的桌面端工具，主要用于机器人开发调试过程中的数据可视化。目前已实现通用数据流 Flow、GNSS 定位和电机驱动等功能模块。

- 应用下载：https://github.com/salmoshu/Nav-Tools/releases
- 在线文档：https://salmoshu.github.io/robot/Nav-Tools/01-overview.html

---

## 特性

- **模块化结构**：目录结构清晰，方便添加新模块
- **应用选择器**：用户可创建应用并自由组合 Flow、GNSS、Motor 的任意窗口
- **多窗口支持**：支持多窗口并行调试
- **数据可视化**：提供时序图、轨迹图、控制台、仪表盘等展示方式
- **可配置**：支持字段扩展、滑窗、过滤、颜色配置、布局保存等功能

---

## 支持模块

<table>
  <tr>
    <th>应用</th>
    <th>模块名称</th>
    <th>功能描述</th>
  </tr>
  <tr>
    <td>ROBOT</td>
    <td>Flow</td>
    <td>通用数据流可视化（时序图、轨迹图、控制台）</td>
  </tr>
  <tr>
    <td>POS</td>
    <td>GNSS</td>
    <td>卫星定位模块（轨迹、信号、星空图）</td>
  </tr>
  <tr>
    <td>PNC</td>
    <td>Motor</td>
    <td>电机驱动的控制下发与数据可视化</td>
  </tr>
</table>

---

## 快速开始

```bash
# 克隆项目
git clone https://github.com/salmoshu/Nav-Tools.git
cd Nav-Tools

# 设置 electron 镜像（国内推荐）
echo "electron_mirror=https://npmmirror.com/mirrors/electron/" >> .npmrc

# 安装依赖
pnpm install
pnpm approve-builds # for electron, esbuild

# 启动开发环境
pnpm run dev
```

启动后会先显示应用选择器。新建应用时可自由选择窗口；点击应用卡片进入对应工作区，点击卡片右侧的新窗口按钮可同时打开多个应用。工作区内的任意面板也可通过标题栏的分离按钮单独打开。

## 开发指南

### 1. 添加新窗口

窗口和业务模块相互独立。先在 `src/settings/config.ts` 的 `windowCatalog` 中注册一次：

```ts
{
  id: 'map',
  moduleId: 'general',
  appMode: 'workspace',
  funcMode: 'general',
  action: 'map',
  title: 'Map',
  description: '显示定位轨迹',
  componentName: 'Map',
  componentPath: '@/components/panels/Map.vue',
  button: createButton('Map', 'map', 'Map'),
}
```

### 2. 创建组件与逻辑

- 通用窗口：`src/components/panels/Map.vue`
- 领域专用窗口：放入 `src/components/flow`、`gnss` 或 `motor`
- 每种能力只注册一个窗口，不要为不同模块创建转发包装组件

### 4. 状态显示

在 `src/stores/newModule.ts` 中定义状态字段，并在 `src/composables/useStatusManager.ts` 与 `src/components/StatusBar.vue` 中绑定使用。

### 5. 数据连接

在 `src/hooks/useDevice.ts` 中定义数据连接逻辑，支持文件、串口等多种通信方式

## 项目结构

```text
├─┬ electron
│ ├─┬ main
│ │ └── index.ts         # Electron 主进程入口
│ └─┬ preload
│   └── index.ts         # Preload 脚本入口
├─┬ src
│ ├── assets
│ ├── components         # 各模块可视化组件
│ ├── composables        # 模块逻辑钩子
│ ├── hooks              # 数据处理与设备通信
│ ├── stores             # 状态管理（Pinia）
│ ├─┬ types
│ │ ├── config.ts        # 模块配置类型
│ │ └── icon.ts          # 图标类型定义
│ ├── App.vue
│ └── main.ts            # Renderer 入口
├── index.html
├── package.json
└── vite.config.ts
```

## 可视化组件说明（按模块）

### Flow（机器人通用数据流）

- **Console**：日志输出、过滤、保存、暂停
- **Data**：时序图（支持双轴、滑窗、字段选择）
- **Deviation**：轨迹图（支持多轨迹、跟踪、缩放）

### GNSS（卫星定位）

- **Console**：NMEA 日志
- **Deviation**：轨迹图（单点解/浮点解/固定解）
- **Signal**：卫星信号强度表格（PRN、SNR、星座等）
- **Sky**：星空图（卫星分布）

### Motor（电机驱动）

- **Console**：日志输出
- **Data**：电机数据可视化（速度、角度）
- **Config**：电机参数调节面板（读指令、写指令）

## 技术栈

- 前端框架：Vue 3 + TypeScript
- 构建工具：Vite
- 桌面框架：Electron
- 状态管理：Pinia
- UI 框架：Element Plus
- 图表库：ECharts
- 通信方式：串口 / 文件输入
