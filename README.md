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

### WebDAV 同步

桌面版可将完整训练数据同步到你自己的 WebDAV 服务器（例如 Nextcloud、NAS 或其他兼容服务）。同步使用版本化 JSON 快照；卡片内容冲突时会按更新时间合并，不需要 Study Desk 账号或第三方云服务。

#### 配置步骤

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

脚本会询问域名、首个用户名和密码（可自动生成，也可手动设置），随后启动独立 WebDAV 容器、用 Caddy 自动申请 HTTPS 证书，并输出可直接复制到 Study Desk 的连接信息。部署脚本可在本项目的 [`scripts/setup-webdav.sh`](scripts/setup-webdav.sh) 审阅。

如果服务器的终端不支持通过管道执行时交互输入，请改用下面两条命令：

```bash
curl -fsSLO https://raw.githubusercontent.com/JikoSchnee/Study-Desk/main/scripts/setup-webdav.sh
sudo bash setup-webdav.sh
```

> 如果服务器未安装 Docker，请先按 [Docker 官方安装文档](https://docs.docker.com/engine/install/) 安装 Docker Engine 和 Docker Compose 插件。首次申请证书时，请确认 DNS 已生效且 80/443 没有被其他服务占用。

#### 管理多个同步账号

部署完成后，在服务器执行下面这一条命令即可进入交互式管理菜单：

```bash
sudo study-desk-webdav
```

菜单可创建账号、查看账号与空间占用、重置密码、禁用/重新启用账号，并在二次确认后永久删除某个已禁用账号的数据。创建账号时可选择自动生成随机密码或自己输入密码；密码只在创建或重置时显示一次。

每个账号都有独立且不可互相访问的 WebDAV 根目录。创建完成后，将终端显示的 **WebDAV 地址**、默认远端目录 `study-desk`、用户名和密码填入 Study Desk 即可。若某人要在另一台设备接入自己的云端，两台设备填写同一组四项信息即可；不同用户则应创建不同账号。

旧版单账号 Docker 部署首次运行新版管理命令时，会自动将原有同步数据迁入该账号的独立空间，不需要修改客户端里的用户名、密码或远端目录。

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

- **同一服务器上的独立云端**：使用 `sudo study-desk-webdav` 为不同用户创建不同账号。账号根目录由服务器隔离，用户无法访问其他账号的数据；各自仍可在客户端保留默认远端目录 `study-desk`。
- **另一台设备接入同一云端**：在新设备的“服务器云同步”中填写与原设备完全相同的 WebDAV 地址、远端目录、用户名和密码，然后依次点击“保存同步器 → 测试连接 → 立即同步”。新设备会拉取云端数据；两端都有新数据时会自动合并。
- **禁用与清理**：菜单中的“禁用账号”只撤销登录权限，会保留云端快照。永久删除数据只能针对已禁用账号，并要求再次输入用户名确认。
- 同步器一次只支持一个 WebDAV 目标。两台设备必须填写同一个远端目录，才能共享数据。
- 自动同步遇到两端都有新数据时会先合并，再写入新的快照；网络、认证或空间错误不会覆盖本机数据，错误会显示在设置页。
- 云端目录包含 `manifest.json` 与多个快照文件，请不要在同步进行时手动编辑或删除它们；如需停止使用，先关闭同步器再处理目录。
- 导出的备份不包含 WebDAV 地址、同步状态、账号、密码、API Key 或本地模型配置。恢复“替换备份”也会保留当前设备的同步器配置。
- 若连接失败，请确认地址是 WebDAV API 地址而非服务网页地址、账号对该目录有创建/读取/删除权限，并优先使用服务提供的应用密码。

### Supabase 同步

Supabase 适合没有已备案服务器、又希望在多台电脑用同一个邮箱同步完整学习数据的用户。它同步卡片、标签、复习状态、日志、计划和可同步设置；本机自动备份仍会独立保留。

#### 从零配置

1. 在 [Supabase](https://supabase.com/) 创建项目，打开 **SQL Editor**。执行仓库中的唯一初始化脚本 [`supabase/migrations/20260811_study_desk_sync.sql`](supabase/migrations/20260811_study_desk_sync.sql)，或者直接复制并执行下方完整 SQL。它会创建最新同步文档、账号私有历史版本、RLS 策略和条件写入 RPC；只需执行这一次。

   ```sql
   -- 可重复执行：新项目初始化或已有项目升级都执行这一份。
   create table if not exists public.study_desk_sync_documents (
     user_id uuid primary key references auth.users(id) on delete cascade,
     version bigint not null default 1,
     backup jsonb not null,
     updated_at timestamptz not null default now()
   );

   create table if not exists public.study_desk_sync_history (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id) on delete cascade,
     version bigint not null,
     backup jsonb not null,
     created_at timestamptz not null default now()
   );
   create index if not exists study_desk_sync_history_owner_created
     on public.study_desk_sync_history (user_id, created_at desc);

   alter table public.study_desk_sync_documents enable row level security;
   alter table public.study_desk_sync_history enable row level security;

   drop policy if exists "Users manage their own Study Desk document"
     on public.study_desk_sync_documents;
   create policy "Users manage their own Study Desk document" on public.study_desk_sync_documents
     for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

   drop policy if exists "Users manage their own Study Desk history"
     on public.study_desk_sync_history;
   create policy "Users manage their own Study Desk history" on public.study_desk_sync_history
     for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

   create or replace function public.replace_study_desk_sync_document(expected_version bigint, next_backup jsonb)
   returns bigint language plpgsql security invoker as $$
   declare
     next_version bigint;
     written_rows integer;
   begin
     insert into public.study_desk_sync_documents (user_id, version, backup)
     values (auth.uid(), 1, next_backup)
     on conflict (user_id) do update set version = study_desk_sync_documents.version + 1, backup = excluded.backup, updated_at = now()
     where study_desk_sync_documents.version = expected_version;
     get diagnostics written_rows = row_count;
     if written_rows <> 1 then
       raise exception 'SYNC_VERSION_CONFLICT';
     end if;
     select version into next_version from public.study_desk_sync_documents where user_id = auth.uid();
     if next_version is null or next_version <> expected_version + 1 then
       raise exception 'SYNC_VERSION_CONFLICT';
     end if;
     insert into public.study_desk_sync_history (user_id, version, backup)
     values (auth.uid(), next_version, next_backup);
     return next_version;
   end $$;
   grant execute on function public.replace_study_desk_sync_document(bigint, jsonb) to authenticated;
   ```

2. 在 **Authentication → SMTP Settings** 配置自定义 SMTP（例如 Resend、Brevo、Postmark 或 SES）。内置 SMTP 仅适合组织成员测试，发送范围和频率受限。
3. 在 **Authentication → Providers → Email** 启用 Email 登录，并确认允许用户注册。在 **Authentication → URL Configuration** 中，将 **Site URL** 和 **Redirect URLs** 都添加为 `study-desk://auth/callback`。
4. 打开 [Supabase Email Templates](https://supabase.com/dashboard/project/_/auth/templates)（登录后会进入当前项目）。在 **Confirm signup** 与 **Magic Link** 模板中保留 `{{ .ConfirmationURL }}`，不要改为 `{{ .Token }}`。
5. 发布前用两个测试邮箱验证 RLS：任一账号只能看到自己的 `study_desk_sync_documents` 和 `study_desk_sync_history` 行。

已执行过旧版主表 SQL 的项目不需要再找第二份 migration：直接重新执行上面的同一份脚本，即可补齐历史表、索引、策略和新版函数。

#### 应用内连接与同步

1. 打开 **设置 → 备份与云同步 → 服务器云同步**。在共享偏好中选择同步方式、检查间隔、云端最大空间、空间满额时的策略，以及 **保留历史版本**（1–10 份，默认 5 份）。
2. 打开 Supabase 开关，填写项目 **Connect** 页面提供的 URL 与公开 anon key。也可为开发/部署环境配置 `SUPABASE_URL` 与 `SUPABASE_ANON_KEY`；绝不要填入 `service_role` key。
3. 输入邮箱后点击“发送 Magic Link”，并在同一台装有 Study Desk 的电脑上打开邮件链接完成登录。会话只加密保存在当前设备的系统安全存储中；应用会在 access token 临近到期时，使用同一安全存储中的 refresh token 自动续期。若 refresh token 已被撤销或过期，应用会清除本机登录态并提示重新登录。
4. 点击“立即同步”上传首份完整学习数据。两台设备都有数据时，先下载本地备份，再按提示选择合并、采用云端或上传本机。
5. 两台设备离线修改后，先执行一次合并同步。若云端版本已在同步期间变化，应用会要求重新预览并确认数据方向，不会静默覆盖本机数据。

“保留历史版本”同时作用于两种同步器：WebDAV 会清理最旧快照，Supabase 会清理当前账号最旧的历史版本；它不会删除本机自动备份。

自动同步的下次检查时间仅保存在当前设备。关闭应用期间不会在后台同步；重新打开后，若已超过原定时间，应用会立即补做一次同步，否则会等待到原定时间。每次同步完成（包括失败）都会按当前检查间隔安排下一次，避免网络异常时连续重试。

#### 同步记录与恢复历史版本

登录 Supabase 后，点击账号区“退出登录”左侧的“同步记录”，即可查看当前账号保留的 1–10 份历史版本。每条记录可展开 **查看 diff**，对比该快照和当前本机的逐类数据数量。

点击“恢复此版本”后需要再次确认。应用会先将当前本机完整数据写入一个新的云端历史版本，再把所选版本恢复到本机并同步为最新云端状态；这意味着恢复操作通常会占用两个历史版本位置，并按当前保留数量清理最旧记录。版本正在被另一台设备更新时，恢复会停止并提示你刷新记录后重试，不会静默覆盖数据。

#### Magic Link 快捷登录（无需域名）

1. 在 **Authentication → URL Configuration** 中将 **Site URL** 与 **Redirect URLs** 都添加为 `study-desk://auth/callback`。
2. 在 **Authentication → Email Templates** 的 **Confirm signup** 与 **Magic Link** 模板中保留 `{{ .ConfirmationURL }}`，不要改为 `{{ .Token }}`。
3. 回到应用输入邮箱，点击“发送 Magic Link”，然后在**同一台装有 Study Desk 的电脑**上打开邮件链接。Supabase 验证后会通过 `study-desk://auth/callback` 拉起应用，应用将会话加密存入系统安全存储并显示登录成功。

这个桌面深链不需要自有网页域名。若浏览器提示选择应用，请选择 Study Desk；开发模式下请先重新启动一次 `npm run desktop:dev`，让 Electron 注册该协议。

未配置自定义 SMTP 时，Supabase 内置邮件服务仅适合测试：通常只允许项目团队成员邮箱，且发送频率很低。个人跨设备同步可先用团队邮箱测试；需要其他用户登录时应配置自定义 SMTP。

## MCP（供 Agent 使用）

开发环境可通过以下命令启动本地 MCP Server：

```bash
npm run mcp:dev
```

它通过 stdio 提供卡片查询、草稿创建与发布、复习评估和提交、模拟面试等工具。使用任意 MCP Host 时，将命令配置为 `npm run mcp:dev`，工作目录设为本项目根目录。

写入学习状态的操作要求 Agent 带上用户确认；`submit_review` 和面试作答还要求唯一的 `idempotencyKey`，避免重试重复推进排程。详细设计见 [MCP-DESIGN.md](docs/MCP-DESIGN.md)，供接入 Agent 的操作手册见 [AGENT-MCP.md](docs/AGENT-MCP.md)。
