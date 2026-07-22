# 经验 1:输入框鼠标点击失焦问题

## 现象
应用中所有文本输入框（"数据接入"弹窗的文件路径、网络 IP、端口输入框，以及各处卡片/弹窗内的输入框）：
用**鼠标点击**后，光标只会短暂出现，随后迅速消失，无法输入内容；输入框保留 `:focus` 样式但看不到光标。用 **Tab 键**切换焦点时，光标能保持，键盘输入正常。

## 根因
`src/components/Dashboard.vue` 在 `onMounted` 中注册了一组 window 级监听器：

```ts
onMounted(() => {
  window.addEventListener('pointerup', endGridResize)
  window.addEventListener('pointercancel', endGridResize)
  window.addEventListener('blur', endGridResize)
})
```

`endGridResize` 会调用 `clearTextSelection()`（即 `window.getSelection()?.removeAllRanges()`）。这组监听器的本意是"结束网格缩放时收尾"，但注册后**无条件**生效：每次鼠标点击抬起（pointerup）的瞬间，点击刚在输入框里建立的文本光标（selection/caret）就被 `removeAllRanges()` 抹掉。于是：

- 输入框拿到 DOM 焦点（`activeElement` 正确），`keydown`/`keypress` 也正常派发；
- 但光标（selection）已不存在，Chromium 不再产生 `beforeinput`/`input` 事件，文本无法插入；
- 视觉上就是"焦点闪现后消失"。

Tab 键聚焦不经过 pointerup，因此完全不受影响。

该问题代码随 `85ffbed84`（"fix: improve window focus handling and panel structure"）引入。此前同类症状曾被归因为 `-webkit-app-region: drag` 拖拽区命中检测（旧 `.title-bar` 时代）；当前代码中已不存在任何 `app-region: drag`（标题栏已改为 IPC 手动拖拽），相关 `no-drag` CSS 对本问题无实际作用。

## 调试过程
1. **真实输入管线复现**：用 PowerShell `mouse_event`/`SendKeys` 做真实物理点击与键盘输入，同时用 CDP(`--remote-debugging-port`）观察页面。发现点击后 `activeElement` 确实是目标 input、`keydown`/`keypress` 正常，但**没有 `beforeinput`/`input` 事件**，且 `selectionStart` 为 0（光标未建立）；Tab 键或 JS `focus()` 聚焦则一切正常。
2. **逐项排除**：
   - `app-region`：当前源码及运行时页面中不存在任何 `app-region: drag`（标题栏已改为手动 IPC 拖拽）；
   - 平台/系统环境：极简 Electron 对照窗口（`frame: false` + 裸 input）完全正常；
   - 主进程/preload：同一窗口内导航到极简页面，点击输入正常；
   - Element Plus / 全局 `style.css` / vue-devtools：独立探针页面（引入 Element Plus 与应用全局样式）点击输入正常；
   - `ToolBar.vue` 中已有的规避代码（`restorePointerInputFocus`、`forceNoDragOnDataInputDialog`）：运行时抑制后问题依旧，且 `restorePointerInputFocus` 实测从未被触发——对本根因无效。
3. **组件二分定位**：在 `App.vue` 根部放裸 input 仍复现 → 逐个摘除 `AppHeader`、`WindowResizeHandles`、`Dashboard`。摘除 `Dashboard` 后恢复正常；进一步将 Dashboard 的子组件（ToolBar、StatusBar、grid、ApplicationSelector）全部摘除仍复现 → 定位到 Dashboard 自身 setup 代码中的上述 window 监听器。
4. **机制验证**：给 `endGridResize` 加上 `isGridResizing` 守卫后，点击输入光标与输入立即恢复，证实因果。

## 解决方案
`src/components/Dashboard.vue` 的 `endGridResize` 增加守卫，只在真正处于网格缩放状态时才执行：

```ts
function endGridResize() {
  if (!isGridResizing.value) return
  isGridResizing.value = false
  document.documentElement.classList.remove('dashboard-resizing')
  clearTextSelection()
}
```

`beginGridResize` 中清除选择的逻辑保持不变（对应 e2e "prevents text selection in adjacent cards while resizing"，缩放开始时清除选择是预期行为）。

## 验证结果
- 真实鼠标 + 真实键盘（SendKeys）实测：数据接入弹框的文件路径、网络 IP、端口输入框点击后光标保持，`beforeinput` 正常，可输入文本。
- `pnpm typecheck` 通过；`pnpm test` 19/19 通过；`npx playwright test` 9/9 通过。

## 注意事项
- **Playwright e2e（浏览器内合成事件）无法复现此类问题**：光标被清除后，浏览器内的键盘输入仍会落到聚焦的输入框中，因此此前针对该问题的 e2e 用例（click + `keyboard.type`）一直全绿，但 Electron 真实 OS 环境下依然复现。验证此类问题必须使用真实 OS 级鼠标点击（如 `mouse_event`）与真实键盘输入（如 `SendKeys`），并以 `selectionStart` 是否建立、`beforeinput` 是否触发作为判据，而非仅看 `document.activeElement`。
- `ToolBar.vue` 中为此问题加入的 `restorePointerInputFocus`、`forceNoDragOnDataInputDialog`、`dataInputMutationObserver` 等规避代码对本根因无效，且 `forceNoDragOnDataInputDialog` 每次点击会触发数百次无效样式写入，属冗余代码，可后续清理（暂保留不影响功能）。

---

# 经验 2:组件窗口全屏后被 Header 覆盖问题

## 现象
在 Dashboard 中点击某个组件窗口的"全屏"按钮后，组件窗口会被顶部的 Web Header（以及 Toolbar）覆盖一部分内容，导致内容显示不全。

## 根因
项目从 Electron 原生标题栏切换为纯 Web 实现的 `AppHeader` 后，`AppHeader` 固定在页面顶部，高度为 `var(--app-header-height, 38px)`。而 Dashboard 中全屏卡片（`.full-screen-card`）使用 `position: fixed` 相对于视口定位，原来的 CSS 只考虑了 Toolbar 的占位，没有考虑 `AppHeader` 的高度，导致全屏卡片顶部从 `0` 或 `40px` 开始，与 Header/Toolbar 重叠。

## 调试过程
1. 检查 `src/components/Dashboard.vue` 的全屏卡片样式，发现 `.toolbar-top .full-screen-card` 等规则只使用 `40px` 作为 Toolbar 尺寸，没有使用 `--app-header-height`。
2. 检查 `src/App.vue`，确认已定义 `--app-header-height: 38px`。
3. 通过 Playwright CDP 连接 Electron 实测：默认 Toolbar 在底部时，全屏卡片 `y=38`、底部与 Toolbar 顶部对齐，但仍需验证其它 Toolbar 位置。
4. 检查其它可能受 Header 影响的元素：
   - Toolbar/StatusBar 拖拽时的 dock-zone 预览层 `z-index: 998`，低于 Header 的 `6000`，拖拽时会被 Header 盖住。
   - ApplicationSelector 的 `z-index: 3000`，也可能被 Header 覆盖。

## 解决方案
1. **`src/App.vue`** 增加全局 CSS 变量：
   ```css
   :root {
     --app-header-height: 38px;
     --app-toolbar-size: 40px;
   }
   ```

2. **`src/components/Dashboard.vue`** 重写全屏卡片定位规则，统一使用 `var(--app-header-height)` 和 `var(--app-toolbar-size)`：
   ```css
   .toolbar-top .full-screen-card {
     top: calc(var(--app-header-height, 38px) + var(--app-toolbar-size));
     height: calc(100vh - var(--app-header-height, 38px) - var(--app-toolbar-size));
   }

   .toolbar-bottom .full-screen-card {
     top: var(--app-header-height, 38px);
     bottom: var(--app-toolbar-size);
     height: calc(100vh - var(--app-header-height, 38px) - var(--app-toolbar-size));
   }

   .toolbar-left .full-screen-card,
   .toolbar-right .full-screen-card {
     top: var(--app-header-height, 38px);
     height: calc(100vh - var(--app-header-height, 38px));
   }
   ```
   同时把全屏模式下卡片内容区高度从 `calc(100% - 60px)` 修正为 `calc(100% - 45px)`，与 `.full-screen-header` 的 `45px` 高度一致。

3. **`src/components/ToolBar.vue`** 和 **`src/components/StatusBar.vue`** 将拖拽 dock-zone 预览层的 `z-index` 从 `998` 提升到 `9000`，确保拖拽时预览层位于 Header 之上。

4. **`src/components/ApplicationSelector.vue`** 将选择器遮罩层 `z-index` 从 `3000` 提升到 `8000`，避免被 Header 覆盖。

## 验证结果
- Electron 实测：Toolbar 在底部时，全屏卡片 `top = 38px`（Header 高度），`bottom` 与 Toolbar 顶部对齐，不重叠。
- CSS 计算：全屏卡片高度 = `100vh - 38px - 40px = 722px`（在 800px 窗口下），与实测一致。
- 卡片内容区高度 = 卡片高度 - 全屏头部高度 45px，布局正常。
- Playwright e2e：`npx playwright test --config playwright.config.ts tests/e2e/application-selector.spec.ts` → **7 passed**。

## 注意事项
- 全屏卡片使用 `position: fixed`，必须显式计算 Header 和 Toolbar 的占位，不能依赖父级 flex 布局。
- `z-index` 调整仅影响固定定位的遮罩/预览层，正常内容层级不变。

---

# 经验 3:独立窗口（Detached Card Window）数据链路断开问题

## 现象
将 Dashboard 中的某个组件窗口（例如 GNSS Deviation）分离为独立窗口后，该窗口中的图表/数据不再更新，看起来数据链路断了。关闭独立窗口并将其恢复回 Dashboard 后，又能正常绘图。

## 根因
实时数据流（串口/网络）只在主窗口的渲染进程中处理：

1. `src/hooks/useDevice.ts` 中，`serialService`/`networkService` 收到数据后调用 `routeIncomingData()`。
2. `IncomingDataRouter` 根据主窗口当前应用的 `activeDataModes` 和 `activeWindowIds` 把数据分发到主窗口的本地状态（GNSS NMEA 状态、Flow 数据等）。
3. 独立窗口运行在另一个 Electron `BrowserWindow`/渲染进程中，它有自己的 Vue 实例和组合式函数状态，但收不到主窗口的数据，也无法从 `useApplicationSelector()` 拿到主窗口的窗口列表，因此不会更新。

## 解决方案
建立"主窗口 → 主进程 → 独立窗口"的数据广播链路：

1. **`src/hooks/useDevice.ts`**
   - 本地路由完成后，若当前渲染进程持有已配置的设备（`globalDevice.value.connected !== null`），则通过 `ipc.send('broadcast-incoming-data', data)` 把原始数据发送给主进程。
   - 新增导出函数 `routeDataToWindow(data, windowId)`，用于让独立窗口按自己的窗口类型做本地路由。

2. **`electron/main/index.ts`**
   - 监听 `broadcast-incoming-data`，遍历 `detachedPanels` 中记录的所有独立卡片窗口，通过 `webContents.send('incoming-data', data)` 转发。

3. **`src/components/CardWindow.vue`**
   - 从 URL hash 中解析出 `windowId`。
   - 监听 `incoming-data` 通道，收到数据后调用 `routeDataToWindow(data, windowId)`，把数据注入到当前独立窗口的本地状态中。

## 验证
- `pnpm typecheck` 通过。
- Playwright e2e：`npx playwright test --config playwright.config.ts tests/e2e/application-selector.spec.ts` → **7 passed**。
- 逻辑上，独立窗口现在会接收到与主窗口相同的原始数据流，并根据自身窗口 ID（如 `gnss-deviation`、`plot`、`raw-messages`）调用对应的 `appendGnss`/`appendPlot`/`appendRaw` 目标，从而更新本地状态和图表。

## 注意事项
- 该方案广播的是**原始数据**，独立窗口会按自己的窗口类型重新路由，不会受主窗口当前应用布局的影响。
- 当前独立窗口使用固定的 `displayFormat: 'ascii'` 进行路由。如果未来需要让独立窗口也支持 hex/ascii 显示格式切换，需要把主窗口的格式状态一并广播，或在独立窗口中单独维护。
- 文件输入（`handleFileSubmit`）目前不经过 `routeIncomingData`，因此文件加载的数据不会被转发到独立窗口；如需支持，可后续扩展。

---

# 经验 4:RTSP 无法播放（Error number -135)

## 现象
VLC 可以正常播放 `rtsp://192.168.3.14:8554/rgbstream`，但 Camera Video 面板无法播放，报错："视频连接失败，Error opening input files: Error number -135 occurred"。

## 根因
该相机的 RTSP 服务**不支持 TCP 交织传输（RTP over TCP)**。FFmpeg 以 `-rtsp_transport tcp` 发起 SETUP 时被服务器拒绝：

```
[rtsp] method SETUP failed: 461 Unsupported transport
[in#0] Error opening input: Error number -135 occurred
```

VLC 默认**先尝试 UDP、失败再回退 TCP**，所以能播；而 `electron/main/services/CameraStreamService.ts` 原来写死了 `-rtsp_transport tcp`，直接被 461 拒绝。

注意 FFmpeg 的错误输出有"包装行"问题：`Error number -135 occurred`、`Error opening input file...` 这类最后一行不含任何有效信息，真正的原因（如 `461 Unsupported transport`）在它前面几行。

## 调试过程
1. 用项目自带的 `node_modules/ffmpeg-static/ffmpeg.exe`，以与代码完全相同的参数实测：
   - `-rtsp_transport tcp` → 复现 `461 Unsupported transport` + `Error number -135`;
   - `-rtsp_transport udp` → 正常解码出帧（约 12~15 fps)。
2. 先用 `echo > /dev/tcp/<ip>/<port>` 之类的手段确认网络可达，可以排除"网络不通"方向，把问题收敛到协议/传输层。

## 解决方案
`electron/main/services/CameraStreamService.ts` 改为与 VLC 一致的传输回退策略：

- **先 UDP，失败或未收到视频帧则自动回退 TCP**，兼顾只支持 UDP 和只支持 TCP 的相机；
- 增加 **10 秒无帧看门狗**：覆盖"UDP SETUP 成功但 RTP 包被防火墙/NAT 吞掉"的假连接（此时 FFmpeg 不报错也不出帧，必须主动超时换传输）;
- 错误信息提取跳过 `Error number ...`/`Error opening input ...` 包装行，优先展示具体原因行；
- 同时将 MJPEG 编码质量从 `-q:v 5` 提升到 `-q:v 2`，保证小字号文字（如检测框标签）在重编码后仍清晰可读。

## 验证结果
- 真实相机实测：`connecting → playing`,15 秒收到 156 帧；中途断流可自动重连恢复。
- `pnpm typecheck` 通过；`pnpm test` 30/30 通过；`npx playwright test` 9/9 通过。

## 注意事项
- 排查 RTSP 问题时，**FFmpeg 的最后一行错误往往没有信息量**，要往前看几行找 `4xx/5xx` 或 `failed` 关键字。
- RTSP 相机对传输方式的支持各不相同，客户端侧做"UDP ↔ TCP 自动回退 + 无帧超时"是最省心的兼容方案，与 VLC 行为一致。
- 不要用 `ping` 判断 RTSP 可达性；应直接探测 TCP 端口（很多设备禁 ping 但 RTSP 正常）。
