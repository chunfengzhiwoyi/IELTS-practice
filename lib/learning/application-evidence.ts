/**
 * PRODUCT-LOOP-04E — Application Evidence History + Derived applicationLevel
 * ------------------------------------------------------------
 * Speaking→Vocabulary V1.1 状态落地：
 *   Validated Speaking Evidence → Persistent Evidence History → deriveApplicationLevel → applicationLevel 0|1|2
 *
 * SSOT 模型（04D §2/§3）：
 *   - Evidence History 是 application ability 的唯一事实源；
 *   - applicationLevel 是「派生状态 / materialized cache」，永远可从 evidence 历史重算
 *     （RECOMPUTABLE_FROM_HISTORY = YES；删除 derived 字段不影响恢复）。
 *
 * Frozen Safety Boundary（04D §7 / §17–19）：
 *   - Speaking Evidence 只允许影响 applicationLevel；
 *   - 绝不修改 recallLevel / status / nextReviewAt / currentIntervalDays /
 *     consecutiveCorrect / review schedule / recognitionLevel；
 *   - applicationLevel = 2 ≠ MASTERED；Planner 不读 applicationLevel（04E 不改 Planner）。
 *
 * 阈值性质（04D §4）：2 次 / 3 次 / 2 天 / 2 语境为 conservative V1 heuristic，
 * 标记 HEURISTIC_NOT_PEDAGOGICALLY_VALIDATED；无降级、无 decay（V1）。
 */
import type { LearningRepository } from "@/lib/learning/repository";
import type {
  SpeakingAnalysisResult,
  SpeakingSession,
  ValidatedTargetExpressionEvidence,
} from "@/lib/speaking/types";

/** applicationLevel 派生值（0 | 1 | 2） */
export type ApplicationLevel = 0 | 1 | 2;

/** 当前可信 evidence pipeline 版本下限（04D §16-3；旧/无 provenance 证据不参与晋级） */
export const MIN_TRUSTED_PIPELINE_VERSION = "04B-validator-1";

/** 04E 落库时写入的 pipeline 版本标识 */
export const CURRENT_PIPELINE_VERSION = "04B-validator-1";

/**
 * ApplicationEvidenceRecord — 一条 validated Speaking evidence（事实记录）。
 * 04D §3.1 proposal 的落地字段；session 元数据（questionId/part/topic）为
 * derivation 性能 denormalize；provider/model 用于未来 pipeline 升级时重新解释，
 * 不存任何 secret。
 */
export interface ApplicationEvidenceRecord {
  evidenceId: string;
  userId: string;
  itemId: string;
  /** 幂等键：同一 (userId, itemId, sessionId) 至多一条 final evidence */
  sessionId: string;
  /** 跨 context 派生用（deterministic metadata，无 LLM） */
  questionId: string;
  part: "P1" | "P2" | "P3";
  topic: string;
  assessment: "CORRECT" | "ISSUE" | "UNCERTAIN" | "NOT_USED";
  /** grounding 锚（CORRECT/ISSUE 非空；NOT_USED 为 null） */
  quote: string | null;
  /** validator/LLM 判据摘要 */
  reason: string;
  /** validator 降级/修复说明 */
  validatorNotes: string[];
  /** == (assessment === "CORRECT") */
  upgradeCandidate: boolean;
  /** first=非CORRECT → second=CORRECT（04D §3.2 retry 语义） */
  recoveredViaRetry: boolean;
  /** ISO（UTC）；derivation 的日历日判定用 */
  recordedAt: string;
  pipelineVersion: string;
  provider: string | null;
  model: string | null;
}

/** 04E 落库入参（从 validated evidence + session 元数据组装） */
export type RecordApplicationEvidenceInput = Omit<
  ApplicationEvidenceRecord,
  "evidenceId" | "recordedAt"
>;

/**
 * ApplicationEvidenceRepository — evidence history 持久化契约。
 * Memory / Supabase 双实现保持语义 parity。
 */
export interface ApplicationEvidenceRepository {
  /** 幂等 upsert：(userId, itemId, sessionId) 唯一，重复调用覆盖为同一条 */
  upsertApplicationEvidence(
    record: ApplicationEvidenceRecord,
  ): Promise<ApplicationEvidenceRecord>;
  /** 单条读取（retry 合并用） */
  getApplicationEvidence(
    userId: string,
    itemId: string,
    sessionId: string,
  ): Promise<ApplicationEvidenceRecord | null>;
  /** 该 user+item 的完整 evidence history（derivation 输入） */
  listApplicationEvidence(userId: string, itemId: string): Promise<ApplicationEvidenceRecord[]>;
}

/** assessment 置信度（duplicate 防御去重用）：CORRECT > ISSUE > UNCERTAIN > NOT_USED */
const ASSESSMENT_PRIORITY: Record<ApplicationEvidenceRecord["assessment"], number> = {
  CORRECT: 3,
  ISSUE: 2,
  UNCERTAIN: 1,
  NOT_USED: 0,
};

/** 是否属于可信 pipeline 的 evidence（04D §9 / S19：旧/无 provenance 不参与晋级，但保留 audit） */
function isTrustedPipeline(e: ApplicationEvidenceRecord): boolean {
  return (
    typeof e.pipelineVersion === "string" &&
    e.pipelineVersion.length > 0 &&
    e.pipelineVersion >= MIN_TRUSTED_PIPELINE_VERSION
  );
}

/**
 * 同 session 防御性去重：每 sessionId 至多取一条参与计数的 evidence。
 * 规则（确定性）：先按 assessment 置信度取最高；同置信度取 recordedAt 最新。
 * 正常路径下 (sessionId,itemId) 唯一约束已保证单条；此为派生函数的双保险。
 */
function dedupeBySession(
  records: ApplicationEvidenceRecord[],
): ApplicationEvidenceRecord[] {
  const best = new Map<string, ApplicationEvidenceRecord>();
  for (const r of records) {
    const existing = best.get(r.sessionId);
    if (!existing) {
      best.set(r.sessionId, r);
      continue;
    }
    const existingP = ASSESSMENT_PRIORITY[existing.assessment];
    const newP = ASSESSMENT_PRIORITY[r.assessment];
    if (newP > existingP || (newP === existingP && r.recordedAt > existing.recordedAt)) {
      best.set(r.sessionId, r);
    }
  }
  return [...best.values()];
}

/** recordedAt（ISO UTC）的日历日（04D §14：统一 UTC 规则；slice(0,10) 即 UTC 日期） */
function calendarDayOf(recordedAt: string): string {
  return recordedAt.slice(0, 10);
}

/**
 * deriveApplicationLevel — 纯函数派生（04D §5.1 规则落地）。
 * ------------------------------------------------------------
 * 输入：某 (userId, itemId) 的全部 ApplicationEvidenceRecord
 * 过滤：assessment==CORRECT && upgradeCandidate==true && 可信 pipelineVersion
 * 去重：每个 sessionId 取一条
 * 计数：
 *   C = 去重后 CORRECT session 数
 *   D = distinct 日历日（recordedAt 的 UTC 日期）数
 *   K = distinct context 数 = max(distinct questionId, distinct topic)（04D §5.1 较大口径）
 * 规则：
 *   C < 2            → 0
 *   C == 2           → 1
 *   C >= 3 且 D>=2 且 K>=2 → 2
 *   其他 C >= 3       → 1
 *
 * 性质：deterministic / idempotent / order-insensitive / recomputable。
 */
export function deriveApplicationLevel(
  evidenceHistory: ApplicationEvidenceRecord[],
): ApplicationLevel {
  const qualifying = evidenceHistory.filter(
    (e) => e.assessment === "CORRECT" && e.upgradeCandidate === true && isTrustedPipeline(e),
  );
  const deduped = dedupeBySession(qualifying);
  const C = deduped.length;
  if (C < 2) return 0;
  if (C === 2) return 1;
  // C >= 3
  const D = new Set(deduped.map((e) => calendarDayOf(e.recordedAt))).size;
  const distinctQuestions = new Set(deduped.map((e) => e.questionId)).size;
  const distinctTopics = new Set(deduped.map((e) => e.topic)).size;
  const K = Math.max(distinctQuestions, distinctTopics);
  if (D >= 2 && K >= 2) return 2;
  return 1;
}

/**
 * recomputeApplicationLevelFromEvidence — 从 evidence history 重算 applicationLevel。
 * 不写任何状态；纯读取 + 派生。
 */
export async function recomputeApplicationLevelFromEvidence(
  evidenceRepo: ApplicationEvidenceRepository,
  userId: string,
  itemId: string,
): Promise<ApplicationLevel> {
  const history = await evidenceRepo.listApplicationEvidence(userId, itemId);
  return deriveApplicationLevel(history);
}

/**
 * recomputeAndWriteApplicationLevel — 重算并写回 UserItemState.applicationLevel。
 * ------------------------------------------------------------
 * 写回纪律（04D §28 / §17）：applicationLevel 是 materialized cache；
 * 本函数只改 applicationLevel 一个字段，其余全部原样保留。
 * 若用户尚无 UserItemState（从未学习该词），不创建状态、不写回（applicationLevel 语义
 * 仅存在于已学词的上下文中；无 evidence 历史 → 默认 0，见 §30）。
 */
export async function recomputeAndWriteApplicationLevel(
  learningRepo: LearningRepository,
  evidenceRepo: ApplicationEvidenceRepository,
  userId: string,
  itemId: string,
): Promise<ApplicationLevel> {
  const level = await recomputeApplicationLevelFromEvidence(evidenceRepo, userId, itemId);
  const state = await learningRepo.getUserItemState(userId, itemId);
  if (state) {
    await learningRepo.upsertUserItemState({
      userId,
      itemId,
      status: state.status,
      recognitionLevel: state.recognitionLevel,
      recallLevel: state.recallLevel,
      applicationLevel: level,
      consecutiveCorrect: state.consecutiveCorrect,
      currentIntervalDays: state.currentIntervalDays,
      nextReviewAt: state.nextReviewAt,
    });
  }
  return level;
}

/**
 * buildApplicationEvidenceRecord — 从 validated evidence + session 元数据组装 record。
 * 只接收 validator 固化后的 evidence（绝不接收 raw LLM output）。
 */
export function buildApplicationEvidenceRecord(opts: {
  userId: string;
  session: SpeakingSession;
  evidence: ValidatedTargetExpressionEvidence;
  /** second answer 分析时传入 first 的 assessment（retry 合并；非 second 传 null） */
  firstAssessment: ValidatedTargetExpressionEvidence["assessment"] | null;
  now?: string;
}): ApplicationEvidenceRecord {
  const { userId, session, evidence, firstAssessment, now } = opts;
  const recoveredViaRetry =
    firstAssessment !== null && firstAssessment !== "CORRECT" && evidence.assessment === "CORRECT";
  return {
    evidenceId: `${userId}:${evidence.itemId}:${session.id}`,
    userId,
    itemId: evidence.itemId,
    sessionId: session.id,
    questionId: session.questionId,
    part: session.part,
    topic: session.topic,
    assessment: evidence.assessment,
    quote: evidence.quote,
    reason: evidence.reason,
    validatorNotes: evidence.validatorNotes,
    upgradeCandidate: evidence.upgradeCandidate,
    recoveredViaRetry,
    recordedAt: now ?? new Date().toISOString(),
    pipelineVersion: CURRENT_PIPELINE_VERSION,
    provider: null,
    model: null,
  };
}

/**
 * recordApplicationEvidenceFromAnalysis — 04E 落库钩子（analyze route 调用）。
 * ------------------------------------------------------------
 * 语义（04D §3.2 / §12 / §25–26）：
 *   - 只记录 validated evidence（analysis.targetExpressionEvidence）；
 *   - 只处理 session frozen suggestedExpressions 内的 target（server authority，防御性再过滤）；
 *   - 0 targets → 不产生任何 record；
 *   - 同 session 重复 analyze / retry → upsert 覆盖为同一条（(userId,itemId,sessionId) 唯一）；
 *   - second 分析覆盖 first：recoveredViaRetry = first≠CORRECT && second==CORRECT；
 *   - 每次落库后按 item 重算并写回 applicationLevel。
 *
 * 禁止（04D §7）：本函数绝不触碰 recallLevel/status/nextReviewAt/currentIntervalDays/
 * consecutiveCorrect/review schedule。
 *
 * @returns 每条已落库 record + 每个 target 的重算后 level
 */
export async function recordApplicationEvidenceFromAnalysis(opts: {
  userId: string;
  session: SpeakingSession;
  analysis: SpeakingAnalysisResult;
  /** first 已落库（或已分析）时的 first assessment（second 时传；first 传 null） */
  isSecondAnswer: boolean;
  learningRepo: LearningRepository;
  evidenceRepo: ApplicationEvidenceRepository;
  now?: string;
}): Promise<{
  recorded: ApplicationEvidenceRecord[];
  levelByItem: Map<string, ApplicationLevel>;
}> {
  const { userId, session, analysis, isSecondAnswer, learningRepo, evidenceRepo, now } = opts;
  const validated = analysis.targetExpressionEvidence ?? [];
  const targets = session.suggestedExpressions ?? [];
  const targetByItem = new Map(targets.map((t) => [t.itemId, t]));

  const recorded: ApplicationEvidenceRecord[] = [];
  for (const ev of validated) {
    if (!targetByItem.has(ev.itemId)) continue; // server authority：非 session target 丢弃
    const firstEvidence =
      isSecondAnswer && session.firstAnalysis
        ? (session.firstAnalysis.targetExpressionEvidence ?? []).find(
            (e) => e.itemId === ev.itemId,
          )
        : null;
    const record = buildApplicationEvidenceRecord({
      userId,
      session,
      evidence: ev,
      firstAssessment: firstEvidence?.assessment ?? null,
      now,
    });
    await evidenceRepo.upsertApplicationEvidence(record);
    recorded.push(record);
  }

  // 重算并写回每个 frozen target 的 applicationLevel（无状态词条不创建状态）
  const levelByItem = new Map<string, ApplicationLevel>();
  for (const target of targets) {
    const level = await recomputeAndWriteApplicationLevel(
      learningRepo,
      evidenceRepo,
      userId,
      target.itemId,
    );
    levelByItem.set(target.itemId, level);
  }
  return { recorded, levelByItem };
}
