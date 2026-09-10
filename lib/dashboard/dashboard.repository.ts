/**
 * DashboardRepository — 唯一数据访问边界
 * 来源：Implementation Kit `05_data_contract/dashboard.repository.ts`。
 * React 组件只依赖本接口；P2 注入 MockDashboardRepository，P4 切 RealDashboardRepository。
 */
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

export interface DashboardRepository {
  getDashboard(range: DashboardRange): Promise<DashboardData>;
  getLifecycleDetail(stageId: LifecycleStageId, range: DashboardRange): Promise<LifecycleDetail>;
  getModuleDetail(moduleId: ModuleId, range: DashboardRange): Promise<ModuleDetail>;
  getBadCases(layer: FailureLayer, range: DashboardRange): Promise<BadCase[]>;
  getTrace(traceId: string): Promise<TraceDetail>;
}
