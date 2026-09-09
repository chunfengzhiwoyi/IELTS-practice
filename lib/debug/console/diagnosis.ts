/**
 * M2 Phase 3A — Failure Layer Diagnosis（最小 deterministic suspect logic）
 * ------------------------------------------------------------
 * 依据 M2_OBSERVABILITY_CONTRACT_V2_2 §4.4「Trace → Root Cause 判层规则」实现：
 *   按事件顺序做瀑布排除，第一个异常证据所在层即 Primary Suspect Layer。
 *
 * 纯函数、无副作用、无 LLM：禁止让 LLM 猜 Root Cause。
 * 可同时被服务端与浏览器端 import（不依赖 server-only / traceStore）。
 *
 * 对 §4.4 的最小确定性解释（超出契约字面的判定均在此文档化）：
 *   判层主键 = 事件顺序：契约 §4.2 步骤 2「扫瀑布找第一个异常事件（时间线自上而下
 *     第一个 error/degraded）」；因此 12 项检查全部评估后，Primary Suspect Layer =
 *     命中检查中「证据事件 seq 最小」的那一层（若同 seq 多检查命中，按 checkId 小者优先，
 *     与 §4.4 表序一致）。
 *   检查 2 (ROUTING)：契约证据为「intent_decision ≠ 期望」，期望值无法从单条 trace 内
 *     获得，故用机器可观测代理：reject_reason 存在 / disambiguation_needed=true / status=error。
 *   检查 3 (STATE_READ)：契约证据为「snapshot_summary 与期望不符」，期望值同样不可得，
 *     用 state_not_found=true / status=error 作为机器可观测代理。
 *   检查 5 (PROMPT)：契约证据为「同 prompt_version 系统性 fail」，跨 trace 聚合在 Console
 *     D 区呈现；本检查实现为 trace 内聚合：≥2 次同 (prompt_key, prompt_version) 的
 *     llm.attempt 全部 error 即命中。
 *   检查 6 (MODEL)：契约证据「raw_output 内容错（schema 对但语义错）」无法机械判定
 *     （需人工看 raw），故最小实现取 llm.attempt.status=error（超时/解析/provider 错误）
 *     作为 MODEL 层异常证据。
 *   检查 7 (OUTPUT_VALIDATION)：outcome=fail 或 needs_review 均视为命中
 *     （needs_review = 质量门/四门分数告警，契约 Case 016/019 判层同归 OUTPUT_VALIDATION）。
 *   检查 8/10/11：outputs-vs-inputs 不符、checksum 重算、链误切均需外部规格/重放工具，
 *     最小实现只取对应事件 status=error。
 *   检查 9 (STATE_WRITE)：idempotency_outcome=duplicate_ignored 是幂等重放的**正确**行为
 *     （Case 037），不作为异常证据；只有 status=error 命中。
 *   检查 12 (UI_PRESENTATION)：契约证据「以上全对但用户看到的不对」，用
 *     response.sent.status=error 或 http_status>=400 作为代理。
 */
import type {
  FailureLayer,
  FullTrace,
  TraceEvent,
  TraceEventType,
} from "@/lib/observability/trace-contract";

// =============================================================
// 端点 × 节点期望矩阵（§1.3 / Phase2 §3）
// 用于区分「结构性缺席（不适用）」与「期望节点缺席（埋点缺口）」
// =============================================================

export const ENDPOINT_EXPECTED_EVENTS: Record<string, ReadonlySet<TraceEventType>> = {
  "/api/agent/message": new Set<TraceEventType>([
    "request.received",
    "routing.decided",
    "llm.attempt",
    "validation.result",
    "fallback.triggered",
    "response.sent",
  ]),
  "/api/learn/card": new Set<TraceEventType>([
    "request.received",
    "retrieval.executed",
    "state.read",
    "llm.attempt",
    "validation.result",
    "fallback.triggered",
    "response.sent",
  ]),
  "/api/learn/submit": new Set<TraceEventType>([
    "request.received",
    "state.read",
    "llm.attempt",
    "validation.result",
    "fallback.triggered",
    "rule.applied",
    "state.write",
    "response.sent",
  ]),
  "/api/review/session": new Set<TraceEventType>([
    "request.received",
    "state.read",
    "response.sent",
  ]),
  "/api/review/submit": new Set<TraceEventType>([
    "request.received",
    "state.read",
    "llm.attempt",
    "validation.result",
    "fallback.triggered",
    "rule.applied",
    "state.write",
    "response.sent",
  ]),
  "/api/speaking/analyze": new Set<TraceEventType>([
    "request.received",
    "state.read",
    "llm.attempt",
    "validation.result",
    "fallback.triggered",
    "rule.applied",
    "state.write",
    "response.sent",
  ]),
  "/api/report": new Set<TraceEventType>([
    "request.received",
    "state.read",
    "llm.attempt",
    "validation.result",
    "rule.applied",
    "report.aggregated",
    "response.sent",
  ]),
};

/** 未知路由保守处理：所有节点视为期望（避免漏报埋点缺口） */
function expectedEventsFor(route: string): ReadonlySet<TraceEventType> | null {
  return ENDPOINT_EXPECTED_EVENTS[route] ?? null;
}

// =============================================================
// 检查定义（12 项瀑布，§4.4）
// =============================================================

export type CheckStatus = "pass" | "fail" | "evidence_missing" | "not_applicable";

export interface DiagnosisCheck {
  checkId: number;
  layer: FailureLayer;
  label: string;
  evidenceRule: string;
  targetEventTypes: TraceEventType[];
  status: CheckStatus;
  evidence: string[];
  eventSeqs: number[];
}

export interface DiagnosisResult {
  trace_id: string;
  route: string;
  primary_suspect_layer: FailureLayer;
  checks: DiagnosisCheck[];
  evidence: string[];
  summary: string;
  degraded: boolean;
  llm_call_count: number;
  rule_keys: string[];
  idempotency_outcomes: string[];
  http_status: number | null;
  app_error_code: string | null;
}

interface CheckPredicate {
  checkId: number;
  layer: FailureLayer;
  label: string;
  evidenceRule: string;
  targetEventTypes: TraceEventType[];
  /** 返回 { fired, evidence, seqs }：命中即该层存在异常证据 */
  evaluate: (events: TraceEvent[], header: FullTrace["header"]) => {
    fired: boolean;
    evidence: string[];
    seqs: number[];
  };
}

function str(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  return typeof v === "string" ? v : undefined;
}

function num(payload: Record<string, unknown>, key: string): number | undefined {
  const v = payload[key];
  return typeof v === "number" ? v : undefined;
}

function bool(payload: Record<string, unknown>, key: string): boolean | undefined {
  const v = payload[key];
  return typeof v === "boolean" ? v : undefined;
}

function eventsOf(events: TraceEvent[], types: TraceEventType[]): TraceEvent[] {
  const set = new Set(types);
  return events.filter((e) => set.has(e.event_type));
}

/** 查找 rule.applied 短路解释（empty_answer_short_circuit / insufficient_data / ...） */
export function shortCircuitExplanation(events: TraceEvent[]): string | null {
  for (const e of events) {
    if (e.event_type !== "rule.applied") continue;
    const key = str(e.payload, "rule_key");
    if (!key) continue;
    if (key === "empty_answer_short_circuit" || key === "insufficient_data") {
      const count = e.payload.llm_call_count;
      if (count === 0) {
        return `rule.applied(${key}) @seq${e.seq} 正向解释 llm_call_count=0`;
      }
    }
  }
  return null;
}

const CHECK_PREDICATES: CheckPredicate[] = [
  {
    checkId: 1,
    layer: "INPUT",
    label: "输入合法性",
    evidenceRule: "request.received 输入即非法/为空",
    targetEventTypes: ["request.received"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["request.received"])) {
        const summary = str(e.payload, "input_summary");
        if (e.status === "error" || summary === undefined || summary.trim() === "") {
          fired.push(
            `request.received @seq${e.seq} status=${e.status} input_summary=${
              summary === undefined ? "<缺失>" : summary === "" ? "<空>" : JSON.stringify(summary)
            }`,
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 2,
    layer: "ROUTING",
    label: "意图路由",
    evidenceRule: "routing.decided.intent_decision ≠ 期望（代理：reject / disambiguation / error）",
    targetEventTypes: ["routing.decided"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["routing.decided"])) {
        const reject = str(e.payload, "reject_reason");
        const disamb = bool(e.payload, "disambiguation_needed");
        const intent = str(e.payload, "intent_decision") ?? "<缺失>";
        if (e.status === "error" || reject !== undefined || disamb === true) {
          fired.push(
            `routing.decided @seq${e.seq} status=${e.status} intent_decision=${intent}` +
              (reject !== undefined ? ` reject_reason=${JSON.stringify(reject)}` : "") +
              (disamb === true ? " disambiguation_needed=true" : ""),
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 3,
    layer: "STATE_READ",
    label: "状态读取",
    evidenceRule: "state.read.snapshot_summary 与期望不符（代理：state_not_found / error）",
    targetEventTypes: ["state.read"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["state.read"])) {
        const notFound = bool(e.payload, "state_not_found");
        const entity = str(e.payload, "entity") ?? "<缺失>";
        if (e.status === "error" || notFound === true) {
          fired.push(
            `state.read @seq${e.seq} status=${e.status} entity=${entity}` +
              (notFound === true ? " state_not_found=true" : ""),
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 4,
    layer: "RETRIEVAL",
    label: "知识检索",
    evidenceRule: "retrieval.executed ids 漏/多/冲突",
    targetEventTypes: ["retrieval.executed"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["retrieval.executed"])) {
        const miss = bool(e.payload, "knowledge_miss_flag");
        const conflict = bool(e.payload, "conflict_detected");
        const ids = e.payload.knowledge_object_ids;
        const queryRaw = str(e.payload, "query_raw");
        if (e.status === "error" || miss === true || conflict === true) {
          fired.push(
            `retrieval.executed @seq${e.seq} status=${e.status} query_raw=${JSON.stringify(queryRaw ?? "<缺失>")}` +
              (miss === true ? " knowledge_miss_flag=true ids=[]" : "") +
              (conflict === true ? " conflict_detected=true" : "") +
              (Array.isArray(ids) && ids.length > 0 ? ` ids=${JSON.stringify(ids)}` : ""),
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 5,
    layer: "PROMPT",
    label: "Prompt 版本",
    evidenceRule: "同 prompt_version 下系统性 fail（trace 内：≥2 次同版本全 error）",
    targetEventTypes: ["llm.attempt"],
    evaluate: (events) => {
      const attempts = eventsOf(events, ["llm.attempt"]);
      const groups = new Map<string, TraceEvent[]>();
      for (const a of attempts) {
        const key = `${str(a.payload, "prompt_key") ?? "?"}@${str(a.payload, "prompt_version") ?? "?"}`;
        const list = groups.get(key) ?? [];
        list.push(a);
        groups.set(key, list);
      }
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const [key, list] of groups) {
        if (list.length >= 2 && list.every((a) => a.status === "error")) {
          fired.push(
            `llm.attempt×${list.length} 同 (prompt_key, prompt_version)=${key} 全部 status=error（seqs ${list
              .map((a) => a.seq)
              .join(",")}）`,
          );
          seqs.push(...list.map((a) => a.seq));
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 6,
    layer: "MODEL",
    label: "模型调用",
    evidenceRule: "llm.attempt.raw_output 内容错 / 调用失败（最小实现：status=error）",
    targetEventTypes: ["llm.attempt"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["llm.attempt"])) {
        if (e.status === "error") {
          fired.push(
            `llm.attempt @seq${e.seq} status=error attempt_purpose=${str(e.payload, "attempt_purpose") ?? "?"} provider=${
              str(e.payload, "provider") ?? "?"
            } error_code=${e.error_code ?? e.payload.llm_error_code ?? "<缺失>"} latency_ms=${num(e.payload, "latency_ms") ?? "?"}`,
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 7,
    layer: "OUTPUT_VALIDATION",
    label: "输出校验",
    evidenceRule: "validation.result.outcome=fail（含 needs_review）",
    targetEventTypes: ["validation.result"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["validation.result"])) {
        const outcome = str(e.payload, "outcome");
        if (outcome === "fail" || outcome === "needs_review") {
          fired.push(
            `validation.result @seq${e.seq} outcome=${outcome} validator=${str(e.payload, "validator") ?? "?"}` +
              (num(e.payload, "repair_attempts") !== undefined
                ? ` repair_attempts=${num(e.payload, "repair_attempts")}`
                : ""),
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 8,
    layer: "BUSINESS_RULE",
    label: "业务规则",
    evidenceRule: "rule.applied.outputs 与输入不符（最小实现：status=error）",
    targetEventTypes: ["rule.applied"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["rule.applied"])) {
        if (e.status === "error") {
          fired.push(`rule.applied @seq${e.seq} status=error rule_key=${str(e.payload, "rule_key") ?? "?"}`);
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 9,
    layer: "STATE_WRITE",
    label: "状态写入",
    evidenceRule: "state.write 写错/漏写（duplicate_ignored 属正常重放，不算异常）",
    targetEventTypes: ["state.write"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["state.write"])) {
        if (e.status === "error") {
          fired.push(
            `state.write @seq${e.seq} status=error entity=${str(e.payload, "entity") ?? "?"} idempotency_outcome=${str(
              e.payload,
              "idempotency_outcome",
            ) ?? "?"}`,
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 10,
    layer: "REPORT_AGGREGATION",
    label: "报告聚合",
    evidenceRule: "report.aggregated.aggregate_checksum 与事件流重算不符（最小实现：status=error）",
    targetEventTypes: ["report.aggregated"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["report.aggregated"])) {
        if (e.status === "error") {
          fired.push(
            `report.aggregated @seq${e.seq} status=error period=${str(e.payload, "period") ?? "?"}`,
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 11,
    layer: "FALLBACK",
    label: "降级链",
    evidenceRule: "fallback.triggered 链本身错（误切换/该切未切；最小实现：status=error）",
    targetEventTypes: ["fallback.triggered"],
    evaluate: (events) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["fallback.triggered"])) {
        if (e.status === "error") {
          fired.push(
            `fallback.triggered @seq${e.seq} status=error trigger_error_code=${str(e.payload, "trigger_error_code") ?? "?"}`,
          );
          seqs.push(e.seq);
        }
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
  {
    checkId: 12,
    layer: "UI_PRESENTATION",
    label: "响应边界",
    evidenceRule: "以上全对但用户看到的不对（代理：response.sent status=error / http_status≥400）",
    targetEventTypes: ["response.sent"],
    evaluate: (events, header) => {
      const fired: string[] = [];
      const seqs: number[] = [];
      for (const e of eventsOf(events, ["response.sent"])) {
        const http = num(e.payload, "http_status");
        const appCode = str(e.payload, "app_error_code");
        if (e.status === "error" || (http !== undefined && http >= 400)) {
          fired.push(
            `response.sent @seq${e.seq} status=${e.status} http_status=${http ?? "?"} app_error_code=${
              appCode ?? "<null>"
            }`,
          );
          seqs.push(e.seq);
        }
      }
      if (header.http_status !== null && header.http_status >= 400) {
        fired.push(
          `trace header http_status=${header.http_status} app_error_code=${header.app_error_code ?? "<null>"}（无更早层证据时，可能是埋点缺口或未捕获异常）`,
        );
      }
      return { fired: fired.length > 0, evidence: fired, seqs };
    },
  },
];

// =============================================================
// 诊断执行
// =============================================================

export function runDiagnosis(fullTrace: FullTrace): DiagnosisResult {
  const { header, events } = fullTrace;
  const expected = expectedEventsFor(header.route);

  const checks: DiagnosisCheck[] = CHECK_PREDICATES.map((p) => {
    const targetPresent = eventsOf(events, p.targetEventTypes).length > 0;
    const structurallyAbsent =
      expected !== null && p.targetEventTypes.every((t) => !expected.has(t));

    // 检查 1/12 的目标事件（request.received / response.sent）对任何端点都是期望节点
    const alwaysExpected = p.targetEventTypes.includes("request.received") ||
      p.targetEventTypes.includes("response.sent");

    if (!targetPresent && structurallyAbsent && !alwaysExpected) {
      return {
        checkId: p.checkId,
        layer: p.layer,
        label: p.label,
        evidenceRule: p.evidenceRule,
        targetEventTypes: p.targetEventTypes,
        status: "not_applicable" as CheckStatus,
        evidence: [`该端点无 ${p.targetEventTypes.join("/")} 节点（结构性缺席，§1.3 矩阵）`],
        eventSeqs: [],
      };
    }
    if (!targetPresent) {
      const missingTypes = p.targetEventTypes.filter(
        (t) => expected === null || expected.has(t),
      );
      const extra = shortCircuitExplanation(events);
      return {
        checkId: p.checkId,
        layer: p.layer,
        label: p.label,
        evidenceRule: p.evidenceRule,
        targetEventTypes: p.targetEventTypes,
        status: "evidence_missing" as CheckStatus,
        evidence: [
          `无 ${p.targetEventTypes.join("/")} 事件` +
            (missingTypes.length === p.targetEventTypes.length
              ? `（${expected === null ? "未知端点，保守视为期望" : "期望节点缺席 ⚠️ 可能为埋点缺口"}）`
              : "（部分类型结构性缺席）"),
          ...(extra ? [`但 ${extra}`] : []),
        ],
        eventSeqs: [],
      };
    }
    const result = p.evaluate(events, header);
    return {
      checkId: p.checkId,
      layer: p.layer,
      label: p.label,
      evidenceRule: p.evidenceRule,
      targetEventTypes: p.targetEventTypes,
      status: result.fired ? ("fail" as CheckStatus) : ("pass" as CheckStatus),
      evidence: result.fired
        ? result.evidence
        : [`${p.targetEventTypes.join("/")} 事件存在，未命中异常证据`],
      eventSeqs: result.seqs,
    };
  });

  const failedChecks = checks.filter((c) => c.status === "fail");
  // 事件顺序判层：命中检查中「证据事件 seq 最小」的层胜出（同 seq 按 checkId 小者优先）
  let primaryCheck: DiagnosisCheck | null = null;
  for (const c of failedChecks) {
    if (c.eventSeqs.length === 0) continue;
    const minSeq = Math.min(...c.eventSeqs);
    const currentMin = primaryCheck ? Math.min(...primaryCheck.eventSeqs) : Infinity;
    if (minSeq < currentMin || (minSeq === currentMin && c.checkId < (primaryCheck?.checkId ?? Infinity))) {
      primaryCheck = c;
    }
  }
  const primary: FailureLayer = primaryCheck?.layer ?? "UNKNOWN";

  const llmCallCount = eventsOf(events, ["llm.attempt"]).length;
  const ruleKeys = eventsOf(events, ["rule.applied"])
    .map((e) => str(e.payload, "rule_key"))
    .filter((k): k is string => k !== undefined);
  const idempotencyOutcomes = eventsOf(events, ["state.write"])
    .map((e) => str(e.payload, "idempotency_outcome"))
    .filter((k): k is string => k !== undefined);

  let evidence: string[];
  let summary: string;
  if (primaryCheck) {
    evidence = primaryCheck.evidence;
    summary = `PRIMARY_SUSPECT_LAYER=${primary} — ${primaryCheck.evidence[0] ?? primaryCheck.label}`;
  } else {
    const facts: string[] = [];
    facts.push(`http_status=${header.http_status ?? "?"}`);
    facts.push(`llm_call_count=${llmCallCount}`);
    if (header.degradation_flag) facts.push("degradation_flag=true");
    if (ruleKeys.length > 0) facts.push(`rule.applied=[${ruleKeys.join(", ")}]`);
    if (idempotencyOutcomes.length > 0) facts.push(`idempotency_outcome=[${idempotencyOutcomes.join(", ")}]`);
    evidence = [`无异常证据：12 项检查均通过（${facts.join("；")}）`];
    summary = `PRIMARY_SUSPECT_LAYER=UNKNOWN — ${evidence[0]}`;
  }

  return {
    trace_id: header.trace_id,
    route: header.route,
    primary_suspect_layer: primary,
    checks,
    evidence,
    summary,
    degraded: header.degradation_flag,
    llm_call_count: llmCallCount,
    rule_keys: ruleKeys,
    idempotency_outcomes: idempotencyOutcomes,
    http_status: header.http_status,
    app_error_code: header.app_error_code,
  };
}

/** 便捷别名 */
export function diagnoseTrace(fullTrace: FullTrace): DiagnosisResult {
  return runDiagnosis(fullTrace);
}
