/**
 * Report 模块公开 API
 */
import "server-only";

export type {
  ReportPeriod,
  MemorySummary,
  ReviewStats,
  SpeakingObservation,
  RecommendedTask,
  ProgressReport,
} from "@/lib/report/types";

export { aggregateReportData } from "@/lib/report/aggregator";
export { generateRecommendations } from "@/lib/report/recommendations";
