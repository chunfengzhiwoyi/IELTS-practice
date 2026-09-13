/**
 * DASHBOARD-LOGIN-V10：/login 使用与根路径相同的后台登录视觉。
 * 仅保留邮箱 + 密码登录（复用现有 Supabase 客户端），不恢复消费级旧登录页。
 */
import DashboardLoginRoute from "@/components/dashboard/dashboard-login-route";

export default function LoginPage() {
  return <DashboardLoginRoute />;
}
