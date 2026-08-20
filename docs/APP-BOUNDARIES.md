# 应用与安全边界

Study Desk 使用同一仓库管理两个独立应用，但它们拥有不同的构建入口和运行权限。

```text
apps/
  desktop/        Electron、桌面页面、本地数据库、本机加密迁移和云服务代理
  service/        Vercel 首页、Supabase 管理操作、Paddle、会员与社区授权
packages/
  shared/         可公开的类型、商品目录和 Release 资产筛选规则
```

## 构建边界

- `npm run build:desktop` 只编译 `apps/desktop`，不会导入 `apps/service/server`。
- `npm run build:service` 只编译 `apps/service`，Vercel 仍只有 `app/api/[...path]` 一个动态函数。
- `npm run desktop:dist` 只将桌面 standalone 运行时、Electron 主进程和公开资源放入 `.exe/.dmg`。
- `npm run check:boundaries` 会阻止桌面代码引用服务端实现、Service Role、Paddle 密钥或会员入账 RPC。

桌面端允许通过 `packages/shared` 使用公开类型和展示数据，也允许通过 HTTPS 调用服务端。共享包不得包含数据库管理密钥、支付密钥、Webhook 验签逻辑或付费知识库明文。

## 密钥边界

只允许在 Vercel 环境变量中出现：

- `SUPABASE_SERVICE_ROLE_KEY`
- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`
- `CRON_SECRET`

桌面构建只接收公开的 `NEXT_PUBLIC_STUDY_DESK_SERVICE_URL` 和离线迁移必须使用的迁移密钥。迁移密钥能够阻止普通解包和篡改，但因为离线导入需要客户端解密，不能抵抗专业逆向。
