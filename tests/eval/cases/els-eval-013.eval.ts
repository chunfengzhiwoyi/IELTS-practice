/**
 * ELS-EVAL-013 — STATE_CONSISTENCY（C 级：replay 专用工具 · M3-P3 已实现）
 * ------------------------------------------------------------------
 * gold：replay(events) == user_item_states（事件流重放状态与快照一致），
 * 事件流无重复 client_event_id，快照 updated_at 单调。
 *
 * M3-P3：实现 Eval-only replay harness（tests/eval/tools/replay-harness.ts）：
 *  - 真实脚本序列 S：3 词 learn（INDEPENDENT）+ 复习 2 轮 + 1 次重复 clientEventId
 *  - 冻结时钟（ctx.clock.freeze/advance）→ 产品路由与重放器看到同一 now()
 *  - 重放器调用产品纯函数（computeInitialReviewAt / computeReviewNextAt）以事件
 *    createdAt 为锚点重算 nextReviewAt/intervalDays；层级字段镜像路由确定性规则
 *  - 逐字段比对 replay 状态 vs 快照（getAllUserItemStates）
 *
 * 不修改产品代码；若重放器实跑后产品不满足 Gold → 登记 Bad Case（只记录不修）。
 */
import { POST as LEARN_SUBMIT } from "@/app/api/learn/submit/route";
import { POST as REVIEW_SUBMIT } from "@/app/api/review/submit/route";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, evalTraceId } from "../runner/http";
import { judgeJson } from "../runner/stub-llm";
import { T0_ISO, DEMO_USER_ID, seedItemIntoRepo, memRepo, HOUR, MIN, iso } from "./helpers";
import { replayUserItemStates, compareReplayToSnapshot } from "../tools/replay-harness";

export const case_013: EvalCaseDefinition = {
  case_id: "ELS-EVAL-013",
  automation_level: "C",
  missing_capability: [],
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);

    // ---- 预置：3 个 seed 词条 ----
    const w1 = await seedItemIntoRepo("seed-001");
    const w2 = await seedItemIntoRepo("seed-002");
    const w3 = await seedItemIntoRepo("seed-003");

    // ---- 脚本化 LLM：learn×3(true) + review r1×3(true,true,false) + r2×1(true) + 重复提交×1(true) ----
    const stub = ctx.script([
      judgeJson(true), judgeJson(true), judgeJson(true),
      judgeJson(true), judgeJson(true), judgeJson(false),
      judgeJson(true),
      judgeJson(true),
    ]);

    // 学习 3 词（INDEPENDENT×3）
    await callRoute(
      LEARN_SUBMIT,
      { itemId: w1.id, taskType: "MEANING_RECALL", answer: "减轻", usedHint: false, clientEventId: "013-l-w1" },
      evalTraceId("013", 1),
    );
    ctx.clock.advance(MIN);
    await callRoute(
      LEARN_SUBMIT,
      { itemId: w2.id, taskType: "MEANING_RECALL", answer: "缓解", usedHint: false, clientEventId: "013-l-w2" },
      evalTraceId("013", 2),
    );
    ctx.clock.advance(MIN);
    await callRoute(
      LEARN_SUBMIT,
      { itemId: w3.id, taskType: "MEANING_RECALL", answer: "促进", usedHint: false, clientEventId: "013-l-w3" },
      evalTraceId("013", 3),
    );

    // 复习轮 1（+25h：3 词均到期）
    ctx.clock.advance(25 * HOUR);
    await callRoute(
      REVIEW_SUBMIT,
      { itemId: w1.id, taskType: "MEANING_RECALL", answer: "减轻", usedHint: false, skipped: false, clientEventId: "013-r-w1" },
      evalTraceId("013", 4),
    );
    ctx.clock.advance(MIN);
    await callRoute(
      REVIEW_SUBMIT,
      { itemId: w2.id, taskType: "MEANING_RECALL", answer: "缓解", usedHint: true, skipped: false, clientEventId: "013-r-w2" },
      evalTraceId("013", 5),
    );
    ctx.clock.advance(MIN);
    await callRoute(
      REVIEW_SUBMIT,
      { itemId: w3.id, taskType: "MEANING_RECALL", answer: "促进", usedHint: false, skipped: false, clientEventId: "013-r-w3" },
      evalTraceId("013", 6),
    );

    // 复习轮 2（+5h：w3 于 r1 后 +4h 到期）
    ctx.clock.advance(5 * HOUR);
    await callRoute(
      REVIEW_SUBMIT,
      { itemId: w3.id, taskType: "MEANING_RECALL", answer: "促进", usedHint: false, skipped: false, clientEventId: "013-r2-w3" },
      evalTraceId("013", 7),
    );

    // 1 次重复 clientEventId（w1 的 r1 提交原样重放）+1h
    ctx.clock.advance(HOUR);
    const dupRes = await callRoute(
      REVIEW_SUBMIT,
      { itemId: w1.id, taskType: "MEANING_RECALL", answer: "减轻", usedHint: false, skipped: false, clientEventId: "013-r-w1" },
      evalTraceId("013", 8),
    );

    // ---- 读取事件全集与快照 ----
    const until = iso(ctx.clock.now().toISOString(), HOUR);
    const events = await memRepo().getUserEventsInRange(DEMO_USER_ID, T0_ISO, until);
    const snapshot = await memRepo().getAllUserItemStates(DEMO_USER_ID);

    const replay = replayUserItemStates(events);
    const comparison = compareReplayToSnapshot(replay, snapshot);

    // r1: replay(events) == user_item_states（逐字段比较）
    ctx.rec.check(
      "r1-replay-eq-snapshot",
      "replay(events) == user_item_states（逐字段比较）",
      { matches: true, diffCount: 0 },
      { matches: comparison.matches, diffCount: comparison.diffs.length },
      {
        severity: "S1",
        failure_layer: "STATE_READ",
        metrics: ["M5"],
        evidence: {
          replay_checksum: comparison.diffs.length === 0 ? "MATCH" : "DIFF",
          diffs: comparison.diffs.slice(0, 20),
          eventCount: events.length,
          itemCount: snapshot.length,
        },
      },
    );

    // r2: events 无重复 client_event_id
    const clientEventIds = events.map((e) => e.clientEventId);
    ctx.rec.check(
      "r2-no-dup-client-event-id",
      "events 无重复 client_event_id",
      { unique: true, count: clientEventIds.length },
      { unique: new Set(clientEventIds).size === clientEventIds.length, count: clientEventIds.length },
      {
        severity: "S1",
        failure_layer: "STATE_WRITE",
        evidence: { client_event_id_set: clientEventIds },
      },
    );

    // r3: 快照 updated_at 单调（per-item 严格递增）
    const byItem = new Map<string, string[]>();
    for (const ev of events) {
      const list = byItem.get(ev.itemId) ?? [];
      list.push(ev.createdAt);
      byItem.set(ev.itemId, list);
    }
    const monotonic = [...byItem.entries()].map(([itemId, times]) => {
      const sorted = [...times].sort();
      const strictly = times.every((t, i) => i === 0 || t > times[i - 1]!);
      return { itemId, updated_at_sequence: times, strictlyIncreasing: strictly, sorted: sorted.join(",") === times.join(",") };
    });
    ctx.rec.check(
      "r3-updated-at-monotonic",
      "快照 updated_at 单调（逐 item 不倒退）",
      { monotonic: true },
      { monotonic: monotonic.every((m) => m.strictlyIncreasing) },
      {
        severity: "S1",
        failure_layer: "STATE_WRITE",
        evidence: { perItem: monotonic },
      },
    );

    // r4（must_not）：重复 clientEventId 不产生新事件、不推进状态
    const w1Events = events.filter((e) => e.itemId === w1.id);
    const w1State = snapshot.find((s) => s.itemId === w1.id);
    ctx.rec.check(
      "r4-dup-no-advance",
      "重复 clientEventId 重放不二次推进状态（事件不重复进流）",
      {
        eventCountW1: 2, // 1 learn + 1 review（重复不新增）
        dupStatus: 200,
        recallLevelAfterDup: 2,
      },
      {
        eventCountW1: w1Events.length,
        dupStatus: dupRes.status,
        recallLevelAfterDup: w1State?.recallLevel,
      },
      {
        severity: "S1",
        failure_layer: "STATE_WRITE",
        evidence: {
          duplicateResponse: dupRes.json,
          w1_event_ids: w1Events.map((e) => e.clientEventId),
        },
      },
    );

    return {
      coverage: "full",
      actualSummary:
        comparison.matches
          ? `replay==snapshot（${snapshot.length} items 逐字段一致）；events=${events.length} 条无重复 clientEventId；updated_at 单调；重复提交幂等。`
          : `replay≠snapshot（${comparison.diffs.length} 处 diff）→ 真实 FAIL（登记 Bad Case，不修产品）`,
      notes:
        "M3-P3 专用工具 replay_job 已实现；Frozen Gold 语义未改变。若 FAIL：产品行为不满足 Gold → Bad Case（只记录不修）。",
    };
  },
};
