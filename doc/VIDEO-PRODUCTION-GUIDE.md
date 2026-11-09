# Nav-Tools 视频制作指南

本文沉淀 GNSS 与 Serial 教程的制作流程，适用于 Windows、Nav-Tools 桌面版、Playwright 界面自动化和 FFmpeg 合成。

## 1. 先定义观众能完成的操作

不要从“展示所有组件”开始，而应从一条可复现的任务链开始：

- GNSS：物理接线 → 串口 NMEA → SPP 定位 → CORS/NTRIP 注入 → RTK 浮点解。
- Serial：连接数据源 → 原始日志 → 字段解析 → 图表与 Status View → HEX 指令和设备应答。

为每一步写出**观众操作、屏幕证据、讲解文本**三项。屏幕证据必须来自真实界面或明确标注的模拟数据，不能用静态示意图冒充运行结果。

推荐章节顺序：

1. 片头说明要解决的问题。
2. 展示最终工作台和组件位置。
3. 按数据源复杂度逐步演示。
4. 展示结果，同时说明判断依据。
5. 片尾给出文档和模拟器的使用入口。

## 2. 素材与串口方向

### 2.1 实机、样本和模拟器的选择

- 物理连接、真实 RTK 状态：使用实机录制。没有固定解时不能编造，浮点解和固定解必须区分。
- 设备断联或只需演示 NMEA 日志：使用已有 `.nmea` 文件回放。
- CSV、自定义文本和 HEX 控制：使用明确标注的模拟器，保证演示可重复。
- 不要把文件回放或模拟器结果描述成实机测量。

Serial 示例文件：

```text
E:\BaiduSyncdisk\PROJ-GNSS\共有资料\测试与实验\测试数据样本库-ES\宝时得\模拟宝时得测试0213\2min\1\684K.nmea
```

模拟器：`tmp/video/serial_device_simulator.py`，支持 `csv`、`regex`、`nmea`、`hex` 四种模式。

### 2.2 虚拟串口方向

本次环境为 `COM21 ↔ COM22`：

```text
模拟器连接 COM22 → Nav-Tools 连接 COM21 → 模拟器收到 Nav-Tools 指令
```

先列出端口、确认另一端是否被占用，再启动模拟器。模拟器与 Nav-Tools 不能同时占用同一个端口。

```bash
python tmp/video/serial_device_simulator.py --mode csv --port COM22
python tmp/video/serial_device_simulator.py --mode regex --port COM22
python tmp/video/serial_device_simulator.py --mode hex --port COM22
```

一次只运行一个模拟模式。切换前停止旧模拟器，避免旧进程持续写入或占用端口。

### 2.3 文本与 HEX 的显示差异

- CSV：选择“结构化 → CSV”，实时串口字段以列号 `1、2、3、4` 注册。
- 自定义文本：用 `(?<latitude>-?[\d.]+)` 这样的命名捕获组注册字段；配套模拟器使用 `@GNSS` 前缀。
- HEX 控制：消息区和输入框的格式要分别设置；输入框为 HEX 不会让收到的二进制自动变成可读 HEX。
- 二进制帧按固定长度接收时，可能没有换行。示例模拟器在应答后追加 CRLF，使消息区能按行显示；真实设备是否换行必须以其协议为准。
- 不要仅展示消息输入框。Hex报文组件应导入 `tmp/video/serial-hex-demo.json`，实际点击 PING、START_NMEA、STOP_NMEA、READ_GNSS_STATUS，再检查原始 HEX 日志和模拟器日志。NMEA 开关应实际影响播发，并通过串口收发检查确认。

## 3. NMEA 图表与 Status View

Serial 的 NMEA 协议解析与图表字段注册不是同一条数据通路。需要曲线时，本次采用“文件输入 → 自定义正则”提取 GGA 数值，不把这种配置说成完整 GNSS 解算。

```regex
GGA,(?<utc>[\d.]+),(?<latitude>[\d.]+),[NS],(?<longitude>[\d.]+),[EW],(?<quality>\d+),(?<satellites>\d+),(?<hdop>[\d.]+),(?<altitude>-?[\d.]+),M
```

将 `altitude`、`satellites`、`quality` 加入图表。双图布局可把高程放上图，卫星数和定位质量放下图。

Status View 必须实际出现在录屏中，尤其在 NMEA、CSV 和自定义正则阶段。放大应用窗口、关闭不需要的卡片，保证右侧字段和值可读。后期可以对真实状态区做局部放大，但不能修改数值、伪造字段或用后期面板代替真实运行状态。

## 4. 界面自动化与录屏

### 4.1 启动应用

本次使用本地安装版：

```text
D:\Users\Salmos\AppData\Local\Programs\Nav-Tools\Nav-Tools.exe
```

自动化参数：

```text
--remote-debugging-port=9222 --force-renderer-accessibility --user-data-dir=<录制专用目录>
```

使用 Playwright `chromium.connectOverCDP('http://127.0.0.1:9222')` 连接，而不是为桌面应用另起一套浏览器数据。

本轮使用 `tmp/video/recording-profile` 保存独立录制配置，不改动日常使用的应用配置。首次启动后，在真实 UI 中选择 Serial，并通过“设置 → 语言”选择中文。启动后台进程时使用 PowerShell `Start-Process -WindowStyle Hidden`，同时记录 PID 和日志路径。

### 4.2 自动化注意事项

- 在界面上执行真实操作，优先使用按钮标题、ARIA 标签和面板作用域。
- Element Plus 会在对话框外挂载下拉菜单，不能只在对话框 DOM 内找选项。
- 同一组件可能同时保留多个面板的 DOM。定位器必须限定当前面板，例如 `#pane-file`。
- `:visible` 在此环境可能与实际弹层状态不一致；应记录 DOM 和选项文本，不能反复盲点。
- 动态按钮可用 `locator.evaluate(element => element.click())` 触发控件自身事件。虚拟视口与窗口大小不一致时，坐标点击可能被对话框遮挡检查阻止，不要盲目重复点击。
- 每步输出阶段日志，使用短定位超时和脚本总看门狗，失败时保留现场截图。
- 通过 `connectOverCDP` 连接现有应用后，不要在每个脚本结束时调用 `browser.close()`。本次实测它会结束应用会话；让自动化进程退出并断开连接即可。

### 4.3 本次采用的真实应用帧捕获

FFmpeg 的 `gdigrab title=...` 在本次环境中得到过异常小图和黑帧；禁用 GPU 没有解决该窗口捕获问题，因此不再用它反复重录。桌面全屏录制还会被其他窗口遮挡。

本次改用 CDP `Page.captureScreenshot` 直接捕获真实 Electron 渲染器，以固定间隔取得 JPEG 帧，再编码为 30 fps 视频。所有控件仍通过真实 UI 操作，串口由模拟器提供，NMEA 来自现有文件；不得调用 `routeDataToWindow`、`addMessage` 或直接改写 `globalDevice` 来伪造演示结果。

录制视口固定为 1920×950，底部补齐为 1920×1080，字幕使用独立的 130 像素区域，不遮挡应用的时间轴、状态栏和消息输入框。保留实际应用的右侧 Status View。

录制前用一帧确认对话框、按钮、文字和字段均正常；每段结束后从生成的视频中抽帧，而不只看单独保存的截图。

## 5. 字幕与自然语音

### 5.1 讲解文本

使用短句和正常口语，不逐字朗读协议字段。第一次出现的 SPP、NTRIP、RTK 等术语给出用途，后续不重复定义。解状态使用“浮点解”，不要写成“浮动解”。

账号、密码、令牌等敏感信息不得进入字幕或语音；界面录制时也应掩码。若视频曾包含真实凭据，交付前应更换凭据，而不是只删除新视频。

### 5.2 神经语音

本次使用 `zh-CN-XiaoxiaoNeural`，避免使用机器人感明显的旧系统语音。语音合成依赖安装在临时目录，交付前清理，不修改项目运行依赖。

```bash
python -m pip install --target tmp/video/tts-deps edge-tts
```

逐段生成语音并读取实际时长。文案应尽量匹配画面；不要依靠大幅加速来追赶操作。通常只做小幅 `atempo` 调整，句间保留约 0.2–0.4 秒停顿。重录单句时，应同步更新字幕时间和后续拼接。

### 5.3 字幕时间轴

只使用一条明确的合成时间轴：

- 如果字幕相对软件操作段计时，片头拼接时统一加一次片头时长。
- 如果字幕已按成片计时，就不要再次加片头偏移。
- 分段录制时，先累加每段真实视频时长，再计算下一段字幕。
- 不用“估计按钮操作耗时”代替视频实际时长。

字幕应避开底部时间轴、串口状态和消息输入框。关键画面至少停留到观众能读完一行字幕。

## 6. 合成与验收

统一输出的分辨率、帧率、像素格式和音频采样率，再拼接片头、软件主体与片尾。手机接线素材要检查旋转方向、画幅和音量，并突出 RKTX1、RKRX1、GND 的实际连接。

建议成片为 1920×1080、30 fps、H.264 视频与 AAC 音频，画面使用 `yuv420p` 保证播放器兼容性。

新版 Serial 交付文件为 `../../../04-GNSS/中科院北斗所/2.1-测试软件-基础功能测试程序开发/03-日志查看程序/Nav-Tools-Serial-使用教程.mp4`（相对本文所在目录）。按 GNSS CSV、自定义正则、NMEA 文件、HEX 控制排列，每章先展示数据源配置，再展示日志、图表或设备应答。HEX 使用 PING、START_NMEA、STOP_NMEA、READ_GNSS_STATUS，协议和使用手册、模拟器保持一致。输出为 **1920×1080、30 fps，H.264 + AAC**；本轮实际时长、章节偏移及验收结果记录在 `tmp/video/work/delivery-validation.json`。

本次直接流复制拼接的版本在抽帧验收时出现片头缺失，随后改为统一重编码并恢复正确时间轴。不能只凭总时长或解码成功就认定拼接正确，必须对拼接后的成片逐章抽帧。

每段合成后立即抽帧；拼接后再检查片头与正文的衔接、字幕遮挡和音画同步。最终至少验证：

```bash
ffprobe -v error -show_entries format=duration,size -show_streams "../../04-GNSS/中科院北斗所/2.1-测试软件-基础功能测试程序开发/03-日志查看程序/Nav-Tools-Serial-使用教程.mp4"
ffmpeg -v error -i "../../04-GNSS/中科院北斗所/2.1-测试软件-基础功能测试程序开发/03-日志查看程序/Nav-Tools-Serial-使用教程.mp4" -f null -
```

交付检查：

- CSV、正则、NMEA 图表、Status View、Hex 组件和原始应答均有真实画面。
- 中文术语、按钮名称与当前应用一致。
- 字幕、语音与实际操作同步，声音自然、无削波。
- 片头、片尾和章节切换没有黑帧、冻结帧或重复片段。
- 视频、使用手册和模拟器中的帧格式、端口号、路径一致。
- 保留最终视频、手册、模拟器和示例配置；最终录制脚本放在 `tmp/video/recorder`，清理临时截图、语音、过期脚本和临时依赖。
- 停止模拟器并检查串口占用；会话任务显示 `lost` 时仍需检查实际 OS 进程，不能假定它已经退出。

## 7. 避免终端阻塞拖住制作

长时间录屏、语音生成和 FFmpeg 合成应作为独立后台任务执行，写独立日志，并立即记录任务 ID。没有任务 ID 就不要认为它已成功进入后台。

此前 Kimi Bash 接口的 `timeout` 按秒使用；它约束已启动的任务，不是覆盖审批、调度和环境准备的全局看门狗。前台超时默认可能转后台，而不是终止。当前 Codex `exec_command` 的 `yield_time_ms` 是返回持续运行会话的等待时间，也不代表终止进程。脚本内仍应有总看门狗和明确退出码，但它们不能替代工具返回。

若工具调用没有返回：

1. 不要连续重试同一命令。
2. 查看日志是否已产生，区分“未启动”“快速失败”“运行后未完成”“已完成但通知未回传”。
3. 检查后台任务列表和实际进程，不凭界面计时判断进程状态。
4. 保留会话诊断材料，必要时重启宿主应用后再继续。

本次 Kimi Code 终端阻塞的源码分析和证据见 [kimi-code-terminal-blocking.md](kimi-code-terminal-blocking.md)。这份制作指南只给出执行原则，不把尚未定位的宿主问题宣称为已修复。

## 8. 本次真实录制的复现入口

保留的制作脚本位于 `tmp/video/recorder/`：

- `start-navtools.ps1`：启动用于捕获的本地应用实例。
- `start-simulator.ps1` / `stop-simulator.ps1`：启动或停止指定模式的模拟设备。
- `record-scene.ps1`：每章启动新的限时模拟器，并在成功或失败后回收，避免模拟器已到期退出而录屏仍继续。
- `record-real-scene.mjs`：分别录制 `csv`、`regex`、`nmea`、`hex` 四个真实章节。
- `real-video-lib.mjs` / `ui-lib.mjs`：真实 UI 操作、数据源配置和画面捕获。
- `compose-real-video.py`：按实际片段时长合成语音、字幕、片头和片尾。
- `verify-simulator.py`：通过实际 COM21 ↔ COM22 收发验证四种模式、分片帧、校验及 NMEA 开关；每个子进程均限时并在结束时回收。
- `validate-video.py`：完整解码、音量和黑帧检查，并从成片逐章抽帧，输出 `delivery-validation.json`。

从项目根目录运行，一次只使用一种模拟器模式。例如：

```powershell
& tmp/video/recorder/start-navtools.ps1
& tmp/video/recorder/record-scene.ps1 -Mode csv
& tmp/video/recorder/record-scene.ps1 -Mode regex
& tmp/video/recorder/record-scene.ps1 -Mode nmea
& tmp/video/recorder/record-scene.ps1 -Mode hex
python tmp/video/recorder/compose-real-video.py
python tmp/video/recorder/validate-video.py
```

包装脚本为 CSV、正则和 HEX 启动对应模拟器；NMEA 使用现成文件，不需要模拟器。录制脚本检查实际字段和 HEX 收发证据，合成脚本要求四章均有成功记录，拒绝带错误或超时的日志。临时语音依赖按第 5 节安装后使用，交付时可删除。

录制脚本生成 `tmp/video/work/real-video/serial-final-candidate.mp4`。必须先完整解码、抽帧和检查音轨，再复制为正式交付文件；不要未经验证覆盖已有成片。脚本中的应用路径、FFmpeg 路径和样本路径是当前 Windows 环境配置，迁移环境时应相应修改。

录制专用启动参数不要留给普通使用。完成后关闭录制实例，直接启动本地 Nav-Tools，恢复正常的图形加速与非调试模式。

## 9. 图文 PDF 与本轮验收

配图从合成后的成片提取。`tmp/pdf/prepare_assets.py` 根据章节清单计算时间，不沿用旧视频的固定秒数；数据源配置、曲线、Status View 和 HEX 配置都应在对应步骤出现。GNSS 截图沿用原实机教程，账号和密码不得出现在新增文案中。

```powershell
python tmp/pdf/prepare_assets.py
python tmp/pdf/build_pdf.py
python tmp/pdf/verify_pdf.py
```

PDF 先生成到 `tmp/pdf`。检查目录、页码、配图、协议字段、空白页和实际渲染图，再复制到交付目录。串口接入截图不能配成“应用选择器”，有数据的工作台截图不能用尚未连接的空界面代替。

视频和 PDF 都通过验收后，运行 `python tmp/video/recorder/deliver.py`。该脚本检查验收报告是否晚于当前候选文件，备份已有交付物，再复制 MP4、SRT、PDF、Markdown 手册、模拟器和示例配置，并记录 SHA-256。交付目录中的 `交付验收.json` 记录成片时长、章节、编码和文件校验值；旧版保留在 `tmp/video/work/previous-delivery/`。

本轮还修正了模拟器 NMEA 坐标分钟部分多补一位零的问题：纬度为 `ddmm.mmmm`，经度为 `dddmm.mmmm`。串口检查同时核对格式、还原后的坐标范围和 XOR 校验；仅校验和正确不足以证明内容正确。
