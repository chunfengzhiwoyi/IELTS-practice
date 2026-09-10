/**
 * MockDashboardRepository（P2）。来源：Implementation Kit Mock。
 * P4 将由 RealDashboardRepository 替换，组件只依赖 DashboardRepository 接口。
 */
import type { DashboardRepository } from "../dashboard.repository";
import type { DashboardData, DashboardRange, FailureLayer, LifecycleStageId, ModuleId } from "../types";
import { makeReadyDataset, lifecycleDetails, moduleDetails, badCases, traces } from "./factory";

export class MockDashboardRepository implements DashboardRepository {
  async getDashboard(range: DashboardRange): Promise<DashboardData> {
    await new Promise((r) => setTimeout(r, 120));
    return makeReadyDataset(range);
  }
  async getLifecycleDetail(stageId: LifecycleStageId) {
    return lifecycleDetails[stageId];
  }
  async getModuleDetail(moduleId: ModuleId) {
    return moduleDetails[moduleId];
  }
  async getBadCases(layer: FailureLayer) {
    return badCases.filter((c) => c.layer === layer);
  }
  async getTrace(traceId: string) {
    const t = traces[traceId];
    if (!t) throw new Error(`Trace not found: ${traceId}`);
    return t;
  }
}
