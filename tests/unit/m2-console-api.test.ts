/**
 * M2 Phase 3A — Debug Console: API 端点
 * ------------------------------------------------------------
 * 直接调用 route handler（plain function），验证：
 *   GET /api/debug/traces/[traceId]   （现有端点，console 主数据源）
 *   GET /api/debug/traces              （列表 + client_event_id / user_hash / prompt_version 过滤 + 版本统计）
 *   GET /api/debug/traces/fixtures     （fixture 幂等注入）
 */
import { describe, it, expect, beforeEach } from "vitest";

import { GET as getList } from "@/app/api/debug/traces/route";
import { GET as getFixtures } from "@/app/api/debug/traces/fixtures/route";
import { GET as getTraceById } from "@/app/api/debug/traces/[traceId]/route";
import { ensureDebugFixtures } from "@/lib/debug/console/fixtures";
import { setTraceEnabled } from "@/lib/observability/trace-context";
import { traceStore } from "@/lib/observability/trace-store";

describe("M2 Phase 3A: GET /api/debug/traces/[traceId]", () => {
  beforeEach(async () => {
    traceStore.reset();
    setTraceEnabled(true);
    await ensureDebugFixtures();
  });

  it("返回 header + events（seq 升序）", async () => {
    const res = await getTraceById(new Request("http://localhost/api/debug/traces/trc_m2a_normal"), {
      params: Promise.resolve({ traceId: "trc_m2a_normal" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.header.trace_id).toBe("trc_m2a_normal");
    expect(body.header.event_count).toBe(body.events.length);
    const seqs = body.events.map((e: { seq: number }) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it("不存在的 trace → 404", async () => {
    const res = await getTraceById(new Request("http://localhost/api/debug/traces/trc_nope"), {
      params: Promise.resolve({ traceId: "trc_nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("M2 Phase 3A: GET /api/debug/traces（列表 + 关联查询）", () => {
  beforeEach(async () => {
    traceStore.reset();
    setTraceEnabled(true);
    await ensureDebugFixtures();
  });

  it("无过滤返回全部 fixture trace 及 prompt_version 统计", async () => {
    const res = await getList(new Request("http://localhost/api/debug/traces"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(6);
    expect(body.prompt_version_stats["v1"]).toBeDefined();
    expect(body.prompt_version_stats["v1"].total).toBeGreaterThanOrEqual(5);
    expect(body.traces[0]).toHaveProperty("llm_attempts");
  });

  it("client_event_id 过滤：同幂等键两条 trace 命中（Case 037 关联）", async () => {
    const res = await getList(
      new Request("http://localhost/api/debug/traces?client_event_id=ce-m2c-replay-001"),
    );
    const body = await res.json();
    expect(body.total).toBe(2);
    const ids = body.traces.map((t: { trace_id: string }) => t.trace_id).sort();
    expect(ids).toEqual(["trc_m2c_replay_1", "trc_m2c_replay_2"]);
  });

  it("prompt_version 过滤 + 统计", async () => {
    const res = await getList(new Request("http://localhost/api/debug/traces?prompt_version=v1"));
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(5);
    // 每条命中 trace 都含 v1 的 llm.attempt
    for (const t of body.traces) {
      expect(t.llm_attempts.some((a: { prompt_version: string }) => a.prompt_version === "v1")).toBe(true);
    }
    // 空答案短路 fixture 无 llm.attempt → 不被 prompt_version=v1 命中
    const ids = body.traces.map((t: { trace_id: string }) => t.trace_id);
    expect(ids).not.toContain("trc_m2d_empty");
  });

  it("limit 参数生效", async () => {
    const res = await getList(new Request("http://localhost/api/debug/traces?limit=2"));
    const body = await res.json();
    expect(body.traces.length).toBeLessThanOrEqual(2);
    expect(body.limit).toBe(2);
  });
});

describe("M2 Phase 3A: GET /api/debug/traces/fixtures", () => {
  beforeEach(() => {
    traceStore.reset();
    setTraceEnabled(true);
  });

  it("注入 5 个场景 fixture 并返回元信息；重复调用不重复写入", async () => {
    const res1 = await getFixtures();
    const body1 = await res1.json();
    expect(body1.count).toBe(6);
    const scenarios = new Set(body1.fixtures.map((f: { scenario: string }) => f.scenario));
    expect(scenarios.size).toBe(5);

    const countBefore = traceStore.getTrace("trc_m2a_normal")!.header.event_count;
    const res2 = await getFixtures();
    const body2 = await res2.json();
    expect(body2.count).toBe(6);
    expect(traceStore.getTrace("trc_m2a_normal")!.header.event_count).toBe(countBefore);
  });
});
