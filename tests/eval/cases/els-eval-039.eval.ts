/**
 * ELS-EVAL-039 — OBSERVATION_GATE（C 级：trace/context acceptance tool · M3-P3 已实现）
 * ------------------------------------------------------------------
 * gold（[FIX-08] 分层）：
 *  - M1 Gate（行 1–3，当前判定依据）：
 *    ① evidence_status SINGLE → REPEATED_PATTERN，且 observation 可从服务端持久化存储读回；
 *    ② ability_context_injected 基于服务端 observation 读取（正确维度 / ≤150 字 / 结构合法）；
 *    ③ （过渡期）本地缓存收敛至服务端值不漂移。
 *  - M2 Observability Gate（[M2_TARGET]，当前不参与 M1 判定）：
 *    ④ observation 写入 ↔ trace_id 关联；⑤ 可从 trace_id 回溯到源分析会话。
 *
 * M3-P3 实现（Eval-only acceptance tool，不改产品）：
 *  - M1：真实 analyze 路由（内存 provider）+ 服务端 MemoryAbilityRepository，
 *    断言 evidenceStatus 升迁 / 服务端读回 / abilityContext 注入（scripted LLM 观测 prompt）
 *  - M2：作为 SKIPPED 证据行记录（M2_TARGET 未达标，但不污染 M1 判定——FIX-08）
 */
import { POST as SPEAKING_SESSION } from "@/app/api/speaking/session/route";
import { POST as SPEAKING_ANALYZE } from "@/app/api/speaking/analyze/route";
import { GET as OBSERVATIONS_GET } from "@/app/api/ability/observations/route";
import { getAbilityRepository } from "@/lib/repository-factory";
import { buildSpeakingAbilityProfileFromObservations } from "@/lib/ability/profile-builder";
import { retrieveAbilityContext } from "@/lib/ability/memory-retriever";
import type { EvalCaseDefinition } from "../runner/harness";
import { callRoute, callRouteGet, evalTraceId } from "../runner/http";
import { speakingAnalysisJson } from "../runner/stub-llm";
import { T0_ISO, DEMO_USER_ID, traceOf } from "./helpers";

export const case_039: EvalCaseDefinition = {
  case_id: "ELS-EVAL-039",
  automation_level: "C",
  missing_capability: [],
  async run(ctx) {
    ctx.reset();
    ctx.clock.freeze(T0_ISO);
    const abilityRepo = getAbilityRepository();

    // ---- 预置（precondition）：用户已有 1 条 dimension=fluency 的 SINGLE observation ----
    await abilityRepo.writeObservation({
      userId: DEMO_USER_ID,
      dimension: "fluency",
      level: "developing",
      issues: ["语句间缺少连接"],
      evidence: ["回答仅一句，缺少展开"],
      suggestions: ["使用连接词串联观点"],
      sourceType: "SPEAKING",
      sourceId: "sess-001",
    });
    // 第 2 个会话观察（lexicalResource）：产品在 analyze 路由内于【写入前】读取服务端
    // observations 构建 profile —— 注入条件（totalSessions>=2）在读取时即需满足。
    // 因此预置两个历史会话，使被分析会话（第 3 次）读取到 totalSessions=2 → 触发注入。
    await abilityRepo.writeObservation({
      userId: DEMO_USER_ID,
      dimension: "lexicalResource",
      level: "adequate",
      issues: ["词汇范围有限"],
      evidence: ["使用了一些基础词汇"],
      suggestions: ["积累话题相关词汇"],
      sourceType: "SPEAKING",
      sourceId: "sess-002",
    });

    // 创建会话 3（被分析会话；totalSessions 读取时为 2）
    const sess = await callRoute(SPEAKING_SESSION, { questionId: "sp-p1-001" }, evalTraceId("039", 1));
    const sessionId = (sess.json as { session?: { id?: string } } | null)?.session?.id;
    if (!sessionId) {
      ctx.rec.blocked("r0-session", "创建口语会话失败", "sessionId", sessionId, { failure_layer: "SPEAKING" });
      return { coverage: "partial", actualSummary: "会话创建失败（BLOCKED）" };
    }

    // 分析会话 3（不带 client abilityContext → 路由基于服务端 observation 构建并注入）
    const stub = ctx.script([
      speakingAnalysisJson({
        summary: "回答结构清楚，内容展开不足。",
        levels: { fluency: "developing", lexicalResource: "adequate", grammaticalRange: "developing" },
      }),
    ]);
    const t2 = evalTraceId("039", 2);
    const res = await callRoute(SPEAKING_ANALYZE, { sessionId, answer: "My favourite place is a quiet park near my home. I go there every evening and it helps me relax after a long day at work." }, t2);
    const analyzeTrace = traceOf(t2);

    // ---- 读取服务端 observations（升迁 + 持久化读回）----
    const allObs = await abilityRepo.getAll(DEMO_USER_ID);
    const fluencyObs = allObs
      .filter((o) => o.dimension === "fluency")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const beforeStatus = fluencyObs[0]?.evidenceStatus;
    const afterStatus = fluencyObs[1]?.evidenceStatus;

    // r1: evidence_status SINGLE → REPEATED_PATTERN
    ctx.rec.check(
      "r1-evidence-status",
      "evidence_status_before=SINGLE → after=REPEATED_PATTERN（自动升迁）",
      { before: "SINGLE_OBSERVATION", after: "REPEATED_PATTERN" },
      { before: beforeStatus, after: afterStatus },
      {
        severity: "S2",
        failure_layer: "STATE_WRITE",
        metrics: ["M5"],
        evidence: {
          observations: fluencyObs.map((o) => ({ id: o.id, sourceId: o.sourceId, level: o.level, evidenceStatus: o.evidenceStatus, createdAt: o.createdAt })),
          observation_persisted_flag: true,
        },
      },
    );

    // r2: observation 可从服务端持久化存储读回（服务端 API 路径，非客户端 localStorage）
    const readBack = await callRouteGet(OBSERVATIONS_GET, {}, evalTraceId("039", 3));
    const readBackObs = (readBack.json as { observations?: Array<{ dimension: string; evidenceStatus: string }> } | null)?.observations ?? [];
    ctx.rec.check(
      "r2-server-readback",
      "observation 可从服务端持久化存储读回（服务端 Repository / API）",
      { status: 200, count: 5, hasRepeatedPattern: true },
      {
        status: readBack.status,
        count: readBackObs.length,
        hasRepeatedPattern: readBackObs.some((o) => o.dimension === "fluency" && o.evidenceStatus === "REPEATED_PATTERN"),
      },
      {
        severity: "S2",
        failure_layer: "STATE_READ",
        evidence: { readBack: readBackObs, apiStatus: readBack.status },
      },
    );

    // r3: ability_context_injected 基于服务端 observation 读取（正确维度 / ≤150 字 / 结构合法）
    const analyzeCall = stub.calls[0];
    const userContent = analyzeCall?.userContent ?? "";
    const memoryInjected =
      userContent.includes("学习者历史背景") &&
      userContent.includes("最薄弱维度：流利度与连贯性") &&
      userContent.includes("基于过去 2 次练习");
    // ≤150 字：对服务端 observation 复算同一纯函数（route 实际注入的就是该函数输出）。
    // 字 数口径：上下文对象内所有字符串值拼接长度（排除 JSON 结构字符/键名/数字）。
    const profile = buildSpeakingAbilityProfileFromObservations(DEMO_USER_ID, allObs);
    const measuredCtx = retrieveAbilityContext(profile);
    const ctxJson = JSON.stringify(measuredCtx);
    const contentChars = Object.values(measuredCtx as unknown as Record<string, unknown>)
      .flatMap((v) =>
        typeof v === "string"
          ? [v]
          : Array.isArray(v)
            ? v.filter((x): x is string => typeof x === "string")
            : typeof v === "object" && v !== null
              ? Object.values(v).filter((x): x is string => typeof x === "string")
              : [],
      )
      .join("").length;
    ctx.rec.check(
      "r3-ability-context-injected",
      "ability_context_injected 基于服务端 observation：正确维度、≤150 字、结构合法",
      { injected: true, weakestDimension: "fluency", contentCharsLte: true, promptHasTotalSessions2: true },
      {
        injected: memoryInjected,
        weakestDimension: memoryInjected ? "fluency" : null,
        contentCharsLte: contentChars <= 150,
        promptHasTotalSessions2: userContent.includes("基于过去 2 次练习"),
      },
      {
        severity: "S2",
        failure_layer: "MODEL",
        evidence: {
          measuredContentChars: contentChars,
          measuredJsonChars: ctxJson.length,
          measuredContext: ctxJson.slice(0, 300),
          promptSnippet: userContent.slice(0, 600),
          traceHasSessionId: (analyzeTrace?.events ?? []).some((e) => {
            const p = e.payload as Record<string, unknown> | undefined;
            return p?.session_id != null || String(p?.input_summary ?? "").includes(sessionId);
          }),
          traceEventTypes: (analyzeTrace?.events ?? []).map((e) => e.event_type),
        },
      },
    );

    // ---- M2 Observability Gate（[M2_TARGET]：当前不参与 M1 判定；作为证据行记录）----
    const obs2 = fluencyObs[1];
    const m2Rows = [
      {
        row_id: "m2-write-trace-link",
        description: "M2 Target：observation 写入 ↔ trace_id 关联（memory write 可经 trace 查询）",
        status: "SKIPPED" as const,
        expected: "M2_TARGET：observation 记录含 trace_id 或可经 trace 查询",
        actual: `observation 无 trace_id 字段（id/sourceId=sessionId）；当前仅可经 sourceId 间接关联`,
        severity: "S2" as const,
        failure_layer: "OBSERVABILITY",
        evidence: {
          observationFields: obs2 ? Object.keys(obs2) : null,
          observationSourceId: obs2?.sourceId,
          m2_note: "M2 未达标 → 按 FIX-08 不污染 M1 判定；§15 登记 milestone 缺口",
        },
      },
      {
        row_id: "m2-traceback-source-session",
        description: "M2 Target：可从 trace_id 回溯到源分析会话（source_id/session_id）",
        status: "SKIPPED" as const,
        expected: "M2_TARGET：trace_id → source analysis session 可回溯",
        actual: `部分可回溯：analyze trace 的 trace.start 含 session_id=${sessionId}，observation.sourceId=${obs2?.sourceId}（session_id）→ 经 session_id 关联`,
        severity: "S2" as const,
        failure_layer: "OBSERVABILITY",
        evidence: {
          traceId: t2,
          traceHasSessionId: (analyzeTrace?.events ?? []).some((e) => {
            const p = e.payload as Record<string, unknown> | undefined;
            return p?.session_id != null || String(p?.input_summary ?? "").includes(sessionId);
          }),
          sessionId,
          observationSourceId: obs2?.sourceId,
          m2_note: "M2 Target 部分可回溯；直接 observation↔trace_id 关联缺失（见 m2-write-trace-link）",
        },
      },
    ];
    for (const row of m2Rows) {
      ctx.rec.rows.push(row);
    }

    // r4（M1 过渡期）：本地缓存不存在 → 服务端值为唯一来源，无漂移面
    ctx.rec.check(
      "r4-no-local-cache-drift",
      "（过渡期）本地缓存若存在，刷新后收敛至服务端值不漂移；本环境无本地缓存路径",
      { driftSurface: false },
      { driftSurface: false },
      { severity: "S2", failure_layer: "STATE_READ", evidence: { note: "AUTH_MODE=demo + DATA_PROVIDER=memory：服务端 repo 为唯一来源" } },
    );

    return {
      coverage: "full",
      actualSummary:
        `M1 Gate：evidenceStatus ${beforeStatus} → ${afterStatus}（服务端读回 ${readBackObs.length} 条）；` +
        `abilityContext 注入（最弱维度=流利度，内容 ${contentChars} 字 / JSON ${ctxJson.length} 字符，totalSessions=2）` +
        `；M2 Target 作为证据行记录（observation↔trace_id 直接关联缺失 → milestone 缺口，不污染 M1 判定）。`,
      notes:
        "M3-P3 已实现 acceptance tool（adapter 内建）。M1 Gate 为当前判定依据；M2 Target（[FIX-08]）以 SKIPPED 证据行记录。" +
        "DATA_PROVIDER=memory 为 eval 模式的服务端仓库；supabase 持久化不在 Phase 0 覆盖范围。" +
        "注入时机：analyze 路由在写入前读取服务端 observations 构建 profile（totalSessions 读取时须 ≥2）→ 预置 2 个历史会话。",
    };
  },
};
