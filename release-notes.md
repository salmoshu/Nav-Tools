# Nav-Tools 更新日志

## v1.4.0

- Raw Messages 移除通用文件发送，新增复用当前串口的 IAP 固件升级；内置 IGK IAP 模板，并支持高级协议配置、命名模板、JSON 导入导出、多种校验算法、三次重试、真实 ACK 进度及串口连接恢复
- 新增 Terminal 通用组件，支持 Windows 本地 PowerShell、CMD、Git Bash、WSL，以及 Linux/macOS 系统 Shell
- Terminal 支持 SSH 密码、私钥和 Agent 认证，读取常用 `~/.ssh/config` 配置，并提供主机指纹首次确认与变更拦截
- Terminal 支持标签页、向右/向下递归分屏、空终端或继承会话、布局恢复，以及组件分离/还原时保持活动会话
- 新增远程 SFTP 文件面板，支持上传、下载、新建目录、重命名、删除和拖拽上传
- 新增 SSH Local、Remote 和 SOCKS 动态端口转发，多规则可独立启停，单条规则失败不影响 SSH 主会话

## v1.3.1

- 设置页面改为整页设置
- 新增版本更新功能：自动检查更新、弹框提醒、自动下载
- Camera Video 组件新增循环重连开关
