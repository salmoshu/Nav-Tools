# LiDAR 可视化：E-Wagon MCAP 决策录像回放

> 状态：已实现并通过完整测试（单元 682 绿 / E2E 4 绿 / typecheck / lint / 生产构建）。
> 服务对象：E-Wagon-Lidar v1.1.0"可视化黑匣子"（板上 `--trace` 录制的 MCAP）。
> 对应板上文档：`E-Wagon-Lidar/doc/versions/v1.1.0/`（visualization-plan.md §6 调试界面
> 的"空间场景 / 执行曲线 / 决策状态"三区在本工具中落地）。

## 1. 背景与目标

E-Wagon-Lidar v1.1.0 让雷达避障进程把"思考过程"录成 MCAP（ros2 profile，
CDR 编码，12 通道）。板上的验收标准是：拿回电脑，**拖时间轴同屏看到障碍点、
候选轨迹、逐候选评分、最终指令，解释清每一次停顿和转向**。

原方案依赖外部工具 Foxglove Studio。本功能把这层"录像带回放"能力直接内置进
Nav-Tools：打开 `.mcap`（拖拽/文件对话框/最近文件），四个联动面板 +
工具栏时间轴完成空间场景、决策评分、执行曲线、消息检查与回放控制。

## 2. 数据链路

```text
板上（不改）：follow_standalone --trace → session_*/part_N.mcap（≤10MiB×N 轮转）
                                          │ 拷回开发机（U 盘/scp）
Nav-Tools：  拖拽（可多文件）/ 对话框（可多选）/ 最近文件 → McapDocument 索引（@mcap/core）
              → 多分片会话按 logTime 归并为单一文档；截断/缺索引分片自动流式回退尽量挽回
              → schema 文本按文件内 ros2msg 解析（@foxglove/rosmsg, ros2:true）
              → CDR 解码（@foxglove/rosmsg2-serialization MessageReader）
              → useMcapPlayer 单例播放器（rAF 时钟、播放头、逐帧步进）
              ├─ LiDAR Scene    three.js 三维场景（TF/里程计两级变换）
              ├─ DWA Scores     /dwa_scores JSON 结构化表格
              ├─ Command Curves ECharts 时间序列 + 播放头游标
              ├─ Message Inspector  当前帧解码消息 JSON 树
              └─ 工具栏时间轴    传输控制 + 信息弹层（话题表/会话指纹/快捷键）
```

通道集（板上 `trace_schemas.cpp` 定义，解码端零硬编码、全部以文件内 schema 为准）：
`/scan_raw` `/scan_filtered`（LaserScan）、`/obstacles_planned`（PointCloud2）、
`/tf`（base_link→laser 0.75m）、`/footprint` `/footprint_margin`（PolygonStamped）、
`/traj_best` `/traj_candidates`（Path，一次规划多条候选=同戳多条消息）、
`/goal`（PoseStamped）、`/odom_est`（Odometry，标注估计）、`/cmd_raw`（Twist）、
`/dwa_scores`（String 装 JSON）。

## 3. 关键实现事实（回放语义对齐 Foxglove/Lichtblick）

- **播放头"current"语义**：任意时刻每话题取"播放头之前最近一条"（二分查找），
  静态几何（/tf、轮廓）与低频话题在任意播放头位置都有完整上下文。
- **同戳多条消息**：/traj_candidates 一次规划写 N 条同时间戳消息，
  `decodeAllAtOrBefore` 整组取回，候选轨迹不会丢。
- **逐帧步进**：跨话题合并去重的全局时间点数组上 ±1/±10 步（Foxglove 式）。
- **坐标变换两级链**：laser→base_link（/tf 外参 0.75m）→ odom_est（轮速积分
  估计位姿）；场景默认"跟随车体"，里程轨迹虚线标注"估计"。
- **时间戳**：板上 CLOCK_MONOTONIC（非 epoch），UI 一律显示会话相对时间
  `mm:ss.mmm`，不伪造墙钟。
- **多分片会话**：part_N.mcap 轮转产物一次多选/多拖加载，按 logTime 归并为
  单一文档（各分片独立 schema/channel 自举，同话题跨片复用索引，同戳消息
  保持到达序）；分片按数值序排列（part_10 不会排到 part_2 前面）；最近文件
  记录整组分片路径，重开自动展开；会话头显示分片数徽标。
- **截断/残缺回退**：索引不可用（板上崩溃掉电的残缺分片）自动回退
  McapStreamReader 流式扫描，能读多少算多少；`meta.truncated` 置位，
  会话头出现「不完整」徽标，problems 写明"仅加载前 N 条消息"；压缩 chunk
  无解压器时给可读提示而不是静默丢数据。
- **dwa_scores**：JSON 宽容解析为强类型（逐候选 v/w/h/obs/vel/cm/bonus/tot、
  collision 淘汰、cached 复验、samples/evaluated/early_terminated/plan_ms/window）。
- **性能形态**：加载时一次全量索引（logTime 升序 + 负载拷贝），绘图序列
  （cmd/odom/scores）一次性预提取为 Float64Array；播放期间每帧只解码
  "播放头之前最近的一组消息"，O(消息数/帧) 与文件大小无关。里程计轨迹
  （trail）从预提取里程计序列按播放头切片构建，播放期不再整段重解码历史
  /odom_est 消息。
- **平台降级**：Electron 下对话框/按路径读取走主进程（`lidarIpc.ts`，
  2GiB 兜底）；Web 构建（`dev:web`）下用浏览器 File API，同一套面板可用。

## 4. 组件清单

| 层 | 文件 | 职责 |
|---|---|---|
| 纯逻辑 | `src/core/lidar/McapDocument.ts` | MCAP 索引/解码/二分定位/步进时间点 |
| 纯逻辑 | `src/core/lidar/LidarGeometry.ts` | 消息结构守卫 + 点云/轨迹/多边形提取 + 平面变换 |
| 纯逻辑 | `src/core/lidar/SceneFrame.ts` | 播放帧 → 世界系渲染几何（含里程计轨迹降采样） |
| 纯逻辑 | `src/core/lidar/LidarSeries.ts` | 绘图序列预提取（cmd/odom/scores） |
| 纯逻辑 | `src/core/lidar/DwaScores.ts`、`PlayerClock.ts`、`timeFormat.ts`、`McapFileAccess.ts`、`src/core/file/RecentInputFiles.ts` | 评分解析 / 回放时钟 / 时间格式化 / 平台文件接入 / 统一最近文件（含旧 MCAP 键迁移） |
| Store | `src/composables/useMcapPlayer.ts` | 单例播放器：加载/播放/seek/步进/偏好持久化/全局快捷键 |
| 渲染 | `src/components/windows/lidar/scene/LidarSceneRenderer.ts` | three.js 封装（点云着色、轨迹、轮廓、goal、跟随相机、主题） |
| 面板 | `LidarScene.vue` 等 4 个 + `JsonTreeNode.vue` | 注册于 `panelRegistry`，`catalogGroup: 'lidar'` |
| 工具栏 | `src/components/LidarTimelineControl.vue` | 回放时间轴（形态对齐 FileTimelineControl）+ 信息弹层（话题表/会话指纹/problems/快捷键/截断徽标），随工具栏停靠自适应；ToolBar 内挂载，Input 对话框的文件输入自动识别 MCAP |
| 主进程 | `electron/main/lidarIpc.ts` + preload 两个方法 | 打开对话框 / 按路径读取 |
| i18n | `src/i18n/locales/{zh-CN,en-US}/lidar.ts` | 全部界面文案双语 |

内置应用 `LiDAR`（icon: radar，窗口 = 四面板默认布局），并通过
`nav-tools:migration:lidar-default-v1` 迁移进既有安装。旧版本布局/应用里
残留的 `lidar-playback` 引用会被布局系统静默丢弃（`getWindowsByIds` 只保留
注册表已知面板），无需额外迁移。

## 5. 从 Foxglove/Lichtblick 吸收的特性

调研结论（2026-09）：Lichtblick 是 BMW 开源的 Foxglove Studio 分叉（MPL-2.0，
Electron+React），无法作为组件嵌入 Vue 应用；但其核心能力来自独立的 MIT 库
——本实现直接复用官方 `@mcap/core` + `@foxglove/rosmsg` +
`@foxglove/rosmsg2-serialization`，与 Foxglove 读同一文件的解析路径一致。
已吸收的特性：

- 时间轴拖拽 + 播放/暂停/逐帧步进/倍速(0.25–8x)/循环；
- "current = 播放头之前最近一条"的面板语义；
- 3D 场景：话题可见性开关、点大小、按强度/距离着色、跟随车体、网格、图例；
- Plot 面板与播放头联动、点击图表定位播放头；cmd×odom 指令-执行叠图预设、
  全灭（success=0）区段红色高亮与「上一处/下一处受阻」帧跳转；
- Raw Messages 检查器（JSON 树、大数组折叠、复制）；
- 布局持久化（经由 Nav-Tools 既有应用/布局系统，等价于 Foxglove layout 入库）；
- 键盘快捷键（Space/←→/Shift+←→/Home/End），仅在有 LiDAR 面板打开时生效，
  且对输入框/滑块/按钮等可编辑控件不劫持；播放不随面板/应用切换暂停，
  切走再切回时动画从中断处继续；
- 话题可见性开关直接读写播放器偏好（单一数据源），场景面板不持有本地副本；
- 加载问题（problems）与会话 Metadata（板上指纹）展示。

暂未做（路线）：SFTP 直接从板子拉取 trace 目录（P2）、Foxglove WebSocket
实时连接（板上 L2）、相机图像通道（板上尚未接入视觉）。

## 6. 使用方法（回放控制已合入数据接入）

入口二选一（对齐 NMEA 回放的接入形态），加载后回放控制统一收敛到**工具栏时间轴**：

1. **工具栏 Input 对话框 → "文件输入"页签**：统一选择文本日志或 `.mcap` 录像，
   也可填写本地路径。识别为 MCAP 后自动显示录像说明，隐藏文本解析与时间标签设置；
   确认即加载，文件选择支持一次多选同一会话的 part_N 分片。
   “最近录像”中的多分片会话重开时自动展开全部分片。MCAP 仍使用独立播放器，
   不改变串口/网络连接状态；配置 MCAP 时隐藏 IO 连接开关。
2. **全窗口拖放**：把 `.mcap` 直接拖进主窗口（useDevice 按扩展名分发，
   优先于 .log/.txt/.dat 文本分支）；一次拖入多个分片合并为单会话加载。

加载后：

- **工具栏底部出现时间轴**（`LidarTimelineControl`，形态对齐 NMEA 回放的
  `FileTimelineControl`）：播放/暂停、±1 帧、进度滑条、会话相对时间、
  帧计数（跨话题合并的全局消息序号）、倍速(×0.25–×8)、循环开关；
  工具栏停靠左/右时折叠为时钟按钮 + 弹出面板（同一组件自适应）。
- **时间轴信息按钮**（截断/有加载提示时转琥珀色）弹出诊断面板：话题表
  （12 通道计数/频率/场景可见性开关）、会话信息（profile/大小/时长/板上
  Metadata 指纹/problems）、快捷键说明；换一份录像直接再走入口即可，
  加载新文件会替换当前会话。
- Space 播放/暂停，←/→ 逐帧，Shift+←/→ ±10 帧，Home/End 跳转；
  DWA Scores / 场景 / 曲线 / 检查器全部随播放头联动。
- "执行曲线"点击图表任意位置可跳转播放头。

## 7. 测试与验收记录

- 单元（全量 682 绿，其中 `tests/unit/lidar-*.test.ts` 54 项）：
  - `lidar-mcap-document`：合成同构 MCAP 验证索引/解码/播放头语义/同戳候选/步进；
  - `lidar-mcap-fallback`：截断分片流式挽回（50%/80% 截断精确挽回完整前缀）、
    压缩 chunk 可读提示、两片归并/乱序分片/`[part_N]` 标识/垃圾输入可读报错；
  - `lidar-real-fixture`：真实板上 fixture 字段级断言（12 通道、LaserScan 360 点、
    PointCloud2 字段偏移、/tf 0.75m 外参、footprint 顶点、会话 Metadata、dwa_scores JSON）；
  - `lidar-geometry`：极坐标→笛卡尔、无效点剔除、PointCloud2 字段偏移、四元数、变换；
  - `lidar-player-clock`：倍速/边界/循环/seek 收敛；`DwaScores` 真实样例与坏输入；
  - `lidar-scene-frame`：laser→base_link→odom 两级变换数值断言、轨迹增长；
  - `lidar-registration`：注册表/glob/双语词条/默认应用迁移/preload 接线（源码扫描）。
- 端到端（`tests/e2e/lidar-visualizer.spec.ts`，4 绿）：真实板上 Trace 分片
  （`tests/fixtures/lidar/trace-selftest.mcap`，WSL 内 `--trace-selftest` 产物）
  → 四面板加载 → 12 通道话题表（时间轴信息弹层）→ 逐帧步进后评分表有数据 → WebGL 像素非空 →
  播放头推进 → JSON 树渲染；截图存档人工核对（场景环/障碍弧/轮廓/曲线/评分表）。
- 全量门禁：`pnpm typecheck` ✓、`pnpm lint` ✓、`pnpm build:dir` ✓（three.js 正常分块）。
- 探针记录：解码链路先用真实 C++ 产物逐通道验证后才开始面板开发；当前回归
  fixture（`trace-selftest.mcap`）为 763 条消息、12 通道、3 个未压缩 chunk，
  字段级断言见 `tests/unit/lidar-real-fixture.test.ts`。板上 schema 的 Header
  两层 `stamp` 嵌套、TypedArray 返回类型、非单调时钟 wall-clock 缺失均已确认
  并适配。

## 8. 边界与不做

- 不改 E-Wagon-Lidar 录制侧任何行为；解码端对 schema 完全数据驱动。
- 不支持压缩 chunk（板上 mcap writer 已裁剪 lz4/zstd，`Compression::None`）；
  遇到不支持的编码会进 problems 提示而不是静默丢数据。
- 截断点所在的半个残缺 chunk 不逐条榨取：流式回退以完整记录为界，
  截断分片实际挽回到最后一个完整 chunk 为止。
- 里程计轨迹明确标注"估计"（板上即标注 odom_est 会漂移），不伪造地图。
