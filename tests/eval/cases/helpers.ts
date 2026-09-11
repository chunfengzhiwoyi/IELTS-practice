/**
 * ELS Eval Case 共享助手
 * ------------------------------------------------------------
 * 基于真实 Repository / Route 的 seeding 与观测工具。
 * DEMO_USER_ID 与 lib/auth/demo-user.ts 的默认值一致（未设置环境覆盖）。
 */
import { getRepository } from "@/lib/learning/service";
import { traceStore } from "@/lib/observability/trace-store";
import type { TraceEvent } from "@/lib/observability/trace-contract";
import type { MemoryLearningRepository } from "@/lib/learning/repositories/memory-learning-repository";
import {
  getAllSeedItems,
  seedToLearningItem,
} from "@/lib/learning/seed-catalog";
import type { LearningItem } from "@/lib/learning/types";
import type { UpsertUserItemStateInput } from "@/lib/learning/repository";

export const DEMO_USER_ID = "demo-user-001";

/** Eval 统一时钟基准 */
export const T0_ISO = "2026-09-01T10:00:00.000Z";

export function memRepo(): MemoryLearningRepository {
  return getRepository() as MemoryLearningRepository;
}

/** 把 seed 词条写入 repo 并返回 item */
export async function seedItemIntoRepo(seedId: string): Promise<LearningItem> {
  const seed = getAllSeedItems().find((s) => s.itemId === seedId);
  if (!seed) throw new Error(`seed 不存在: ${seedId}`);
  const repo = memRepo();
  return repo.createOrGetItem(seedToLearningItem(seed));
}

/** 预置用户状态 */
export async function putState(
  itemId: string,
  overrides: Partial<UpsertUserItemStateInput> = {},
): Promise<void> {
  await memRepo().upsertUserItemState({
    userId: DEMO_USER_ID,
    itemId,
    status: "NEW",
    recognitionLevel: 0,
    recallLevel: 0,
    applicationLevel: 0,
    consecutiveCorrect: 0,
    currentIntervalDays: 1,
    nextReviewAt: T0_ISO,
    ...overrides,
  });
}

/** ISO 时间运算（基于固定基准，避免手写时间字符串出错） */
export function iso(base: string, offsetMs: number): string {
  return new Date(new Date(base).getTime() + offsetMs).toISOString();
}

export const HOUR = 3_600_000;
export const MIN = 60_000;

/** 读取某 item 的当前状态（可能为 null） */
export async function currentState(itemId: string) {
  return memRepo().getUserItemState(DEMO_USER_ID, itemId);
}

/** 某 item 的事件列表 */
export function eventsFor(itemId: string) {
  return memRepo()
    ._getAllEvents()
    .filter((e) => e.itemId === itemId);
}

// =============================================================
// M2 Trace 证据读取（诊断用途）
// ------------------------------------------------------------
// Gold 判定 PASS / FAIL；Trace 只负责解释为什么（suspect layer、
// rule 命中、idempotency 语义等）。不把 trace 证据当 verdict。
// =============================================================

export function traceOf(traceId: string) {
  return traceStore.getTrace(traceId);
}

export function eventsOfType(
  events: TraceEvent[] | null | undefined,
  eventType: string,
): TraceEvent[] {
  return (events ?? []).filter((e) => e.event_type === eventType);
}

export function payloadOf<T = Record<string, unknown>>(
  e: TraceEvent | undefined,
): T | null {
  return e ? (e.payload as unknown as T) : null;
}

/**
 * 取 speaking_quality_gate 的 validation.result 载荷。
 * 注意：同一次 analyze 会先发射 zod:SpeakingAnalysis 的 validation.result（structured-output 层），
 * 再发射 speaking_quality_gate 的 validation.result（feedback-quality 层）——必须按 validator 区分。
 */
export function speakingGateOf(trace: { events?: TraceEvent[] | null } | null | undefined): Record<string, unknown> | null {
  return (
    eventsOfType(trace?.events, "validation.result")
      .map((e) => payloadOf(e))
      .find((p) => p?.validator === "speaking_quality_gate") ?? null
  );
}
