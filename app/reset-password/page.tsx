/**
 * DASHBOARD-AUTH-V2：/reset-password 页面。
 * 仅存在于 dashboard-only 分支，middleware 白名单已放行。
 */
import DashboardResetPasswordRoute from "@/components/dashboard/dashboard-reset-password-route";

export default function ResetPasswordPage() {
  return <DashboardResetPasswordRoute />;
}
