/**
 * ApiDashboardRepository（P4.6）
 * ------------------------------------------------------------
 * 浏览器端实现：主页面只请求 /api/dashboard；Drawer/Trace 按需请求详情。
 * 生产不回退 Mock；MockDashboardRepository 仅供测试/fixture/E2E。
 */
import type { DashboardRepository } from "./dashboard.repository";
import type {
  BadCase,
  DashboardData,
  DashboardRange,
  FailureLayer,
  LifecycleDetail,
  LifecycleStageId,
  ModuleDetail,
  ModuleId,
  TraceDetail,
} from "./types";

export class ApiDashboardRepository implements DashboardRepository {
  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return (await res.json()) as T;
  }
  getDashboard(range: DashboardRange): Promise<DashboardData> {
    return this.get<DashboardData>(`/api/dashboard?range=${range}`);
  }
  getLifecycleDetail(stageId: LifecycleStageId, range: DashboardRange): Promise<LifecycleDetail> {
    return this.get<LifecycleDetail>(`/api/dashboard/lifecycle/${stageId}?range=${range}`);
  }
  getModuleDetail(moduleId: ModuleId, range: DashboardRange): Promise<ModuleDetail> {
    return this.get<ModuleDetail>(`/api/dashboard/modules/${moduleId}?range=${range}`);
  }
  getBadCases(layer: FailureLayer, range: DashboardRange): Promise<BadCase[]> {
    return this.get<BadCase[]>(`/api/dashboard/bad-cases?layer=${encodeURIComponent(layer)}&range=${range}`);
  }
  getTrace(traceId: string): Promise<TraceDetail> {
    return this.get<TraceDetail>(`/api/dashboard/traces/${encodeURIComponent(traceId)}`);
  }
}
