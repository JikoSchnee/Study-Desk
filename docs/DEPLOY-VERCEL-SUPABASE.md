# Vercel + Supabase 服务端部署

桌面端只连接 Study Desk 的 Vercel 域名。Supabase 地址和密钥由服务端持有，用户设置页不提供自定义云服务入口。

## 1. 初始化 Supabase

在 Supabase SQL Editor 依次执行：

1. `supabase/migrations/20260811_study_desk_sync.sql`
2. `supabase/migrations/20260820_community_marketplace.sql`
3. `supabase/migrations/20260820_service_gateway.sql`
4. `supabase/migrations/20260821_membership_cloud_sync.sql`
5. `supabase/migrations/20260822_google_oauth_handoff.sql`
6. `supabase/migrations/20260823_web_client.sql`

在 Authentication 的 URL Configuration 中加入桌面回调：

```text
study-desk://auth/callback
https://study-desk.jiko-official.top/api/service/auth/oauth/callback/**
https://study-desk.jiko-official.top/api/service/auth/email/callback/**
```

Magic Link 邮件模板必须保留 `{{ .ConfirmationURL }}`。

## 2. 创建 Vercel 项目

将此仓库导入 Vercel，Framework Preset 选择 Next.js，Root Directory 保持仓库根目录。仓库中的 `vercel.json` 会执行 `npm run build:vercel`，只构建 `apps/service` 的首页和单个 catch-all 云函数；不要把 Build Command 手动覆盖回 `npm run build`，后者是桌面端构建入口。

为 Production、Preview、Development 配置：

```text
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_ANON_KEY=公开的 publishable/anon key
SUPABASE_SERVICE_ROLE_KEY=服务端 service_role/secret key
STUDY_DESK_PUBLIC_URL=https://study-desk.jiko-official.top
STUDY_DESK_AUTH_HANDOFF_KEY=另一个独立生成的32字节Base64随机值
STUDY_DESK_WEB_SESSION_KEY=第三个独立生成的32字节Base64随机值
PADDLE_ENV=sandbox
PADDLE_API_KEY=pdl_sdbx_apikey_...
PADDLE_CLIENT_TOKEN=test_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
PADDLE_MONTHLY_PRICE_ID=pri_...
PADDLE_YEARLY_PRICE_ID=pri_...
CRON_SECRET=使用密码生成器创建的随机值
```

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Vercel 服务端环境变量中，绝不能添加 `NEXT_PUBLIC_` 前缀，也不能写入桌面安装包。

在 Vercel 项目 Domains 中添加 `study-desk.jiko-official.top`。DNS 服务商添加主机记录 `study-desk` 的 CNAME，目标优先使用 Vercel 页面显示的项目专用值；若没有专用值，再使用 `cname.vercel-dns-0.com`。删除同名 A、AAAA 或旧 CNAME；Cloudflare 验证期间使用“仅 DNS”。Vercel 若要求所有权验证，再按页面添加 `_vercel` TXT。验证并签发 HTTPS 后将其设为 Production 主域名。旧 `vercel.app` 域名暂时保留，兼容旧客户端。

`STUDY_DESK_AUTH_HANDOFF_KEY` 可用 `openssl rand -base64 32` 生成，必须与迁移主密钥不同。它只保存在 Vercel，用于加密最长 10 分钟的 PKCE verifier 和最长 5 分钟的一次性会话交接数据。

`STUDY_DESK_WEB_SESSION_KEY` 也用 `openssl rand -base64 32` 单独生成，不能与任何迁移或认证密钥复用。它只保存在 Vercel，用来加密浏览器 HttpOnly 会话及最长 15 分钟的评分确认记录。

浏览器评分至少配置一家 OpenAI-compatible 服务。通过 `STUDY_DESK_AI_PROVIDER_ORDER` 设置回退顺序，并为对应供应商填写 `STUDY_DESK_AI_<供应商>_API_KEY` 与 `STUDY_DESK_AI_<供应商>_MODEL`；自定义供应商还必须填写 `STUDY_DESK_AI_CUSTOM_BASE_URL`。未配置或全部调用失败时，网页会自动显示参考答案并转为自评。

### Google 登录

1. 先确认官网 `/privacy` 和 `/terms` 均可通过 HTTPS 访问。
2. 在 Google Search Console 使用 DNS TXT 验证根域名 `jiko-official.top`。
3. 在 Google Auth Platform 创建 External 应用并发布到 Production。首页填 `https://study-desk.jiko-official.top`，隐私政策填 `/privacy`，服务条款填 `/terms`，授权域名填 `jiko-official.top`。
4. 创建 Web application OAuth 客户端，Authorized redirect URI 只填 Supabase 回调 `https://foimoeozpdtjvevjmxuj.supabase.co/auth/v1/callback`。只使用 `openid email profile` 基础权限。
5. 在 Supabase Authentication → Providers → Google 填入 Client ID 和 Client Secret 并启用；在 Auth General Configuration 启用 Allow manual linking。
6. 在 URL Configuration 将 Site URL 改为 `https://study-desk.jiko-official.top`，并保留桌面深链、同域 OAuth 回调和邮箱回调通配地址。

Google Client Secret 只进入 Supabase Provider，不进入 Vercel、GitHub Actions、桌面安装包或 Git。两个已经存在的不同 Supabase 用户不会合并；不同邮箱必须先登录原账号，再从桌面端或 `/app/settings` 主动绑定。

## 3. 配置 Paddle Sandbox

1. 在 Paddle Sandbox 创建两个 CNY 一次性商品：月卡 30 天，含税展示价 ¥15；年卡 365 天，含税展示价 ¥128。把两个 Price ID 写入 Vercel 环境变量。
2. 创建服务端 API Key 和客户端 Token。客户端 Token 可以返回给 Paddle.js；API Key 和 Webhook Secret 只能保存在 Vercel。
3. 新建 Webhook destination：

```text
https://study-desk.jiko-official.top/api/webhooks/paddle
```

至少订阅 `transaction.completed`、`transaction.canceled` 和 `adjustment.updated`。把 destination secret 写入 `PADDLE_WEBHOOK_SECRET`。
4. 用 Sandbox 分别验证支付完成、取消、延迟完成、退款、争议和同一事件重放。权益只以签名有效的 Webhook 为准，Checkout 前端完成提示不会直接开通会员。
5. Paddle 生产账户和 KYC 审核通过后，创建正式环境对应商品与密钥，再将 `PADDLE_ENV` 改为 `production`。不要把 Sandbox 商品 ID 与生产 API Key 混用。

Vercel 会按 `vercel.json` 每日请求清理接口。Vercel Cron 自动使用 `CRON_SECRET` 作为 Bearer Token；手工调用也必须携带相同 Token。

## 4. 构建桌面客户端

在构建安装包的环境中设置：

```text
NEXT_PUBLIC_STUDY_DESK_SERVICE_URL=https://study-desk.jiko-official.top
STUDY_DESK_TRANSFER_KEY_VERSION=1
STUDY_DESK_TRANSFER_KEY_CURRENT=32字节随机值的Base64
STUDY_DESK_TRANSFER_KEY_PREVIOUS={}
```

迁移主密钥可用 `openssl rand -base64 32` 生成。`npm run desktop:dist` 会拒绝缺少或长度不正确的密钥。轮换时提高版本号，把旧版本及其 Base64 密钥加入 `STUDY_DESK_TRANSFER_KEY_PREVIOUS`，例如 `{"1":"旧密钥"}`；确认所有仍需导入的旧文件超过支持期后，才可从旧密钥环移除。

然后按现有发布流程构建。服务 URL 只是公开 API 域名，不包含任何 Supabase 密钥。生产构建缺少它时，账号登录和云同步会明确报错。迁移密钥只编译进 Electron 主进程包，不进入 Next.js 浏览器代码；由于离线导入必须具备解密能力，它能阻止普通解包和篡改，不能承诺抵抗专业逆向。

仓库的 `desktop-release.yml` 已固定生产服务 URL，并从 GitHub Actions Secrets 读取三个迁移密钥变量。发布新版本前必须在仓库 Secrets 中配置它们；OAuth handoff 密钥不需要也不允许放入桌面发布工作流。

## 5. 发布前检查

- 先在测试 Supabase 项目执行全部 migration，再部署 Vercel Preview 和 Paddle Sandbox。
- 确认 `GET /api/service/membership` 对无效 JWT 返回 401，有效账号返回配额和权益状态。
- 确认试用只能领取一次；有效期内充值从当前到期时间累加；过期充值从支付完成时间计算。
- 确认到期账号 30 天内只读，30 天后 Cron 删除文档和历史；重新试用或充值会恢复写入。
- 确认单快照超过 4 MB、总用量超过 500 MB、版本号冲突均被服务端拒绝。
- 运行 `npm run check:boundaries`、`npm test`、`npm run lint`、`npm run build:service` 和 `npm run desktop:build`。

## 6. 安全边界

- 客户端可用邮箱 Magic Link 或 Google 登录获得用户 JWT，并将会话保存在系统安全存储中。Google 授权在系统浏览器完成，自定义协议只携带一次性交接码，不携带长期令牌。
- Vercel 每次请求都调用 Supabase Auth 验证 JWT；验证后才使用 service-role 客户端读写该用户的数据。
- 同步查询始终显式添加 `user_id = 已验证账号`，写入通过只授予 `service_role` 的 RPC 完成。
- 同步采用乐观版本号，两个设备同时写入时返回冲突并重新合并，避免静默覆盖。
- 单次同步文档限制为 4 MB，每账号总配额 500 MB，默认保留 5 份历史版本。
- 社区付费知识库及授权记录不属于本机备份表，也不进入账号同步文档；练习时继续由在线授权接口逐题返回。

这能阻止用户获取数据库密钥或选择自己的云端，但无法做到客户端数据“绝对不可复制”：只要内容在用户设备上可阅读，就存在截屏、录屏或二次录入的可能。付费知识库仍应结合账号授权、短期下载票据、设备绑定、水印、撤销和审计来降低传播风险。
