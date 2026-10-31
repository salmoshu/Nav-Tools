# LiDAR 可视化：E-Wagon MCAP 决策录像回放

> 状态：已有回放功能；下述精确 Header-time 定锚与逐帧诊断更新需由集成验收运行门禁。历史验收记录见 §7。
> 2026-10 增补：local_map 双通道（`/local_map` 占据栅格 + `/local_map_path` A* 路径）
> 按车端定稿契约实现，并经真实样例 `tests/fixtures/lidar/localmap-sample.mcap`
> （14 通道 trace_sink 产物）联调验证；dwa_scores local_map 组键名单点可配，
> 旧录像自动降级。
> 服务对象：E-Wagon-Lidar v1.1.0"可视化黑匣子"（板上 `--trace` 录制的 MCAP）。
> 对应板上文档：`E-Wagon-Lidar/doc/versions/v1.1.0/`（visualization-plan.md §6 调试界面
> 的"空间场景 / 执行曲线 / 决策状态"三区在本工具中落地）。

## 1. 背景与目标

2026-10-21增补（源码实现，未替换Windows EXE）：新录像支持独立 `/target`
（`geometry_msgs/msg/PoseArray`），一个pose表示当前目标行人估计位置，空数组表示
失锁/过期/不可用，主动清除旧标记。LiDAR Scene默认显示蓝色行人点，红色点是车辆
`/goal`，两者有独立开关和图例。行人位置不是车辆前瞻/停靠点，也不是实际位置真值；
单位四元数无人体朝向语义。Header为规划几何参考时刻，不是相机采集时刻；
原始量和Lidar接收时刻见 `/planner_state.target`，不宣称已补偿相机时延或修复测距失真。

目标点使用自身Header的精确 `base_link → odom_est` 变换，外参不重复叠加；
缺少精确变换时隐藏。停车保持帧不依赖DWA评分；空数组、较新规划帧缺失目标时不显示
旧行人。旧录像没有此通道时开关灰显，不从goal补造target；播放头回退按对应消息恢复。
仍是录制帧回放，不在没有新处理帧时推断目标位置或合成新的失锁事件。

E-Wagon-Lidar v1.1.0 让雷达避障进程把"思考过程"录成 MCAP（ros2 profile，
CDR 编码，历史 12 通道；绕障在役时段另有 `/local_map`、`/local_map_path`）。
新录像增加每个处理帧的 `/planner_state`，包括没有 DWA 观测的挂起与失败帧。板上的验收标准是：拿回电脑，**拖时间轴同屏看到障碍点、
候选轨迹、逐候选评分、最终指令，解释清每一次停顿和转向**。

原方案依赖外部工具 Foxglove Studio。本功能把这层"录像带回放"能力直接内置进
Nav-Tools：打开 `.mcap`（拖拽/文件对话框/最近文件），四个联动面板 +
工具栏时间轴完成空间场景、决策评分、请求/里程估计曲线、消息检查与回放控制。

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
`/tf`（odom_est→base_link 动态估计位姿，以及 base_link→laser 外参）、`/footprint` `/footprint_margin`（PolygonStamped）、
`/traj_best` `/traj_candidates`（Path，一次规划多条候选=同戳多条消息）、
`/goal`（PoseStamped）、`/odom_est`（Odometry，标注估计）、`/cmd_raw`（Twist）、
`/dwa_scores`（String 装 JSON）、`/planner_state`（String 装逐帧请求/诊断 JSON）、`/local_map`（OccupancyGrid，odom 系，约 3Hz
节流，仅绕障在役时段有数据）、`/local_map_path`（Path，local_map 当前 A\* 路径，
同 odom 系）。后两个是 v1.1.0 之后加入的 local_map 通道，**旧录像没有**：场景面板的
对应开关灰显，话题表自然不列。

## 3. 关键实现事实（回放语义对齐 Foxglove/Lichtblick）

- **播放头"current"语义**：消息可用性仍按 logTime 取"播放头之前最近一条"（二分查找）。
  机器人用最新有效里程计显示；缓存扫描/规划几何不随当前机器人位姿重新移动。
- **同戳多条消息**：/traj_candidates 一次规划写 N 条同时间戳消息，
  `decodeAllAtOrBefore` 整组取回，候选轨迹不会丢。
- **时间轴与步进依据**：连续播放、拖动及进度比例始终按真实 logTime，显示当前时间与总时长。
  前后按钮及方向键的 ±1/±10 步使用所选数据流：默认 `/planner_state`，旧录像缺少该话题时
  自动退回 `/scan_raw`，两者均缺少时使用跨话题合并去重的事件时间点。选择器提供
  「规划状态 / 原始雷达扫描 / 全部事件」，缺失话题禁用；保存用户偏好，切换依据不改变播放头。
  手动步进会暂停播放，任意拖动位置的上一步取严格早于当前时刻的最近一条，不跳过前一帧。
  同戳消息保留原解码语义，但步进时间点去重，避免卡在同一时刻。
  计数分别标为「规划帧 / 雷达帧 / 事件时间点」；所选数据流首条消息之前显示0，首条为1，
  末条不超过总数。规划编号不从1开始或中间缺帧时，另显原始 `/planner_state.frame`，
  不将记录序号冒充算法编号。例如CSPC39为344个规划时间点、345个扫描时间点、1378个事件时间点。
- **采样坐标定锚**：新录像读取标准 `header.frame_id` / `header.stamp`，全文件 `/tf`
  以 TransformStamped 的 Header 时间建精确整数纳秒索引，而非只看播放头前的 TF。
  固定两级链 laser→base_link→odom_est，雷达外参只用一次；base_link 几何不再加雷达偏移。
  扫描捕获时间与实际查询到的历史位姿时间不同时，用全文件 `/planner_state` 的
  `scan_capture_ns → scan_pose_ns` 明确关联，再查该历史位姿的精确 TF，外参查同帧 `pose_ns`。
  这些关联/TF 可以晚于扫描事件写入；不插值、不跨重置选最近位姿、不凭空制造零位姿。
  新录像缺少精确采样 TF/关联时隐藏该几何并警告。旧录像没有动态 TF/逐帧状态时，
  保留显式警告的历史最新里程计回退（兼容旧 `stamp.stamp`），不可当作真实定锚。
- **时间戳**：logTime 是事件可用时间，Header 是采样时间；板上 CLOCK_MONOTONIC
  （非 epoch），UI 显示会话相对时间 `mm:ss.mmm`，不伪造墙钟或物理定位真值。
- **逐帧状态优先**：场景 HUD 显示 `/planner_state` 的 frame/source、挂起原因、
  最终请求 v/w、Lidar socket API 是否接受、wheel/target 新鲜度与 bypass 搜索结果。
  展开「记录的规划事实」可看实际搜索时间、完整拒绝计数与输入序列/年龄。
  socket 接受不等于 Host 选择，更不等于 MCU 执行；执行证据始终标注不可确认。
  当前帧没有观测、导航挂起或 frame 不一致时，不显示旧成功帧的评分和 DWA 轨迹。
  旧录像评分标注历史 frame/事件年龄；低频缓存地图/A* 路径保留世界锚点，并显示事件年龄。
- **Goal点标记**：滚动 goal 只有位置语义（录制端四元数恒为单位占位，无朝向），
  按`/goal`的原有坐标变换显示为点标记，不携带也不跟随任何朝向。
- **多分片会话**：part_N.mcap 轮转产物一次多选/多拖加载，按 logTime 归并为
  单一文档（各分片独立 schema/channel 自举，同话题跨片复用索引，同戳消息
  保持到达序）；分片按数值序排列（part_10 不会排到 part_2 前面）；只导入单个分片
  （路径输入/单选/单文件拖入/最近文件）时自动补齐同目录整族分片
  （`lidar-mcap-list-family` IPC + `expandMcapPartPaths`，Web 构建无目录
  访问权限除外）；最近文件记录整组分片路径，重开自动展开；会话头显示分片数徽标。
- **截断/残缺回退**：索引不可用（板上崩溃掉电的残缺分片）自动回退
  McapStreamReader 流式扫描，能读多少算多少；`meta.truncated` 置位，
  会话头出现「不完整」徽标，problems 写明"仅加载前 N 条消息"；压缩 chunk
  无解压器时给可读提示而不是静默丢数据。
- **dwa_scores**：JSON 宽容解析为强类型（逐候选 v/w/h/obs/vel/cm/bonus/tot、
  collision 淘汰、cached 复验、samples/evaluated/early_terminated/plan_ms/window）；
  local_map 状态标志为顶层嵌套组 `"local_map":{"blk":…,"nav_hold":…,"nav_reason":…,
  "memory_paused":…}`（JSON 布尔；0/1 数值兼容），组名与子键名集中在
  `DwaScores.LOCAL_MAP_SCORE_KEYS` 单点配置（车端改键名时只动这一处），
  旧录像没有该组时评分面板不显示对应 chips。
- **占据栅格渲染**：`/local_map`（odom 系 OccupancyGrid）在 SceneFrame 归一为
  三态（-1/负数→未知、≥65→占据、其余→已观测空闲，阈值对齐 RViz/map_server
  occ_thresh），渲染端用 **DataTexture + 单位 PlaneGeometry**：每帧只做
  O(W×H) 的 RGBA 填色 + 一次纹理上传（160×160≈102KB），几何体永不重建，
  只按 header(info).origin 缩放/平移/旋转（z 略低于 0 避免与网格线深度冲突）；
  占据格醒目暖色、空闲极淡、未知全透明，暗/亮双主题。`/local_map_path` 与
  `/traj_best` 同为 nav_msgs/Path，但**已在 odom 系**，不经过 base 变换链，
  用不同颜色（紫）的 THREE.Line 区分。
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
| 纯逻辑 | `src/core/lidar/RecordedTransforms.ts` | 全文件采样 TF/扫描位姿关联精确查找，固定两级坐标链 |
| 纯逻辑 | `src/core/lidar/PlannerState.ts` | 逐帧诊断解析及当前评分/轨迹时序优先级 |
| 纯逻辑 | `src/core/lidar/LidarSeries.ts` | 绘图序列预提取（cmd/odom/scores） |
| 纯逻辑 | `src/core/lidar/DwaScores.ts`、`PlayerClock.ts`、`timeFormat.ts`、`McapFileAccess.ts`、`src/core/file/RecentInputFiles.ts` | 评分解析 / 回放时钟 / 时间格式化 / 平台文件接入 / 统一最近文件（含旧 MCAP 键迁移） |
| Store | `src/composables/useMcapPlayer.ts` | 单例播放器：加载/播放/seek/步进/偏好持久化/全局快捷键 |
| 渲染 | `src/components/windows/lidar/scene/LidarSceneRenderer.ts` | three.js 封装（点云着色、轨迹、轮廓、goal、跟随相机、主题、占据栅格 DataTexture 层） |
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
- Plot 面板与播放头联动、点击图表定位播放头；cmd×odom Lidar 请求-里程估计叠图预设、
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
  帧定义下拉框（规划帧/雷达帧/事件时间点，缺数据口径禁用）与帧计数
  （只显示 当前/总数 数字，完整帧定义与真实规划编号在 tooltip）、
  倍速(×0.25–×8)、循环开关；当前播放文件名显示在应用 header 标题旁
  （完整路径悬浮可见），信息弹层列出全部分片路径；
  工具栏停靠左/右时折叠为时钟按钮 + 弹出面板（同一组件自适应）。
- **时间轴信息按钮**（截断/有加载提示时转琥珀色）弹出诊断面板：话题表
  （12 通道计数/频率/场景可见性开关）、会话信息（profile/大小/时长/板上
  Metadata 指纹/problems）、快捷键说明；换一份录像直接再走入口即可，
  加载新文件会替换当前会话。
- Space 播放/暂停，←/→ 逐帧，Shift+←/→ ±10 帧，Home/End 跳转；
  DWA Scores / 场景 / 曲线 / 检查器全部随播放头联动。
- 请求/里程估计曲线点击图表任意位置可跳转播放头；它不是 MCU 执行反馈。

## 7. 测试与验收记录

- 单元（其中 `tests/unit/lidar-*.test.ts` 74 项）：
  - `lidar-mcap-document`：合成同构 MCAP 验证索引/解码/播放头语义/同戳候选/步进；
  - `lidar-mcap-fallback`：截断分片流式挽回（50%/80% 截断精确挽回完整前缀）、
    压缩 chunk 可读提示、两片归并/乱序分片/`[part_N]` 标识/垃圾输入可读报错；
  - `lidar-real-fixture`：真实板上 fixture 字段级断言（12 通道、LaserScan 360 点、
    PointCloud2 字段偏移、/tf 0.75m 外参、footprint 顶点、会话 Metadata、dwa_scores JSON）；
  - `lidar-geometry`：极坐标→笛卡尔、无效点剔除、PointCloud2 字段偏移、四元数、变换；
  - `lidar-player-clock`：倍速/边界/循环/seek 收敛；`DwaScores` 真实样例与坏输入；
  - `lidar-scene-frame`：laser→base_link→odom 两级变换、轨迹增长；标准 Header
    延迟捕获关联、相邻整数纳秒/位姿重置定锚、缺精确样本不插值、挂起/无观测压过旧成功评分与轨迹；
  - `lidar-local-map`：OccupancyGrid→LocalMapView（origin 含 yaw 原样摆放、
    cell 三态阈值归一、数据长度异常 warning）、/local_map_path 不过 base 变换、
    旧录像缺通道降级、dwa_scores local_map 嵌套组按 LOCAL_MAP_SCORE_KEYS 解析
    （布尔/0/1 兼容、缺子键默认值、组非对象忽略）；
  - `lidar-localmap-fixture`：车端真实样例 `localmap-sample.mcap` 字段级联调
    （14 通道齐全、/local_map 17 条结构完整 data==width*height、int8 符号链路
    验证（Int8Array、未知格 -1 非 255）、三态分布有占据、SceneFrame 旧格式几何保持可用、
    dwa_scores local_map 组真实值断言）；
  - `lidar-registration`：注册表/glob/双语词条/默认应用迁移/preload 接线（源码扫描）。
- 端到端（`tests/e2e/lidar-visualizer.spec.ts`，4 绿）：真实板上 Trace 分片
  （`tests/fixtures/lidar/trace-selftest.mcap`，WSL 内 `--trace-selftest` 产物）
  → 四面板加载 → 12 通道话题表（时间轴信息弹层）→ 逐帧步进后评分表有数据 → WebGL 像素非空 →
  播放头推进 → JSON 树渲染；截图存档人工核对（场景环/障碍弧/轮廓/曲线/评分表）。
- 全量门禁：`pnpm typecheck` ✓、`pnpm lint` ✓、`pnpm build:dir` ✓（three.js 正常分块）。
- 探针记录：解码链路先用真实 C++ 产物逐通道验证后才开始面板开发；当前回归
  fixture（`trace-selftest.mcap`）为 763 条消息、12 通道、3 个未压缩 chunk，
  字段级断言见 `tests/unit/lidar-real-fixture.test.ts`。该历史 fixture 使用非标准 Header
  两层 `stamp` 嵌套；新录像标准 `header.stamp` 与历史格式分别兼容。
  TypedArray 返回类型及非 epoch 单调时钟仍按文件事实解释。

## 8. 边界与不做

- 不改 E-Wagon-Lidar 录制侧任何行为；解码端对 schema 完全数据驱动。
- 不支持压缩 chunk（板上 mcap writer 已裁剪 lz4/zstd，`Compression::None`）；
  遇到不支持的编码会进 problems 提示而不是静默丢数据。
- 截断点所在的半个残缺 chunk 不逐条榨取：流式回退以完整记录为界，
  截断分片实际挽回到最后一个完整 chunk 为止。
- 里程计轨迹明确标注"估计"（板上即标注 odom_est 会漂移），不伪造地图。
