# 数据接入弹窗输入框失焦问题

## 现象
在 Electron + Vue 项目中，工具栏的"数据接入"弹窗里：
- **文件输入**标签页的文件路径输入框
- **网络连接**标签页的 IP 地址、端口输入框

用**鼠标点击**后，光标只会短暂出现，随后迅速失焦，无法输入内容。用 **Tab 键**切换到这些输入框时，焦点却能保持，键盘输入正常。

## 根因
这是 Electron 无边框窗口下 `-webkit-app-region: drag` 拖拽区的典型表现：

- 鼠标点击会触发操作系统层的拖拽区命中检测。如果点击位置（或其继承到的区域）没有显式声明 `-webkit-app-region: no-drag`，Electron/Windows 会把这次点击识别为"准备拖动窗口"，导致输入框刚获得的焦点被系统抢走。
- Tab 键切换焦点不经过鼠标/拖拽检测，所以不受影响。

项目窗口为无边框（`electron/main/index.ts` 中 `frame: false`），标题栏 `.app-header` 设置了 `-webkit-app-region: drag`。如果弹窗及其输入框没有被显式标记为 `no-drag`，就会出现点击失焦的问题。

## 调试过程
1. **浏览器环境无法复现**：用 Playwright 在 Chromium 中直接点击输入框，`document.activeElement` 保持为 `input`，键盘输入正常。说明问题只在 Electron 运行环境出现。
2. **旧发布包缺少修复样式**：检查 `release/1.0.3-20260226/win-unpacked/resources/app.asar` 中的 CSS，全量样式里只有 1 处 `app-region:drag`、2 处 `app-region:no-drag`，且完全没有 `.data-input-dialog` 相关规则。说明旧安装包里没有针对该弹窗的 `no-drag` 修复。
3. **当前源码已包含部分修复**：`src/components/ToolBar.vue` 中已有 `:global(...)` 规则给 `.data-input-overlay`、`.data-input-dialog` 及其内部输入框设置 `no-drag`。
4. **为增强可靠性，进一步补齐全局兜底**：
   - 在 `src/style.css` 中给 `body` 加 `-webkit-app-region: no-drag`，让除标题栏外的所有内容默认不参与拖拽。
   - 在 `src/style.css` 中把弹窗相关的 `no-drag` 规则提升为全局样式并加 `!important`，避免 scoped style 或后续样式覆盖失效。
   - 把 `src/components/ToolBar.vue` 中已有的 `no-drag` 规则也改成 `!important`。
5. **实测验证**：用 `pnpm run dev:web` 启动 dev server，再用 `node_modules/.bin/electron .` 加载页面，通过 Playwright CDP 连接测试，鼠标点击文件路径、网络 IP、端口输入框后焦点均保持，可正常输入。

## 解决方案
### 代码改动
1. `src/style.css`
   ```css
   body {
     /* Electron frameless windows default everything to no-drag; only the title bar is draggable. */
     -webkit-app-region: no-drag;
   }

   /* Ensure the data-input dialog and its teleported overlay/popups are never treated as drag regions. */
   .data-input-overlay,
   .data-input-overlay *,
   .data-input-overlay .el-overlay-dialog,
   .data-input-dialog,
   .data-input-dialog *,
   .data-input-dialog .el-input__wrapper,
   .data-input-dialog .el-input__inner,
   .data-input-dialog input,
   .data-input-dialog textarea,
   .data-input-dialog .el-select,
   .data-input-dialog .el-button,
   .el-popper,
   .el-select-dropdown,
   .el-select-dropdown * {
     -webkit-app-region: no-drag !important;
   }

   .data-input-dialog .el-input__inner,
   .data-input-dialog input,
   .data-input-dialog textarea {
     user-select: text;
     -webkit-user-select: text;
     pointer-events: auto;
   }
   ```

2. `src/components/ToolBar.vue`
   将已有的 dialog no-drag 规则改为 `!important`：
   ```css
   -webkit-app-region: no-drag !important;
   ```

3. `tests/e2e/application-selector.spec.ts`
   将文件路径、网络地址、端口输入框的验证从直接 `fill()` 改为真实点击并断言焦点保持：
   ```ts
   await filePathInput.click()
   await expect.poll(() => filePathInput.evaluate((el) => el === document.activeElement)).toBe(true)
   await page.keyboard.type('C:\\data\\sample.log')
   await expect(filePathInput).toHaveValue('C:\\data\\sample.log')
   ```

## 验证结果
- Electron 实测：鼠标点击"数据接入"弹窗中的文件路径、网络 IP、端口输入框后，`document.activeElement` 保持为对应 `input`，`keyboard.type()` 可正常写入。
- 标题栏仍可拖拽：`getComputedStyle('.app-header').webkitAppRegion === 'drag'`。
- Playwright e2e：`npx playwright test --config playwright.config.ts tests/e2e/application-selector.spec.ts` → **7 passed**。

## 注意事项
- 旧发布包 `release/1.0.3-20260226` 没有上述修复，必然复现该问题。需要用当前源码重新构建。
- ~~完整 `pnpm build` 可能因 `node-abi` 无法识别 Electron 39.2.7 而失败。~~ 已通过 `pnpm.overrides` 将 `node-abi` 升级到 `^3.94.0`，`pnpm build` 现在可以正常完成。

---

# 组件窗口全屏后被 Header 覆盖问题

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

# 独立窗口（Detached Card Window）数据链路断开问题

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
