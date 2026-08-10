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

## WebDAV 自建云同步

桌面版可将完整训练数据同步到你自己的 WebDAV 服务器（例如 Nextcloud、NAS 或其他兼容服务）。同步使用版本化 JSON 快照；卡片内容冲突时会按更新时间合并，不需要 Study Desk 账号或第三方云服务。

### 配置步骤

1. 在 WebDAV 服务中创建专用目录或准备一个可写入的位置；建议为 Study Desk 单独创建应用密码，而不是填写主账号密码。
2. 打开 **设置 → 服务器云同步**，开启“启用 WebDAV 同步”。
3. 填写以下信息：

   - **WebDAV 地址**：WebDAV 根地址，不要包含 Study Desk 的同步目录。例如 Nextcloud 通常为 `https://cloud.example.com/remote.php/dav/files/你的用户名`。
   - **远端目录**：Study Desk 在该根地址下创建和管理快照的子目录，默认 `study-desk`。
   - **用户名与 WebDAV 密码**：密码会通过 Windows/macOS 的系统安全存储加密保存，不会显示、导出或同步到其他设备。
   - **同步方式**：默认“自动同步”会在应用启动时检查，并按设定间隔运行；“仅手动同步”只会在点击“立即同步”时运行。
   - **云端最大空间与满额策略**：空间不足时可自动删除最旧快照，或暂停同步等待处理。

4. 点击“保存同步器”，再点击“测试连接”。测试通过后点击“立即同步”，即可上传首份快照。
5. 在另一台设备安装 Study Desk 后，使用相同的 WebDAV 地址、目录和账号配置同步器，再点击“立即同步”拉取并合并数据。

### 服务器端准备

Study Desk 需要一个支持 HTTPS 与 Basic Auth（或等效 WebDAV 认证）的可写 WebDAV 目录。同步器会在该目录创建子目录、上传/下载 JSON 文件，并删除按空间策略淘汰的旧快照；因此账号至少需要 `GET`、`PUT`、`DELETE` 和 `MKCOL` 权限。

#### 推荐：一键 Docker 部署

这是最省事的自建方式。准备一台已安装 Docker 的 Linux 服务器，并先将一个域名（如 `sync.example.com`）的 A/AAAA 记录指向该服务器、开放 TCP `80` 和 `443`。然后在服务器执行：

```bash
curl -fsSL https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/scripts/setup-webdav.sh | sudo bash
```

脚本只会询问域名和远端目录，随后自动完成以下工作：创建随机同步密码、启动独立 WebDAV 容器、用 Caddy 自动申请 HTTPS 证书，并在终端输出可直接复制到 Study Desk 的地址、目录、用户名和密码。部署脚本可在本项目的 [`scripts/setup-webdav.sh`](scripts/setup-webdav.sh) 审阅。

如果服务器的终端不支持通过管道执行时交互输入，请改用下面两条命令：

```bash
curl -fsSLO https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/scripts/setup-webdav.sh
sudo bash setup-webdav.sh
```

> 如果服务器未安装 Docker，请先按 [Docker 官方安装文档](https://docs.docker.com/engine/install/) 安装 Docker Engine 和 Docker Compose 插件。首次申请证书时，请确认 DNS 已生效且 80/443 没有被其他服务占用。

#### 使用现有 Nextcloud

1. 在 Nextcloud 创建一个专用用户，或为现有用户创建“应用密码”。不要在客户端使用主账号密码。
2. 确保该用户可以写入 Files 中的目标位置，例如 `StudyDesk`。
3. 在 Study Desk 中填写：

   - **WebDAV 地址**：`https://cloud.example.com/remote.php/dav/files/用户名`
   - **远端目录**：`StudyDesk`（可省略；使用默认 `study-desk` 也可以）
   - **用户名**：Nextcloud 用户名
   - **WebDAV 密码**：刚创建的应用密码

4. 点击“测试连接”。首次同步会在该位置创建 `StudyDesk`（或你填写的目录）。

#### 方案二：自建 Nginx WebDAV

以下示例为 `sync.example.com` 提供独立的 `/studydesk/` 存储端点。服务器需要安装带 `ngx_http_dav_module` 的 Nginx，以及用于生成 Basic Auth 密码文件的 `htpasswd` 工具。

```nginx
server {
    listen 443 ssl http2;
    server_name sync.example.com;

    ssl_certificate     /etc/letsencrypt/live/sync.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sync.example.com/privkey.pem;

    location /studydesk/ {
        alias /srv/study-desk-webdav/;
        client_max_body_size 50m;

        auth_basic "Study Desk Sync";
        auth_basic_user_file /etc/nginx/study-desk.htpasswd;

        dav_methods PUT DELETE MKCOL COPY MOVE;
        create_full_put_path on;
        dav_access user:rw group:rw all:r;
    }
}
```

创建目录、限制权限并生成同步账号：

```bash
sudo install -d -o www-data -g www-data -m 0750 /srv/study-desk-webdav
sudo htpasswd -c /etc/nginx/study-desk.htpasswd study-desk
sudo nginx -t && sudo systemctl reload nginx
```

随后在 Study Desk 中填写：**WebDAV 地址** `https://sync.example.com/studydesk`、**远端目录** `data`、**用户名** `study-desk`，以及 `htpasswd` 设置的密码。首次同步会创建 `data` 子目录。

> 请只通过 HTTPS 暴露 WebDAV；不要将该位置开放给匿名访问，也不要把同步目录放在会被公开下载的网站根目录。若使用 Docker、NAS 或反向代理，请确保容器/服务进程拥有目标目录的读写与删除权限。

### 使用说明与排错

- **同一服务器上的独立云端**：使用同一个 WebDAV 地址、不同的“远端目录”即可隔离数据。例如个人数据使用 `study-desk`，另一位用户使用 `study-desk-alice`，测试数据使用 `study-desk-test`。这些目录的快照不会混合。
- **另一台设备接入同一云端**：在新设备的“服务器云同步”中填写与原设备完全相同的 WebDAV 地址、远端目录、用户名和密码，然后依次点击“保存同步器 → 测试连接 → 立即同步”。新设备会拉取云端数据；两端都有新数据时会自动合并。
- **账号隔离边界**：一键 Docker 部署默认只创建一个 WebDAV 账号。不同远端目录能隔离同步数据，但持有该账号的人理论上仍可访问其他目录；不同用户需要严格隐私隔离时，应为其配置独立 WebDAV 账号和目录权限。
- 同步器一次只支持一个 WebDAV 目标。两台设备必须填写同一个远端目录，才能共享数据。
- 自动同步遇到两端都有新数据时会先合并，再写入新的快照；网络、认证或空间错误不会覆盖本机数据，错误会显示在设置页。
- 云端目录包含 `manifest.json` 与多个快照文件，请不要在同步进行时手动编辑或删除它们；如需停止使用，先关闭同步器再处理目录。
- 导出的备份不包含 WebDAV 地址、同步状态、账号、密码、API Key 或本地模型配置。恢复“替换备份”也会保留当前设备的同步器配置。
- 若连接失败，请确认地址是 WebDAV API 地址而非服务网页地址、账号对该目录有创建/读取/删除权限，并优先使用服务提供的应用密码。

## MCP（供 Agent 使用）

开发环境可通过以下命令启动本地 MCP Server：

```bash
npm run mcp:dev
```

它通过 stdio 提供卡片查询、草稿创建与发布、复习评估和提交、模拟面试等工具。使用任意 MCP Host 时，将命令配置为 `npm run mcp:dev`，工作目录设为本项目根目录。

写入学习状态的操作要求 Agent 带上用户确认；`submit_review` 和面试作答还要求唯一的 `idempotencyKey`，避免重试重复推进排程。详细设计见 [MCP-DESIGN.md](docs/MCP-DESIGN.md)，供接入 Agent 的操作手册见 [AGENT-MCP.md](docs/AGENT-MCP.md)。
