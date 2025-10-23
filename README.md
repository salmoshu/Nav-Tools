# Nav-Tools

<img src="https://raw.githubusercontent.com/salmoshu/Winchell-ImgBed/main/img/20251020-145700.jpg"/>

🥳 Nav-Tools 是一款专为机器人开发者打造的**桌面级可视化工作台**，全面覆盖机器人复合应用与主流传感器。目前已集成通用数据流 Flow、GNSS 定位模块、超声波避障、PID 跟随仿真和电机驱动等功能，支持布局与数据字段的灵活自定义，极大提升调试效率与开发体验。更多请查看：

- 应用下载：https://github.com/salmoshu/Nav-Tools/releases
- 在线文档：https://salmoshu.github.io/robot/Nav-Tools/01-overview.html

---

## ✨ 核心特性

- 🌱 **简洁可扩展**：目录结构清晰，支持快速添加新模块
- 🖥 **多窗口支持**：轻松实现多窗口并行调试
- 📊 **实时可视化**：支持时序图、轨迹图、控制台、仪表盘等多种展示方式
- 🧩 **高度自定义**：支持字段扩展、滑窗、过滤、颜色配置、布局保存等高级功能

---

## 🧪 支持模块与应用

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
    <td>PERC</td>
    <td>Ultrasonic</td>
    <td>超声波避障数据可视化（滤波、障碍物检测）</td>
  </tr>
  <tr>
    <td>POS</td>
    <td>GNSS</td>
    <td>卫星定位模块（轨迹、信号、星空图）</td>
  </tr>
  <tr>
    <td rowspan="2">PNC</td>
    <td>Motor</td>
    <td>电机驱动的控制下发与数据可视化</td>
  </tr>
  <tr>
    <td>FollowSim</td>
    <td>PID 跟随仿真（仪表盘、速度曲线、参数配置）</td>
  </tr>
</table>

---

## 🚀 快速开始

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

## 🛠 开发指南

### 1. 添加新模块

在 `src/types/config.ts` 的 `appConfig` 中添加模块配置：

```ts
newModule: createModuleItem({
  title: 'NewModule',
  icon: toolBarIcon.default,
  action: ['draw', 'data', 'config'],
})
```

### 2. 创建组件与逻辑

- 组件：`src/components/newModule/NewModuleDraw.vue`、`NewModuleData.vue`、`NewModuleConfig.vue`
- 逻辑：`src/composables/newModule/useNewModuleProps.ts`
- 状态管理：`src/stores/newModule.ts`

### 4. 状态显示

在 `src/stores/newModule.ts` 中定义状态字段，并在 `src/composables/useStatusManager.ts` 与 `src/components/StatusBar.vue` 中绑定使用。

### 5. 数据连接

在 `src/hooks/useDevice.ts` 中定义数据连接逻辑，支持文件、串口等多种通信方式

## 📁 项目结构

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

## 📈 可视化组件说明（按模块）

### Flow（机器人通用数据流）

- **Console**：日志输出、过滤、保存、暂停
- **Data**：时序图（支持双轴、滑窗、字段选择）
- **Deviation**：轨迹图（支持多轨迹、跟踪、缩放）

### Ultrasonic（超声波避障）

- **Console**：日志输出
- **Data**：滤波后的距离曲线（支持中值滤波、障碍物检测）

### GNSS（卫星定位）

- **Console**：NMEA 日志
- **Deviation**：轨迹图（单点解/浮点解/固定解）
- **Signal**：卫星信号强度表格（PRN、SNR、星座等）
- **Sky**：星空图（卫星分布）

### Motor（电机驱动）

- **Console**：日志输出
- **Data**：电机数据可视化（速度、角度）
- **Config**：电机参数调节面板（读指令、写指令）

### FollowSim（PID 跟随仿真）

- **Dashboard**：二维动画展示
- **Data**：速度曲线（线速度、角速度）
- **Config**：PID 参数调节面板

## 🧩 技术栈

- 前端框架：Vue 3 + TypeScript
- 构建工具：Vite
- 桌面框架：Electron
- 状态管理：Pinia
- UI 框架：Element Plus
- 图表库：ECharts
- 通信方式：串口 / 文件输入
