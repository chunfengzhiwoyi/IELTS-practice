import type { DashboardData } from "../types";
import { makeReadyDataset } from "./factory";

export const empty: DashboardData = {
  ...makeReadyDataset("7d"),
  meta: { ...makeReadyDataset("7d").meta, dataStatus: "empty" },
  health: { metrics: makeReadyDataset("7d").health.metrics.map((m) => ({ ...m, value: { status: "zero", value: 0 }, trend: null })) },
  lifecycle: {
    ...makeReadyDataset("7d").lifecycle,
    stages: makeReadyDataset("7d").lifecycle.stages.map((s) => ({
      ...s,
      count: { status: "zero", value: 0 },
      rate: s.rate ? { status: "insufficient", sampleSize: 0, minimumSample: 20 } : null,
    })),
    cohorts: [],
  },
};

export const sparse: DashboardData = {
  ...makeReadyDataset("7d"),
  health: {
    metrics: makeReadyDataset("7d").health.metrics.map((m, i) =>
      i < 2 ? m : { ...m, value: { status: "insufficient" as const, sampleSize: 12, minimumSample: 20, reason: "成熟用户组样本不足" }, trend: null },
    ),
  },
};

export const partialError: DashboardData = {
  ...makeReadyDataset("7d"),
  meta: { ...makeReadyDataset("7d").meta, dataStatus: "partial_error", failedSections: ["diagnosis"] },
  diagnosis: {
    ...makeReadyDataset("7d").diagnosis,
    aiQuality: {
      ...makeReadyDataset("7d").diagnosis.aiQuality,
      offline: {
        ...makeReadyDataset("7d").diagnosis.aiQuality.offline,
        passRate: { status: "error", message: "评测结果读取失败" },
        criticalFailureRate: { status: "error", message: "评测结果读取失败" },
      },
    },
  },
};

export const stale: DashboardData = {
  ...makeReadyDataset("7d"),
  meta: { ...makeReadyDataset("7d").meta, dataStatus: "stale", lastSuccessfulSync: "2026-09-10T18:42:00+08:00" },
  health: {
    metrics: makeReadyDataset("7d").health.metrics.map((m) =>
      m.value.status === "ready"
        ? { ...m, value: { status: "stale", value: m.value.value, lastSuccessfulSync: "2026-09-10T18:42:00+08:00" } }
        : m,
    ),
  },
};

export const mixedState: DashboardData = {
  ...makeReadyDataset("7d"),
  learningImpact: {
    metrics: makeReadyDataset("7d").learningImpact.metrics.map((m, i) =>
      i === 2 ? { ...m, value: { status: "insufficient" as const, sampleSize: 11, minimumSample: 30, reason: "延迟验证样本不足" }, trend: null } : m,
    ),
  },
  diagnosis: {
    ...makeReadyDataset("7d").diagnosis,
    aiQuality: {
      ...makeReadyDataset("7d").diagnosis.aiQuality,
      offline: {
        ...makeReadyDataset("7d").diagnosis.aiQuality.offline,
        passRate: { status: "not_connected", reason: "待接最新冻结评测结果" },
        criticalFailureRate: { status: "not_connected", reason: "待接最新冻结评测结果" },
      },
    },
  },
};
