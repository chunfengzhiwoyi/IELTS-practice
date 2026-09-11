/**
 * ELS Eval Runner — Replay Harness（C 级 Special Tool：ELS-EVAL-013）
 * ------------------------------------------------------------------
 * 离线重放器：从 learning_events 事件流重建 user_item_states，并与快照逐字段比对。
 *
 * 设计原则：
 *  - 不复制业务逻辑：next_review_at / interval_days 直接调用产品纯函数
 *    （lib/review/initial-schedule.ts + review-schedule.ts），以事件 createdAt 为时钟锚点。
 *  - 层级字段（recognition/recall/consecutive/status）镜像 review/learn submit 路由的
 *    确定性更新规则（路由内联逻辑，无独立纯函数可复用）。
 *  - 幂等语义：clientEventId 去重在 Repository 层；replay 输入应为去重后的唯一事件流，
 *    重复 clientEventId 的第二次提交不产生新事件（Gold must_not：重复事件不得进流）。
 *
 * 证据产出：逐字段 diff（itemId / field / expected=快照 / actual=重放）。
 */
import type { LearningEvent, UserItemState } from "@/lib/learning/types";
import {
  computeInitialReviewAt,
  initialIntervalDays,
  type InitialScheduleQuality,
} from "@/lib/review/initial-schedule";
import {
  computeReviewNextAt,
  type ReviewScheduleQuality,
} from "@/lib/review/review-schedule";

// 与产品 HOURS_MAP / REVIEW_HOURS 一致的常量（replay 时钟锚点用）
const INITIAL_HOURS: Record<InitialScheduleQuality, number> = {
  INDEPENDENT: 24,
  HINTED: 8,
  FAIL: 2,
  SKIPPED: 2,
  EXPOSED: 4,
};

const REVIEW_HOURS: Record<ReviewScheduleQuality, number> = {
  CORRECT_INDEPENDENT: 72,
  CORRECT_WITH_HINT: 24,
  INCORRECT: 4,
  SKIPPED: 2,
};

const NEW_STATUS: Record<InitialScheduleQuality, UserItemState["status"]> = {
  INDEPENDENT: "RECALLED_INDEPENDENTLY",
  HINTED: "RECALLED_WITH_HELP",
  FAIL: "EXPOSED",
  SKIPPED: "EXPOSED",
  EXPOSED: "EXPOSED",
};

const REVIEW_STATUS: Record<ReviewScheduleQuality, UserItemState["status"]> = {
  CORRECT_INDEPENDENT: "RECALLED_INDEPENDENTLY",
  CORRECT_WITH_HINT: "RECALLED_WITH_HELP",
  INCORRECT: "EXPOSED",
  SKIPPED: "EXPOSED",
};

// 产品 computeIntervalDays 的镜像（review 侧）
const REVIEW_INTERVAL_DAYS: Record<ReviewScheduleQuality, number> = {
  CORRECT_INDEPENDENT: 3,
  CORRECT_WITH_HINT: 1,
  INCORRECT: 4 / 24,
  SKIPPED: 2 / 24,
};

/** 逐字段比较结果 */
export interface FieldDiff {
  itemId: string;
  field: string;
  expected: unknown; // 快照值
  actual: unknown; // 重放值
}

export interface ReplayComparison {
  matches: boolean;
  diffs: FieldDiff[];
  replayStates: UserItemState[];
  snapshotStates: UserItemState[];
  /** replay 计算的 per-item 事件序列（诊断） */
  eventCountPerItem: Record<string, number>;
}

const COMPARE_FIELDS = [
  "userId",
  "itemId",
  "status",
  "recognitionLevel",
  "recallLevel",
  "applicationLevel",
  "consecutiveCorrect",
  "currentIntervalDays",
  "nextReviewAt",
  "updatedAt",
] as const;

/** 单事件状态转换（NEW）——镜像 app/api/learn/submit/route.ts 的确定性更新规则 */
function applyNewEvent(ev: LearningEvent, prev: UserItemState | undefined): UserItemState {
  const q = ev.resultJson?.scheduleQuality as InitialScheduleQuality | undefined;
  const quality: InitialScheduleQuality =
    q && q in INITIAL_HOURS ? q : (ev.correctness as InitialScheduleQuality) ?? "FAIL";
  const hours = INITIAL_HOURS[quality] ?? 2;
  return {
    userId: ev.userId,
    itemId: ev.itemId,
    status: NEW_STATUS[quality] ?? "EXPOSED",
    recognitionLevel: ev.correctness === "INDEPENDENT" ? 1 : (prev?.recognitionLevel ?? 0),
    recallLevel: ev.correctness === "INDEPENDENT" ? 1 : ev.correctness === "HINTED" ? 1 : 0,
    applicationLevel: 0,
    consecutiveCorrect:
      ev.correctness === "INDEPENDENT" ? (prev?.consecutiveCorrect ?? 0) + 1 : 0,
    currentIntervalDays: initialIntervalDays(quality),
    nextReviewAt: computeInitialReviewAt(quality, () => new Date(ev.createdAt)),
    updatedAt: ev.createdAt,
  };
}

/** 单事件状态转换（REVIEW）——镜像 app/api/review/submit/route.ts 的确定性更新规则 */
function applyReviewEvent(ev: LearningEvent, prev: UserItemState | undefined): UserItemState {
  const r = ev.resultJson?.reviewResult as ReviewScheduleQuality | undefined;
  const result: ReviewScheduleQuality =
    r && r in REVIEW_HOURS ? r : ev.correctness === "FAIL" ? "INCORRECT" : "CORRECT_INDEPENDENT";
  const base = prev ?? {
    userId: ev.userId,
    itemId: ev.itemId,
    status: "EXPOSED" as const,
    recognitionLevel: 0,
    recallLevel: 0,
    applicationLevel: 0,
    consecutiveCorrect: 0,
    currentIntervalDays: 1,
    nextReviewAt: ev.createdAt,
    updatedAt: ev.createdAt,
  };
  return {
    userId: ev.userId,
    itemId: ev.itemId,
    status: REVIEW_STATUS[result] ?? "EXPOSED",
    recognitionLevel: base.recognitionLevel ?? 1,
    recallLevel:
      result === "CORRECT_INDEPENDENT"
        ? Math.min((base.recallLevel ?? 0) + 1, 2)
        : (base.recallLevel ?? 0),
    applicationLevel: base.applicationLevel ?? 0,
    consecutiveCorrect:
      result === "CORRECT_INDEPENDENT" || result === "CORRECT_WITH_HINT"
        ? (base.consecutiveCorrect ?? 0) + 1
        : 0,
    currentIntervalDays: REVIEW_INTERVAL_DAYS[result] ?? 4 / 24,
    nextReviewAt: computeReviewNextAt(result, () => new Date(ev.createdAt)),
    updatedAt: ev.createdAt,
  };
}

/**
 * 从事件流重建 user_item_states（按 itemId 分组，createdAt 升序折叠；
 * createdAt 相同保持事件写入顺序——与 repo 追加顺序一致）。
 */
export function replayUserItemStates(events: LearningEvent[]): UserItemState[] {
  const byItem = new Map<string, LearningEvent[]>();
  for (const ev of events) {
    const list = byItem.get(ev.itemId) ?? [];
    list.push(ev);
    byItem.set(ev.itemId, list);
  }

  const states: UserItemState[] = [];
  for (const [itemId, itemEvents] of byItem) {
    const sorted = [...itemEvents].sort((a, b) => {
      const t = a.createdAt.localeCompare(b.createdAt);
      return t !== 0 ? t : 0; // 相同 createdAt 保持原顺序（Array.prototype.sort 稳定）
    });
    let state: UserItemState | undefined;
    for (const ev of sorted) {
      state =
        ev.eventType === "REVIEW"
          ? applyReviewEvent(ev, state)
          : applyNewEvent(ev, state);
    }
    if (state) states.push(state);
  }

  // 与 repo getAllUserItemStates 排序一致（按 itemId）
  return states.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/** 逐字段比较 replay 状态与快照状态 */
export function compareReplayToSnapshot(
  replayStates: UserItemState[],
  snapshotStates: UserItemState[],
): ReplayComparison {
  const snapshotMap = new Map(snapshotStates.map((s) => [s.itemId, s]));
  const diffs: FieldDiff[] = [];
  const eventCountPerItem: Record<string, number> = {};

  for (const rs of replayStates) {
    const snap = snapshotMap.get(rs.itemId);
    if (!snap) {
      diffs.push({ itemId: rs.itemId, field: "(missing in snapshot)", expected: rs, actual: null });
      continue;
    }
    for (const field of COMPARE_FIELDS) {
      const expected = snap[field];
      const actual = rs[field];
      const ok =
        typeof expected === "number" && typeof actual === "number"
          ? Math.abs(expected - actual) < 1e-9
          : expected === actual;
      if (!ok) {
        diffs.push({ itemId: rs.itemId, field, expected, actual });
      }
    }
  }
  // 快照中多出的 item（replay 未覆盖）
  for (const snap of snapshotStates) {
    if (!replayStates.some((rs) => rs.itemId === snap.itemId)) {
      diffs.push({ itemId: snap.itemId, field: "(missing in replay)", expected: snap, actual: null });
    }
  }

  return {
    matches: diffs.length === 0,
    diffs,
    replayStates,
    snapshotStates,
    eventCountPerItem,
  };
}
