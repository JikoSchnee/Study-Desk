# Study Desk

像背单词一样整理自己的知识藏品。

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
