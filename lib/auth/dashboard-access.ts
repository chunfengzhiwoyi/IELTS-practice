/**
 * P7.5A — Dashboard 内部授权（V1，最小）
 * requireUser() 只证明登录；跨用户聚合必须再做一次 server-side viewer 授权。
 * 配置：DASHBOARD_ALLOWED_EMAILS（逗号分隔）。未配置 = fail closed（403）。
 */
import { AppError } from "@/lib/observability/errors";
import { requireUser, type CurrentUser } from "./session";
import { isDemoAuthMode, DEMO_USER } from "@/lib/auth/demo-user";

export function authorizeDashboardViewer(user: CurrentUser): boolean {
  const raw = (process.env.DASHBOARD_ALLOWED_EMAILS ?? "").trim();
  if (!raw) {
    // 未配置 allowlist：demo 模式放行 demo 用户，其他一律拒绝（fail closed）。
    return isDemoAuthMode() && user.email === DEMO_USER.email;
  }
  const allow = new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  return allow.has(user.email.toLowerCase());
}

export async function requireDashboardAccess(traceId?: string): Promise<CurrentUser> {
  const user = await requireUser(traceId);
  if (!authorizeDashboardViewer(user)) {
    throw new AppError("FORBIDDEN", "无 Dashboard 查看权限", traceId);
  }
  return user;
}
