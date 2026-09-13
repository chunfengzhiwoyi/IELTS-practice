/**
 * DASHBOARD-DEPLOY-FIX-01：dashboard-only 部署专用 auth guard。
 * 仅存在于 dashboard-only 分支。
 * 服务端鉴权（AUTH_MODE=supabase）：
 *  - 未登录（AUTH_REQUIRED）→ 明确登录提示（非无限 loading），提供 /login 入口
 *  - 已登录但不在 allowlist（FORBIDDEN）→ 显式无权限提示
 *  - 通过 → 渲染 Dashboard 客户端页面
 */
import { requireDashboardAccess } from "@/lib/auth/dashboard-access";
import { AppError } from "@/lib/observability/errors";

export default async function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireDashboardAccess();
  } catch (e) {
    if (e instanceof AppError && e.kind === "AUTH_REQUIRED") {
      return (
        <main className="lxdb-deny" role="alert">
          <div>
            <strong>请先登录查看数据看板</strong>
            <p>登录后即可查看产品数据看板。</p>
            <a href="/login?next=/dashboard">前往登录</a>
          </div>
        </main>
      );
    }
    if (e instanceof AppError && e.kind === "FORBIDDEN") {
      return (
        <main className="lxdb-deny" role="alert">
          <div>
            <strong>当前账号无权访问数据看板</strong>
            <p>
              请联系管理员将你的邮箱加入 DASHBOARD_ALLOWED_EMAILS 后重试。
            </p>
            <a href="/login">切换账号</a>
          </div>
        </main>
      );
    }
    throw e;
  }
  return <>{children}</>;
}
