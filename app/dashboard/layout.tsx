/**
 * DASHBOARD-LOGIN-V10：dashboard-only 分支专用 dashboard 路由布局。
 * 服务端鉴权（AUTH_MODE=supabase）：
 *  - 未登录（AUTH_REQUIRED）→ 直接渲染冻结后台登录页（DashboardLoginRoute），无中间态
 *  - 已登录但不在 allowlist（FORBIDDEN）→ 显式无权限提示（服务端访问边界保留）
 *  - 通过 → 渲染 Dashboard 客户端页面
 */
import { requireDashboardAccess } from "@/lib/auth/dashboard-access";
import { AppError } from "@/lib/observability/errors";
import DashboardLoginRoute from "@/components/dashboard/dashboard-login-route";

export default async function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireDashboardAccess();
  } catch (e) {
    if (e instanceof AppError && e.kind === "AUTH_REQUIRED") {
      return <DashboardLoginRoute />;
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
