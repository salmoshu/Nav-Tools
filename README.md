# Nav-Tools

<img src="https://raw.githubusercontent.com/salmoshu/Winchell-ImgBed/main/img/20251020-145700.jpg" alt="Nav-Tools 界面预览" />

Nav-Tools 是一个基于 Electron + Vue 3 的机器人开发调试工作台。它以“应用”组织窗口组件，支持实时数据接入、可视化、固件升级、终端会话、RTSP 相机播放、布局管理以及多窗口协同。

- 应用下载：https://github.com/salmoshu/Nav-Tools/releases
- 在线文档：https://salmoshu.github.io/robot/Nav-Tools/01-overview.html

---

## 特性

- **应用工作区**：内置 GNSS、Motor 和 Camera 应用，也可自定义应用名称、描述、主题色、图标及所包含的窗口。
- **丰富的应用选择器**：提供 20 种应用图标；窗口选项展示图标、说明和所属类别；应用卡片支持拖拽排序并持久化自定义顺序。
- **灵活的窗口布局**：支持拖动、缩放、自动布局、布局保存和全屏展示；全屏 Header 会适配明暗主题。
- **多窗口协同**：应用可单独打开，组件也可分离为独立窗口；独立窗口显示组件名称，并支持还原到主窗口和保持置顶。
- **统一的窗口图标**：应用编辑器、Toolbar 和组件标题共享同一套窗口图标。
- **统一数据源管理**：`Input` 集中配置文件、串口、TCP、UDP、Camera RTSP 地址以及 Raw、JSON、NMEA 解析方式，并持久化连接参数。
- **RTSP 相机播放**：Camera Video 使用 `Input` 中的 RTSP 数据源和内置 FFmpeg，支持播放/暂停、UDP/TCP 自动回退、连接状态提示、画面缩放和平移。
- **通用 IAP 升级**：Raw Messages 复用当前串口执行固件升级，内置 IGK IAP 模板，并支持结构化协议配置、校验算法、模板导入导出、失败重试及串口恢复。
- **集成终端**：支持本地 Shell、PowerShell、CMD、Git Bash、WSL 和 SSH；提供终端类型菜单、可恢复标签页与递归分屏、可拉伸 SFTP 面板、断线原位重连及 SSH 本地、远程、SOCKS 端口转发。
- **友好的弹框交互**：弹框可使用 `Esc` 关闭，也可点击遮罩区域关闭。
- **主题支持**：支持跟随系统、浅色和深色三种主题模式。

---

## 支持的窗口组件

| 类别  | 窗口             | 功能                                                     |
| ----- | ---------------- | -------------------------------------------------------- |
| 通用  | Plot             | 绘制数值数据随时间的变化，支持字段、颜色、滑窗和双轴配置 |
| 通用  | Raw Messages     | 查看、筛选、暂停、保存原始消息，并通过当前串口执行 IAP   |
| 通用  | Terminal         | 本地、WSL、SSH 终端，支持分屏、SFTP 和 SSH 端口转发      |
| 通用  | Camera Video     | 播放 RTSP 实时视频，支持缩放、平移和画面标签提示         |
| Flow  | Flow Deviation   | 分析 Flow 轨迹与偏差                                     |
| GNSS  | GNSS Deviation   | 展示定位轨迹和定位状态                                   |
| GNSS  | GNSS Signals     | 查看卫星信号强度与状态                                   |
| GNSS  | Sky Plot         | 查看卫星方位角和高度角分布                               |
| Motor | Motor Parameters | 读取、配置和下发电机参数                                 |

应用与窗口相互独立。同一个通用窗口可以被多个应用复用，用户也可以在应用编辑器中自由组合上述窗口。

---

## 快速开始

```bash
# 克隆项目
git clone https://github.com/salmoshu/Nav-Tools.git
cd Nav-Tools

# 可选：设置 Electron 国内镜像
echo "electron_mirror=https://npmmirror.com/mirrors/electron/" >> .npmrc

# 安装依赖
pnpm install

# 如 pnpm 提示需要批准构建脚本，请选择 electron、esbuild 和 ffmpeg-static
pnpm approve-builds

# 启动桌面开发环境
pnpm run dev
```

启动后会显示应用选择器：

1. 选择 GNSS、Motor 或 Camera 默认应用，或者新建自定义应用。
2. 使用 Toolbar 的 `Input` 打开数据接入弹框，配置文件、串口、TCP、UDP 或 Camera RTSP 数据源及其解析方式。
3. 拖动组件 Header 调整位置，拖动组件右下角调整大小。
4. 使用组件 Header 中的按钮进行分离、全屏或移除。
5. 弹框可以按 `Esc` 或点击弹框外区域关闭。

### Camera Video

1. 打开默认 Camera 应用，或在自定义应用中添加 `Camera Video`。
2. 使用 Toolbar 的 `Input`，在 `Camera RTSP` 数据源中配置地址，例如 `rtsp://192.168.3.14:8554/rgbstream`；也可以点击画面下方的数据源信息快速打开配置。
3. 点击“播放”开始连接；播放中点击“暂停”，之后可再次点击“播放”重新启动。
4. 在画面上滚动鼠标滚轮进行缩放，放大后按住左键拖动平移，双击恢复原始比例。
5. 客户端会先尝试 UDP；连接失败或超时未收到画面时自动回退 TCP，并显示更具体的 FFmpeg 错误信息。

> RTSP 播放依赖 Electron 主进程和内置 FFmpeg，仅桌面版可用。

### IAP 固件升级

1. 通过 `Input` 连接目标串口，再打开 `Raw Messages` 并点击 `IAP`。
2. 选择固件。默认的 `IGK IAP` 模板使用 115200 波特率、1024 字节包和 5000 ms 超时；需要适配其他设备时可勾选“高级”配置帧头、命令、ACK、字节序、校验算法和重试参数。
3. 开始升级后，进度只在设备返回有效 ACK 时增长；串口关闭、拒绝访问、ACK 错误或超时都会停止升级并显示错误，不会误报成功。
4. 升级成功、失败或取消后，Nav-Tools 会尝试恢复升级前的串口连接和波特率。

> IAP 需要设备端 Bootloader 与所选协议模板匹配。内置模板兼容 IGK IAP；其他厂商协议可通过命名模板和 JSON 导入导出进行配置。

### Terminal

1. 将 `Terminal` 添加到任意应用；点击标签栏末尾的 `+` 可直接选择本地 Shell、WSL、SSH 或空终端。窗格右上角提供独立的向右和向下拆分按钮。
2. Windows 支持 PowerShell、CMD、已检测到的 Git Bash 和 WSL 发行版；Linux/macOS 使用系统 Shell。SSH 支持密码、私钥/口令和 SSH Agent，连接配置不会保存密码或口令。
3. SSH 首次连接会确认并记录主机指纹，指纹变更时会阻止连接。Nav-Tools 也会读取 `~/.ssh/config` 中的 `Host`、`HostName`、`User`、`Port`、`IdentityFile` 和 `ProxyJump`。
4. SSH 会话可打开 SFTP 面板并拖动边缘调整宽度，进行上传、下载、新建目录、重命名和删除；端口转发支持 Local (`-L`)、Remote (`-R`) 和 SOCKS (`-D`) 多规则配置。
5. 标签页、活动标签、递归分屏布局和终端类型会持久化。重启后本地 Shell/WSL 会自动恢复；SSH 会保留连接配置并要求重新认证，不保存密码或口令。
6. 会话断开或异常退出后，原窗格会显示重连入口；快捷键可在“设置 → 快捷键 → 终端”中修改并恢复默认。

> 关闭活动窗格、标签页或整个 Terminal 组件前会要求确认；确认后会终止关联 Shell、SSH、SFTP 传输和端口转发。

---

## 开发指南

### 1. 添加新窗口

在 `src/core/panels/registry.ts` 的 `panelRegistry` 中注册窗口：

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
  componentPath: '@/components/windows/common/Map.vue',
}
```

字段说明：

- `id`：窗口的稳定标识，用于应用配置和布局持久化。
- `funcMode`：数据路由类别，目前支持 `general`、`flow`、`gnss` 和 `motor`。
- `action`：Toolbar 事件及窗口图标映射键。
- `componentName`：Vue 组件名称。
- `componentPath`：组件文件路径。

### 2. 创建窗口组件

- 通用窗口：`src/components/windows/common/`
- GNSS 窗口：`src/components/windows/gnss/`
- Motor 窗口：`src/components/windows/motor/`

Dashboard 和独立窗口使用 `import.meta.glob` 加载这些目录中的组件。若新增其他一级目录，需要同步扩展对应的 glob 配置。

### 3. 配置窗口图标

在 `src/settings/panelIcons.ts` 中为 `action` 添加 Element Plus 图标。该映射会同时应用于：

- 应用编辑器的窗口列表
- Toolbar 的窗口按钮
- 普通和全屏组件标题

应用卡片使用的图标位于 `src/settings/applicationIcons.ts`。

### 4. 添加默认应用

默认应用配置位于 `src/core/application/ApplicationStorage.ts`。应用通过 `windowIds` 引用窗口注册表中的 `id`。

### 5. 状态与数据连接

- 状态字段：`src/stores/`
- 数据路由：`src/core/data/IncomingDataRouter.ts`
- 数据源配置与迁移：`src/core/data/DataSourceStorage.ts`
- 设备与输入协调：`src/hooks/useDevice.ts`
- 串口服务：`src/core/serial/SerialService.ts`
- 网络服务：`src/core/network/NetworkService.ts`

---

## 项目结构

```text
├─┬ electron
│ ├─┬ main
│ │ ├── index.ts                     # Electron 主进程入口与窗口 IPC
│ │ └─┬ services
│ │   ├── CameraStreamService.ts     # RTSP、FFmpeg 与视频帧处理
│ │   ├── IapUpgradeService.ts       # 串口 IAP 升级状态机
│ │   ├── NetworkConnectionService.ts
│ │   ├── SerialPortService.ts
│ │   └── TerminalService.ts         # PTY、SSH、SFTP 与端口转发
│ └─┬ preload
│   └── index.ts                     # 安全暴露桌面 API
├─┬ src
│ ├─┬ components
│ │ ├── AppHeader.vue
│ │ ├── ApplicationSelector.vue
│ │ ├── ApplicationEditor.vue
│ │ ├── Dashboard.vue
│ │ ├── ToolBar.vue
│ │ └─┬ windows                      # 可视化窗口组件
│ │   ├── common
│ │   ├── gnss
│ │   └── motor
│ ├── composables                    # 应用、布局、主题和状态逻辑
│ ├─┬ core                           # 可测试的核心服务
│ │ ├── application
│ │ ├── camera
│ │ ├── data
│ │ ├── iap
│ │ ├── network
│ │ ├── panels
│ │ ├── serial
│ │ ├── terminal
│ │ └── window
│ ├── hooks                          # 设备协调与 IPC
│ ├── settings                       # 应用图标、窗口图标及兼容配置
│ ├── stores                         # Flow、GNSS 等状态
│ ├── App.vue
│ └── main.ts                        # Renderer 入口
├─┬ tests
│ ├── unit
│ └── e2e
├── package.json
└── vite.config.ts
```

## 常用命令

```bash
pnpm run dev          # 启动 Electron 开发环境
pnpm run typecheck    # TypeScript / Vue 类型检查
pnpm run test         # Vitest 单元测试
pnpm run test:e2e     # Playwright 界面回归测试
pnpm run lint         # ESLint
pnpm run build        # 类型检查、构建并打包桌面应用
```

## 技术栈

- Vue 3 + TypeScript
- Electron + electron-builder
- Vite
- Element Plus + Element Plus Icons + Lucide
- ECharts
- Pinia
- FFmpeg (`ffmpeg-static`)
- SerialPort
- xterm.js、node-pty、ssh2
- Vitest + Playwright

## 通信方式

- 串口
- 文件输入
- TCP
- UDP
- RTSP 视频流
- SSH / SFTP
