# DASHBOARD-AUTH-V2-END-TO-END — 验证记录

- 分支：`dashboard-only`
- 基准 HEAD：`a5bfb7c`（包含 AUTH-V2 代码提交 `dfe2793`）
- 唯一管理员邮箱：`zhihan.chunfeng@gmail.com`
- 验证方式：本地生产构建（`next build` + `next start`）+ 真实 Supabase Auth（anon + service-role 管理 API）

## 1. 账号状态

- Supabase Auth 用户已存在：uid `5683d29a-742e-4bf4-bcf1-d64b7bfdcbe7`，email confirmed=true
- 未创建新用户、未触碰其他用户
- `DASHBOARD_ALLOWED_EMAILS`（本地 `.env.local`）已包含该邮箱；服务端 `authorizeDashboardViewer` fail-closed 逻辑未改

## 2. 已自动验证（PASS）

| 项 | 结果 |
|---|---|
| 未登录访问 `/` | 直接渲染冻结登录页（单实例，无中间态） |
| 正确邮箱+密码 → signInWithPassword | → `/dashboard` |
| 刷新 `/dashboard` | session 保持（sb- auth cookie 存在） |
| 无 session → `/api/dashboard` | 401 |
| admin session → `/api/dashboard?range=7d` | 200，sourceMode=real |
| 非管理员（disposable 用户）→ `/dashboard` | 403「当前账号无权访问数据看板」；disposable 用户已删除 |
| 错误密码 | inline「邮箱或密码错误，请重新输入。」 |
| 忘记密码（空邮箱） | toast「请先输入邮箱」 |
| 忘记密码（有邮箱） | toast「如果该邮箱存在，我们已发送密码重置邮件」（真实邮件已发送至管理员邮箱；不暴露账号状态） |
| `/reset-password`（无 recovery session） | 「链接无效或已过期」+ 返回登录，不泄漏安全细节 |
| `/reset-password`（recovery session） | 设置新密码 → updateUser 成功 →「密码已更新，请重新登录」→ signOut → 自动返回 `/` |
| Supabase 密码校验边界 | 新密码与旧密码相同被拒绝（New password should be different）——属预期安全行为 |
| 新密码重新登录 | → `/dashboard`，刷新保持 |
| 路由隔离 | `/learn`、`/report`、`/api/report`、`/api/learn/submit`、`/api/speaking/session` 均 404 |
| TSC / Build | PASS / PASS |
| 泄漏检查 | recovery token / session / 临时密码临时文件均已删除；无 secret 入库 |

## 3. 需要人工完成的线上项（USER_REQUIRED）

### 3.1 Supabase Auth URL 配置（必须，已取得行为证据）

证据：生成 recovery 链接（redirectTo 指向生产 `https://ielts-practice-data.vercel.app/reset-password`）后，浏览器打开 verify URL 被重定向到
`https://ielts-practice-kohl.vercel.app/#access_token=...`（原产品域名），即 **Auth 项目 Site URL 仍指向原产品部署域名**，生产 Dashboard 域名未作为 recovery 落地目标。

用户操作（Supabase Dashboard → 对应项目 → Authentication → URL Configuration）：
1. **Site URL** 改为 `https://ielts-practice-data.vercel.app`
2. **Redirect URLs** 添加 `https://ielts-practice-data.vercel.app/reset-password`（如缺失）
3. 保存

修正后，邮件链接点击将落到 Dashboard 的 `/reset-password`（本分支已实现 recovery session 处理）。

### 3.2 Vercel 线上环境变量（确认）

- `DASHBOARD_ALLOWED_EMAILS=zhihan.chunfeng@gmail.com`
- `NEXT_PUBLIC_APP_URL=https://ielts-practice-data.vercel.app`

### 3.3 线上与邮件闭环（本机网络无法连接 Vercel 域名；Gmail 无法由代理代收）

1. 等 Vercel 部署 `dashboard-only` 完成
2. 打开 `https://ielts-practice-data.vercel.app/` → 登录页
3. 点「忘记密码？」→ 输入管理员邮箱 → 查收 Gmail 重置邮件
4. 点邮件链接（应落到 `.../reset-password`）→ 设置新密码 → 用新密码登录 → 刷新确认保持

## 4. 当前管理员密码状态

- 完整 E2E 验证后管理员密码为：`Lingxi-Dash-2026-v2!`（由 recovery session 设置）
- 建议用户登录后通过「忘记密码」流程改回个人密码

## 5. 边界确认

- 未做注册 / Google OAuth / Magic Link / 微信登录
- 未创建第二套 auth client（复用 `createSupabaseBrowserClient`）
- 未修改 Dashboard 指标 / API / Repository / UI；未修改 Supabase schema
- 未解除路由隔离；`main` / `repo/arch-consolidate` 未动
