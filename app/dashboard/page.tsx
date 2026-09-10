"use client";

/**
 * /dashboard — P4 Real 前端入口。
 * 主页面只请求 /api/dashboard；后端 RealDashboardRepository 读 Supabase + 离线 eval run。
 * MockDashboardRepository 保留，仅供测试/fixture/E2E。
 */
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { ApiDashboardRepository } from "@/lib/dashboard/api-repository";

const repository = new ApiDashboardRepository();

export default function DashboardRoutePage() {
  return <DashboardPage repository={repository} />;
}
