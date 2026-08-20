# Study Desk

像背单词一样整理自己的知识藏品。

> 本文中的云同步教程会直接显示在应用“设置 → 备份与云同步”的问号帮助窗口中。

## 下载

请只从 [GitHub Releases](https://github.com/JikoSchnee/Study-Desk/releases) 下载正式安装包。当前桌面版**未进行代码签名**，macOS 版本也**未经过 Apple 公证**；首次运行时出现系统安全提示属于预期行为。

- Windows：下载 `Study-Desk-Setup-*.exe`。
- macOS：下载 `.dmg` 文件。

## Windows 安装与启动

1. 双击下载的 `Study-Desk-Setup-*.exe`。
2. 如果看到“Windows 已保护你的电脑”或 Microsoft Defender SmartScreen 提示，这是因为安装包未签名。点击“更多信息”，再点击“仍要运行”。
3. 按安装向导完成安装。安装后可从开始菜单或桌面快捷方式启动 **Study Desk**。

## macOS 安装与启动

1. 打开下载的 DMG 文件，并将 **Study Desk** 拖到“应用程序”文件夹。
2. 首次打开若被 macOS 阻止，请打开“终端”，执行：

   ```bash
   xattr -cr "/Applications/Study Desk.app"
   open "/Applications/Study Desk.app"
   ```

   第一条命令会移除下载文件附带的隔离属性；第二条命令会启动应用。
3. 也可以在 Finder 的“应用程序”中按住 Control 点击 **Study Desk**，选择“打开”，再在确认对话框中选择“打开”。

仅在确认安装包来自本项目 GitHub Release 时，才按照以上步骤绕过系统安全提示。

## 更新方式

桌面版不会自动检查、下载或安装更新。需要更新时，请手动前往 [GitHub Releases](https://github.com/JikoSchnee/Study-Desk/releases) 下载新版本。

- Windows：运行新版 `Study-Desk-Setup-*.exe`，按安装向导覆盖安装即可；原有训练数据会保留在本机数据目录中。
- macOS：打开新版 DMG，将 **Study Desk** 拖到“应用程序”并选择替换；若系统再次阻止启动，请重新执行 `xattr -cr "/Applications/Study Desk.app"`。

## 云同步

> 当前生产方案为 **Study Desk 账号云同步**：桌面端只连接部署在 Vercel 的 Study Desk API，Supabase 项目与密钥由服务端统一管理。部署步骤见 [`docs/DEPLOY-VERCEL-SUPABASE.md`](docs/DEPLOY-VERCEL-SUPABASE.md)。

### 账号云同步与加密迁移

数据转移只有两种方式：免费用户可在桌面端导出和导入 `.studydesk` 认证加密文件；开始 7 天试用或持有有效月卡/年卡的账号可使用云同步。会员到期后保留 30 天只读下载期，随后由每日清理任务删除云端同步文档和历史版本。

云同步只包含用户自建知识库、学习进度、日志、计划和可同步设置。社区付费知识库、授权记录、账号令牌、迁移密钥和本机配置不会进入迁移文件、本机恢复点或云端同步快照。

服务端采用 Vercel + Supabase，支付采用 Paddle 托管 Checkout。客户端不能提交价格或自行开通权益；只有签名验证通过的 `transaction.completed` Webhook 会增加 30 天或 365 天会员时长。完整部署步骤和环境变量见 [部署说明](docs/DEPLOY-VERCEL-SUPABASE.md)。

## MCP（供 Agent 使用）

开发环境可通过以下命令启动本地 MCP Server：

```bash
npm run mcp:dev
```

它通过 stdio 提供卡片查询、草稿创建与发布、复习评估和提交、模拟面试等工具。使用任意 MCP Host 时，将命令配置为 `npm run mcp:dev`，工作目录设为本项目根目录。

写入学习状态的操作要求 Agent 带上用户确认；`submit_review` 和面试作答还要求唯一的 `idempotencyKey`，避免重试重复推进排程。详细设计见 [MCP-DESIGN.md](docs/MCP-DESIGN.md)，供接入 Agent 的操作手册见 [AGENT-MCP.md](docs/AGENT-MCP.md)。
