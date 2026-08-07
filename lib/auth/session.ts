/**
 * 会话辅助
 * ------------------------------------------------------------
 * 提供 getCurrentUser / requireUser 两个入口。
 * AUTH_MODE=demo 时注入固定 demo 用户，不走 Supabase Auth。
 * requireUser 在未登录时抛出 AppError("AUTH_REQUIRED")，由上层统一处理。
 */
import { isDemoAuthMode, DEMO_USER } from "@/lib/auth/demo-user";
import { AppError } from "@/lib/observability/errors";

export interface CurrentUser {
  id: string;
  email: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDemoAuthMode()) return DEMO_USER;

  try {
    const { createServerClient } = await import("@/lib/db/server");
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

export async function requireUser(traceId?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("AUTH_REQUIRED", "请先登录", traceId);
  }
  return user;
}
