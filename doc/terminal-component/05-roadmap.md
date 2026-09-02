# 终端组件演进路线图（对齐 Warp 形态，排除 AI）

> 状态：**批次 1–4 已全部实现**（2026-09-01，本地提交未推送），逐文件记录见 `codebuddy-work.md`，
> 与原设计的偏离见 `04-design.md` §11。应用内人工验证未做（用户要求四批做完统一验证）。
> 需求口径见 `01-requirements.md`，可行性边界见 `01-requirements.md` §4，
> 目标设计见 `04-design.md`，现状见 `03-implementation.md`。
>
> 定位：参照 Warp 的**产品形态**逐项补齐功能，但**不复制其代码**
> （Warp 为 AGPL-3.0-only，本项目为 MIT，见 `research/survey-notes.md` §1）。

## 0. 三条原则（写死，避免返工）

1. **复制功能 ≠ 复制代码。** 按行为自己实现。
2. **从"行为规范"出发实现，不对照源码逐行转写。** 功能与算法思想不受版权保护，
   逐行翻译构成衍生作品。
3. **排除 AI。** 含 Warp 的 agent view block、notebooks、`resources/bundled/skills/`
   整套 agent 机制。

## 1. 已锁定的决策

| # | 决策 | 说明 | 落地情况 |
|---|---|---|---|
| 1 | **文件点击 = 块内预览** | 复用 `TerminalRichContent.vue` 的 MIME 渲染器，在块内可折叠区域展示 | ✅ 批次 1 |
| 2 | 目录点击 = **就地展开文件树** | 不"预览"目录；与 B#5 文件树复用同一组件 | ✅ 2026-09-02 T1 补齐；块内树与侧边树共用 `TerminalFileTree.vue` |
| 3 | 二进制 / 超限 / 非白名单 | 显示文件名 + 大小 + 「用外部程序打开」，不硬渲染 | 🟡 部分——超限走截断提示，二进制/不支持类型显示「无法读取」 |
| 4 | **预设命令做 L1 + L2** | L1 快捷方式先发，L2 表单工作流随后（见 §4） | ✅ 批次 2 / 批次 3 |

## 2. 现状基线

| 项 | 数据 |
|---|---|
| 终端子系统规模 | 7641 行 / 18 文件（2026-08-30 实测；批次 1–4 后新增 `src/core/terminal/` 8 个模块与 2 个面板组件） |
| 三大文件 | `Terminal.vue` 1181、`TerminalPane.vue` 1195、`TerminalService.ts` 1206（合计 47%） |
| 渲染侧耦合 | UI 库 + `@/core/terminal/*`；事件总线与翻译函数均经终端协议注入，**未直接引用 app i18n / hook / store / 设备 hook / 数据路由 / 面板注册表** |
| 主进程侧耦合 | `TerminalService` 只依赖构造函数传入的 `TerminalServiceHost`；Node 内建、`node-pty`、`ssh2` 与 `SshPortForwardService` 集中在生产适配器 |
| 已有能力 | 命令块、块状态/退出码/cwd、复制/重跑/折叠、GUI 块内输入、富内容块、递归分屏、标签拖拽、SSH/SFTP、端口转发、布局与会话持久化、快捷键可配置 |
| ~~缺失~~ | ~~搜索、块间导航、命令历史模糊搜索、路径可点击、文件树、预设命令、补全~~ → **已全部补齐**（批次 1–4，2026-08-31～09-01） |
| SFTP 能力 | 有 `readdir` / `stat` + **读文件（批次 1 `readSessionPath`）** + **三通道列目录（批次 2 `listSessionPath`：本机 fs / WSL `find` / SSH sftp）** |

## 3. 功能清单与取舍

### A 类：已具备（0 成本）

命令块分块、块头状态、退出码、cwd、复制、重跑、折叠、GUI 块内输入、
富内容块（Markdown/JSON/CSV/图片）、递归分屏、标签拖拽、SSH+SFTP、
端口转发、布局与会话持久化、快捷键可配置与恢复默认。

**Warp 的核心卖点「分块」已经完成。**

### B 类：高价值 + 小成本（第一批）—— ✅ 全部完成（批次 1）

| # | 功能 | 实现要点 | 状态 |
|---|---|---|---|
| B1 | **输出内路径可点击 → 块内预览** | 见 §3.1 | ✅ 文件预览；目录点击块内树由 T1 补齐 |
| B2 | **搜索**（块内 + 全局） | xterm 官方 `@xterm/addon-search`；GUI 视图内另需一套文本搜索 | ✅ |
| B3 | **命令历史模糊搜索**（Ctrl+R） | 纯前端；GUI 输入行已存会话内历史，扩展即可 | ✅ |
| B4 | **内容嗅探 + 「渲染/原始」切换** | 不改 shell，对 SSH 会话同样有效，覆盖长尾 | ✅ |

### C 类：高价值 + 中成本（第二/三批）—— ✅ 全部完成（批次 2–4）

| # | 功能 | 实现要点 | 状态 |
|---|---|---|---|
| C1 | **文件树面板** | 已有 `terminal-sftp-list` → `sftp.readdir` 地基（远程列目录已打通）；本地侧补 `fs.readdir` 对称 IPC | ✅ 侧边面板；T1 后与块内目录树共用树组件与三通道 |
| C2 | **预设命令 L1** | 名称 + 命令 + 工作目录；复用 `terminal-session-write` | ✅；T9 增加全局 + 项目作用域 |
| C3 | **预设命令 L2** | 表单工作流，见 §3.2 | ✅（转义收敛到主进程，见 §3.2 更新） |
| C4 | **命令补全** | 数据源走 withfig（MIT）；**不用** Warp 的 `command-signatures-v2`（AGPL） | 🟡 变体——历史补全 + 手写规格，未引 withfig 数据集 |
| C5 | **块间跳转导航** | 块模型已就绪，加导航成本低 | ✅ |

### D 类：明确不做

- 内置编辑器（Warp Code）——偏离"终端"这一件事
- Notebooks / Warp Drive——AI 相关且场景不符
- `command-signatures-v2` 数据——AGPL
- 主题市场、云同步、多端——单人项目的长期负担

## 3.1 B1 路径可点击 → 块内预览：三种会话类型的取内容通道

| 会话类型 | 路径形态 | 现状 | 需要补 |
|---|---|---|---|
| 本地（PowerShell / CMD / Git Bash） | Windows 路径 | 主进程可直接读 | 新增一个读文件 IPC（`fs.readFile` + 大小上限） |
| SSH | 远端路径 | 有 `readdir`/`stat`，**无读文件** | 新增 `sftp.createReadStream` 读文件 IPC |
| **WSL** | distro 内 Linux 路径 | 主进程**读不到**（不在同一棵文件系统树） | 走 `wsl.exe -d <distro> cat <path>`（`execFile` 已具备，现用于 `wsl.exe --list --quiet` 探测发行版）；或直接降级为不可预览 |

**路径检测策略**（对齐 Warp `link_detection.rs` 的两级思路，只抄策略不抄代码）：

1. 维护当前目录的条目名集合（缓存）
2. 候选词**不含路径分隔符且不在集合内** → 直接否定（省一次 IO）
3. 含分隔符的候选才做真实存在性校验
4. 支持 `file:line:column`（编译错误、`grep -n` 输出）
5. **本地会话才启用**（对齐 Warp 的 `local_fs` 门控）；SSH/WSL 视 §3.1 通道能力决定

## 3.2 C3 预设命令 L2：必须与 L1 拆分发布

L1 与 L2 都做，但**不一起发布**——L1 先发验证需求，L2 随后。

**L1 形态**

```json
{ "name": "拉取代码", "command": "git pull --rebase", "cwd": "~/E-Wagon" }
{ "name": "查看磁盘", "command": "df -h" }
```

**L2 形态**（Warp Workflows 等价物）

```json
{
  "name": "交叉编译",
  "command": "make -j{{jobs:8|4|16}} TARGET={{target:arm64|amd64}}",
  "cwd": "~/E-Wagon"
}
```

`{{...}}` 渲染为表单控件（下拉 / 输入 / 勾选），填完拼成命令。需要额外做：
表单引擎、参数类型与默认值、校验、执行历史、变量解析。

**⚠️ L2 的唯一重大风险：shell 注入。**

参数值插值进 shell 命令时**必须按目标 shell 语义转义**，否则一个参数值就能截断命令
（`; rm -rf` 之类）。要点：

- L1 无此问题（命令固定）
- L2 必须实现转义，且 **bash 与 PowerShell 规则不同**
- 转义要在**主进程/会话写入前**统一做，不能散落在 UI 层
- 需要为每个新增的预设命令模板补一条「恶意参数值」的契约测试

> ✅ **落地情况（批次 3，2026-08-31）**：解析/插值在 `src/core/terminal/CommandTemplate.ts`（纯函数 + 12 单测）；
> 转义在**主进程** `TerminalService.runSessionCommand` 里按**会话自身** shell 家族完成
> （`shellFamilyForSession`，渲染层传不进来，无法谎报或漏转义）；
> 恶意参数值契约测试用共享分词助手 `tests/helpers/shell-tokens.ts` 断言结构，不手算转义串。
> 2026-09-02 T5 补齐布尔类型：`{{name:bool}}` 默认未勾选，`{{name:bool=true}}` 默认勾选；
> UI 使用勾选框，写回值只允许规范化的 `true` / `false`，再沿用主进程统一转义。

## 3.3 T9 预设命令项目级作用域

活动会话有明确 cwd 时，预设面板额外读取该目录下的 `.nav-tools/terminal-presets.json`，
与 localStorage 全局项合并；项目项排在前面并显示「项目」标签，只读且不覆盖同名全局项。
切换会话或收到 cwd 更新会重新装载，不向父目录搜索。配置复用 `{ "version": 1, "presets": [...] }`
结构并限制为 256 KiB；单条脏数据跳过，文档版本错误、结构无效或超限时只保留全局项。

初始本地 cwd 与 SSH `initialDirectory` 会随 `TerminalSessionInfo` 返回，后续 cwd 由既有
OSC 7 / OSC 9;9 事件更新；因此项目目录判定始终跟随主进程持有的会话 cwd。项目命令执行仍走
`terminal-session-run-command`，L2 参数继续在主进程按目标 shell 经 `ShellQuote` 转义。

## 4. 分批路线

| 批次 | 内容 | 可独立发布 | 状态 |
|---|---|---|---|
| 第一批 | B1 路径预览 → B2 搜索 → B3 历史搜索 → B4 嗅探 + 渲染/原始切换 | 每项单独可发 | ✅ 已完成并推送 |
| 第二批 | C1 文件树 → C2 预设命令 L1 | 建议同批（文件树服务目录预览） | ✅ 已完成（本地） |
| 第三批 | C3 预设命令 L2（表单工作流） | 独立版本 | ✅ 已完成（本地） |
| 第四批 | C4 补全 → C5 块间导航 | — | ✅ 已完成（本地） |
| **独立轨道** | 删除 `normalizeTerminalLayout`，块内容改从 `xterm.buffer.active` 派生 | 无用户可见收益，但终结 bug 源 | ❌ 未做，也未被要求做 |

四批全部完成后，**剩余待办只有应用内人工验证**（清单与入手顺序见 `codebuddy-work.md` §7–§8）。

独立轨道与四批无强依赖：路径检测与内容嗅探消费的都是「块输出文本」，
无论文本来自哪套实现都能工作。

## 5. 长期：终端是否拆成独立项目

**结论：现在不拆；先做内部边界加固，稳定后拆成同仓 package（pnpm workspace 加
`packages:` 字段），不建议独立仓库。**

理由：

1. 拆仓的技术前提已具备；原有 app 级耦合点 `@/hooks/useMitt` 与 `@/i18n` 已在 T6 / T7 改为依赖注入，
   主进程宿主能力也已在 T8 收敛到构造函数注入的 `TerminalServiceHost`，
   **唯一阻碍是设计仍在变化**——这几轮方案已调整多次（ls 包装 → 路径检测、
   `normalizeTerminalLayout` 去留顺序）。在移动靶上拆仓等于重构两遍。
2. 独立仓库对单人项目收益≈0（消费者只有 Nav-Tools 一个），成本却是双 CI、
   双 issue、跨仓调试、发布流程。
3. 同仓 package 能拿到 90% 的收益（边界清晰、独立测试、将来可发布），
   成本只有加一个 workspace 字段。

**现在就该做的三件事**（为将来拆分做"可提取性"准备）：

1. ✅ `@/hooks/useMitt` 改为依赖注入——应用组合根提供类型化 `TerminalEventBus`，终端组件只依赖注入协议（2026-09-02 T6）
2. ✅ i18n 依赖显式化——应用组合根提供 `TerminalTranslate`，终端组件只消费注入函数（2026-09-02 T7）
3. ✅ 主进程 `TerminalService` 的对外依赖全部走构造函数——文件系统、外部进程、PTY、SSH client、
   端口转发器、运行时环境/时钟/ID 统一由 `TerminalServiceHost` 提供，Electron 组合根注入 Node 生产适配器（2026-09-02 T8）

三条均已完成；将来拆出去就是搬目录 + 加 `package.json`。

## 6. 待定

1. ~~WSL 路径预览采用 `wsl.exe` 转发，还是降级为不可预览~~ → 已按 `wsl.exe` 转发实现（批次 1），**待真机验证**
2. ~~L2 参数类型首版支持到哪几种~~ → 已实现文本 / 下拉 / 布尔勾选三种（布尔由 2026-09-02 T5 补齐）
3. ~~**预设命令的作用域**~~ → T9 已实现全局 localStorage + 当前会话 cwd 下
   `.nav-tools/terminal-presets.json` 项目级只读配置，UI 显式标注作用域
4. ~~**目录点击就地展开文件树**~~ → 2026-09-02 T1 已完成，见 `04-design.md` §11.3
