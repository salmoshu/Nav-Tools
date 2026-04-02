# Nav-Tools 系统架构分析文档

## 1. 项目概述

### 1.1 项目背景

Nav-Tools 是基于 [Lichtblick Suite](https://github.com/lichtblick-suite/lichtblick) 二次开发的机器人可视化与诊断工具。它继承了 Lichtblick 的核心能力，同时针对机器人领域进行了定制化扩展。

**核心定位**：
- 面向机器人领域的集成化可视化平台
- 支持浏览器和桌面应用（Electron）双模式运行
- 跨平台支持：Linux、Windows、macOS

### 1.2 技术栈概览

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| **前端框架** | React 18 + TypeScript | 函数组件 + Hooks 架构 |
| **UI 组件库** | Material-UI (MUI) v7 | 企业级组件库 |
| **状态管理** | React Context + Hooks | 轻量级状态管理 |
| **构建工具** | Webpack 5 + Babel | 模块打包与转译 |
| **桌面框架** | Electron 39 | 跨平台桌面应用 |
| **测试框架** | Jest 30 + Playwright | 单元测试 + E2E测试 |
| **包管理** | Yarn 3 (Berry) + Workspaces | Monorepo 管理 |
| **代码规范** | ESLint + Prettier | 代码质量保障 |

---

## 2. 整体架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                     表现层 (Presentation)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │   Web App    │ │ Desktop App  │ │   Panel System       │ │
│  │  (suite-web) │ │(suite-desktop)│ │  (suite-base/panels) │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     业务逻辑层 (Business)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │    Players   │ │  DataSources │ │   State Managers     │ │
│  │  (播放器)     │ │  (数据源工厂) │ │   (状态管理)          │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     数据访问层 (Data Access)                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ MCAP Support │ │ ROS Message  │ │   File Parsers       │ │
│  │  (mcap-support)│ │  (rosmsg)   │ │  (bag, ulog, db3)    │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     基础设施层 (Infrastructure)              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │  den (工具库) │ │    Theme     │ │   Shared Utils       │ │
│  │  (基础工具)   │ │   (主题系统)  │ │   (通用工具)          │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心架构模式

#### 2.2.1 Player-Panel 架构

这是 Nav-Tools 的核心架构模式：

```
┌──────────────────────────────────────────────────────────┐
│                      Player (数据源播放器)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ McapPlayer  │  │RosbridgePlayer│ │ IterablePlayer  │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
│                         │                                │
│                         ▼                                │
│              ┌─────────────────────┐                     │
│              │   PlayerState       │                     │
│              │  (消息 + 元数据)     │                     │
│              └─────────────────────┘                     │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                      Panel (可视化面板)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │  PlotPanel  │  │ 3DRenderPanel│ │  RawMessages    │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
│                                                          │
│  订阅机制：Panel 通过 Topic 订阅获取数据                   │
└──────────────────────────────────────────────────────────┘
```

**核心概念**：
- **Player**：负责数据源的连接、数据解析、时间轴管理
- **Panel**：独立的可视化组件，通过订阅 Topic 获取数据
- **Topic**：ROS 风格的消息主题，是数据流动的基本单元
- **MessageEvent**：带时间戳的消息事件，包含 topic、receiveTime、message

#### 2.2.2 数据源工厂模式

```typescript
// 数据源工厂接口
interface IDataSourceFactory {
  id: string;              // 唯一标识
  type: 'file' | 'connection' | 'sample';
  displayName: string;     // 显示名称
  supportedFileTypes?: string[];  // 支持的文件类型
  initialize(args: DataSourceFactoryInitializeArgs): Player | undefined;
}
```

**已实现的工厂**：
- `McapLocalDataSourceFactory` - MCAP 本地文件
- `Ros1LocalBagDataSourceFactory` - ROS1 Bag 文件
- `Ros2LocalBagDataSourceFactory` - ROS2 SQLite3 文件
- `RosbridgeDataSourceFactory` - Rosbridge WebSocket 连接
- `FoxgloveWebSocketDataSourceFactory` - Foxglove WebSocket
- `UlogLocalDataSourceFactory` - PX4 ULog 文件
- `VelodyneDataSourceFactory` - Velodyne 激光雷达数据

---

## 3. 文件结构分析

### 3.1 Monorepo 结构

```
Nav-Tools/
├── packages/                    # 核心包（Monorepo）
│   ├── suite-base/             # 核心应用逻辑（1517+ 文件）
│   │   ├── src/
│   │   │   ├── players/        # 数据播放器
│   │   │   ├── panels/         # 可视化面板（28个）
│   │   │   ├── dataSources/    # 数据源工厂
│   │   │   ├── types/          # 类型定义
│   │   │   ├── hooks/          # React Hooks
│   │   │   ├── providers/      # Context Providers
│   │   │   └── util/           # 工具函数
│   │   └── src/i18n/           # 国际化
│   ├── suite-web/              # Web 应用入口
│   ├── suite-desktop/          # Electron 桌面应用
│   ├── mcap-support/           # MCAP 格式支持
│   ├── den/                    # 基础工具库
│   │   ├── records/            # 不可变数据结构
│   │   ├── math/               # 数学计算
│   │   ├── image/              # 图像处理
│   │   └── urdf/               # URDF 解析
│   ├── theme/                  # 主题系统
│   └── @types/                 # 类型定义包
├── desktop/                    # Electron 主进程/渲染进程
├── web/                        # Web 构建配置
├── doc/                        # 文档目录
└── e2e/                        # 端到端测试
```

### 3.2 核心模块详解

#### 3.2.1 Players 模块 (`packages/suite-base/src/players/`)

```
players/
├── IterablePlayer/             # 可迭代数据源播放器
│   ├── Mcap/                   # MCAP 文件支持
│   ├── BagIterableSource.ts    # ROS Bag 支持
│   ├── rosdb3/                 # ROS2 DB3 支持
│   ├── ulog/                   # PX4 ULog 支持
│   └── shared/                 # 共享组件
├── RosbridgePlayer.ts          # Rosbridge 连接
├── FoxgloveWebSocketPlayer/    # Foxglove WebSocket
├── Ros1Player.ts               # ROS1 原生连接
├── VelodynePlayer.ts           # Velodyne 激光雷达
└── types.ts                    # Player 类型定义
```

**IterablePlayer** 是核心播放器架构，支持：
- 基于 Worker 的多线程解析
- 块级缓存（BlockLoader）
- 预加载策略（readAheadDuration）

#### 3.2.2 Panels 模块 (`packages/suite-base/src/panels/`)

```
panels/
├── Plot/                       # 曲线图面板
├── ThreeDeeRender/             # 3D 渲染面板
├── Image/                      # 图像显示面板
├── RawMessages/                # 原始消息面板
├── Map/                        # 地图面板
├── Teleop/                     # 遥控面板
├── Gauge/                      # 仪表盘面板
├── Indicator/                  # 指示器面板
├── Log/                        # 日志面板
├── Table/                      # 表格面板
├── DiagnosticStatus/           # 诊断状态面板
├── DataSourceInfo/             # 数据源信息面板
└── Tab/                        # 标签页容器面板
```

**Panel 开发模式**：
```typescript
// Panel 使用 PanelExtensionAdapter 包装
const MyPanel = (props: PanelExtensionAdapterProps) => {
  const { context } = props;
  
  // 订阅 Topic
  context.subscribe([{ topic: "/topic_name" }]);
  
  // 接收消息
  context.onRender = (renderState) => {
    const message = renderState.currentFrame?.[0];
    // 渲染逻辑
  };
};
```

#### 3.2.3 数据源工厂模块 (`packages/suite-base/src/dataSources/`)

```
dataSources/
├── McapLocalDataSourceFactory.ts      # MCAP 本地文件
├── Ros1LocalBagDataSourceFactory.ts   # ROS1 Bag
├── Ros2LocalBagDataSourceFactory.ts   # ROS2 SQLite3
├── RosbridgeDataSourceFactory.ts      # Rosbridge WebSocket
├── FoxgloveWebSocketDataSourceFactory.ts
├── Ros1SocketDataSourceFactory.ts     # ROS1 TCP
├── UlogLocalDataSourceFactory.ts      # PX4 ULog
├── VelodyneDataSourceFactory.ts       # Velodyne PCAP
└── SampleNuscenesDataSourceFactory.ts # nuScenes 示例数据
```

---

## 4. 开发模式

### 4.1 组件开发模式

#### 4.1.1 React 函数组件 + Hooks

项目全面采用 React 18 的函数组件模式：

```typescript
// 自定义 Hook 示例
export function useMessageReducer<T>({
  topics,
  callback,
}: {
  topics: string[];
  callback: (msg: MessageEvent) => T;
}): T | undefined {
  const [result, setResult] = useState<T>();
  const context = usePanelContext();
  
  useEffect(() => {
    context.subscribe(topics);
    context.onRender = (renderState) => {
      const messages = renderState.currentFrame;
      if (messages && messages.length > 0) {
        setResult(callback(messages[messages.length - 1]));
      }
    };
  }, [topics, callback]);
  
  return result;
}
```

#### 4.1.2 Context 状态管理

采用轻量级的 Context + Reducer 模式：

```
providers/
├── PlayerSelectionContext.tsx    # 播放器选择
├── WorkspaceContext.tsx          # 工作区状态
├── PanelSettingsContext.tsx      # 面板设置
└── ExtensionMarketplaceContext.tsx # 扩展市场
```

### 4.2 多线程架构

#### 4.2.1 Web Worker 模式

数据解析使用 Web Worker 避免阻塞主线程：

```typescript
// WorkerSerializedIterableSource 封装
class WorkerSerializedIterableSource {
  constructor({
    initWorker,
    initArgs,
  }: {
    initWorker: () => Worker;
    initArgs: Record<string, unknown>;
  }) {
    const worker = initWorker();
    // 使用 Comlink 进行 Worker 通信
    this.worker = Comlink.wrap(worker);
  }
}

// MCAP Worker 初始化
const source = new WorkerSerializedIterableSource({
  initWorker: () => {
    return new Worker(
      new URL(
        "@lichtblick/suite-base/players/IterablePlayer/Mcap/McapIterableSourceWorker.worker",
        import.meta.url,
      ),
    );
  },
  initArgs: { files },
});
```

### 4.3 扩展开发模式

#### 4.3.1 扩展系统架构

```
Extension System
├── ExtensionLoader.ts          # 扩展加载器
├── ExtensionMarketplace.tsx    # 扩展市场
├── PanelExtensionAdapter.tsx   # 面板扩展适配器
└── ExtensionCatalogProvider.ts # 扩展目录管理
```

**扩展类型**：
- **Panel Extension**：自定义可视化面板
- **Message Converter**：消息格式转换器

#### 4.3.2 面板扩展开发示例

```typescript
// extension.ts
import { ExtensionContext } from "@lichtblick/suite";
import { MyPanel } from "./MyPanel";

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({
    name: "My Custom Panel",
    initPanel: (panelContext) => {
      return new MyPanel(panelContext);
    },
  });
}
```

---

## 5. 构建与部署

### 5.1 构建流程

```
开发流程:
yarn install        # 安装依赖
yarn desktop:serve  # 启动 Webpack Dev Server
yarn desktop:start  # 启动 Electron (需等待 serve 完成)

生产构建:
yarn desktop:build:prod   # 开发构建
yarn package:linux        # 打包 Linux 版本
yarn package:win          # 打包 Windows 版本
yarn package:darwin       # 打包 macOS 版本
```

### 5.2 技术债务与优化方向

| 类别 | 现状 | 建议 |
|------|------|------|
| **类型安全** | 部分 `any` 类型 | 逐步替换为严格类型 |
| **测试覆盖** | 核心模块有测试 | 增加 E2E 测试覆盖 |
| **性能优化** | Worker 多线程 | 虚拟列表优化大数据 |
| **国际化** | 基础框架存在 | 完善中文本地化 |

---

## 6. 总结

Nav-Tools 采用现代化的前端技术栈，基于 Player-Panel 架构实现了灵活的数据可视化能力。其 Monorepo 结构、工厂模式的数据源管理、以及 Worker 多线程架构，为机器人数据可视化提供了可扩展的技术基础。

**架构优势**：
- 模块化的 Panel 系统，易于扩展新的可视化组件
- 统一的数据源抽象，支持多种机器人数据格式
- Web/Desktop 双模式，一套代码多端运行
- TypeScript 全栈，类型安全有保障

**扩展建议**：
- 参考后续《数据格式扩展方案》文档实现非 ROS 数据接入
- 利用 Extension 系统开发自定义业务面板
- 基于现有 Player 架构扩展新的数据源类型
