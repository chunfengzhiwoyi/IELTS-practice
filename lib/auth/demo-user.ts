/**
 * Demo 身份注入
 * ------------------------------------------------------------
 * AUTH_MODE=demo 时，所有服务端请求使用此固定用户，无需登录。
 * 保留现有 Supabase Auth 代码不删除，仅在入口层根据 AUTH_MODE 选择。
 */
import type { CurrentUser } from "@/lib/auth/session";

const DEMO_USER_ID = process.env.DEMO_USER_ID ?? "demo-user-001";

export const DEMO_USER: CurrentUser = {
  id: DEMO_USER_ID,
  email: "demo@english-learning.local",
};

export function isDemoAuthMode(): boolean {
  return (process.env.AUTH_MODE ?? "demo") === "demo";
}
