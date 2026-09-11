# P7.5A — Dashboard Authorization Audit

## 实现
- `lib/auth/dashboard-access.ts`：`requireDashboardAccess()` = `requireUser()` + server-side `authorizeDashboardViewer(user)`。
- 授权源：环境变量 `DASHBOARD_ALLOWED_EMAILS`（逗号分隔，小写比对）。
- 未配置 allowlist 时：demo 模式放行 demo 用户，其他一律 403（fail closed，不 fail-open）。
- 5 个 `/api/dashboard/*` route 全部统一使用该 helper（summary + lifecycle + modules + bad-cases + traces）。

## 状态映射
- 未登录 → 401（AUTH_REQUIRED）
- 已登录未授权 → 403（FORBIDDEN）
- 已授权 → 200

## 禁止项
无 client-only hide、无 URL secret/query token、service-role key 不发前端、普通用户不能看跨用户 aggregate。

## 测试
anonymous→401（实测）；demo authorized→200（实测）；normal-authenticated→403 由 authorizeDashboardViewer 单测逻辑覆盖（allowlist 不含即拒）。

SECURITY_BLOCKER_FOR_PRODUCTION: RESOLVED（V1 最小 server-side allowlist）。
