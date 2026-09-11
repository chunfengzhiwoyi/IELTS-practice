/**
 * PRODUCT-LOOP-02C — Target Expression Selection（V1）
 * ------------------------------------------------------------
 * Vocabulary → Speaking 单向闭环的第一阶段选词。
 *
 * 职责：从用户已学词条中选出 1–2 个"值得在口语中主动调用"的表达。
 *
 * Frozen Safety Boundary（PRODUCT-LOOP-02C-IMPLEMENT §2）：
 *  - 本模块只读 UserItemState，绝不写入 applicationLevel / recallLevel /
 *    status / nextReviewAt / currentIntervalDays / consecutiveCorrect。
 *  - 返回 0 个目标是合法结果（不报错）。
 *
 * 判定完全确定性（无 LLM、无 embedding、无向量库）。
 */
import type { SeedLearningItem, UserItemState } from "@/lib/learning/types";

/** 表示该词条可用于口语话题匹配的 topic tag 集合（V1 用 topicTags，ielts.skills 元数据 seed 未填充） */
export const SPEAKING_TOPIC_TAGS = [
  "ielts-speaking",
  "ielts-part1",
  "ielts-part2",
  "ielts-part3",
] as const;

/** 每次 Speaking session 最多携带的目标表达数（V1 = 2：1 主 + 1 可选） */
export const MAX_TARGET_EXPRESSIONS = 2;

/** 目标表达候选（选择阶段） */
export interface TargetCandidate {
  itemId: string;
  canonicalForm: string;
  meaning: string;
  /** 选择理由（中文，简短，面向用户提示） */
  reason: string;
  /** 选择优先级分（仅内部/测试用） */
  score: number;
}

/** 选择阶段的信号（由调用方从事件流一次性构建，避免 N+1 查询） */
export interface TargetSelectionSignals {
  /** 7 天内新学的 itemId 集合（NEW 事件） */
  recentlyLearned?: ReadonlySet<string>;
  /** 7 天内有 INCORRECT 复习的 itemId 集合（脆弱信号） */
  recentlyIncorrect?: ReadonlySet<string>;
}

const SPEAKING_TAG_SET = new Set<string>(SPEAKING_TOPIC_TAGS);

/** 词条是否可用于口语（PHRASE/CHUNK 优先；WORD 需要有自然搭配） */
function isSpeakable(item: SeedLearningItem): boolean {
  if (item.itemType === "PHRASE" || item.itemType === "CHUNK") return true;
  if (item.itemType === "WORD") return (item.collocations?.length ?? 0) > 0;
  return false;
}

/** 词条是否带口语话题标记 */
function hasSpeakingTag(item: SeedLearningItem): boolean {
  return (item.topicTags ?? []).some((t) => SPEAKING_TAG_SET.has(t));
}

/**
 * 从用户已学状态中选择目标表达。
 *
 * 资格（全部满足）：
 *  1. 已学：status ∈ {EXPOSED, RECALLED_WITH_HELP, RECALLED_INDEPENDENTLY}
 *  2. 可口语化：PHRASE / CHUNK，或带 collocations 的 WORD
 *  3. 口语相关：topicTags 含口语标记
 *
 * 优先级分（降序取前 MAX_TARGET_EXPRESSIONS）：
 *  +3 近期新学（7d 内 NEW 事件）
 *  +2 status == EXPOSED（从未独立回忆）
 *  +2 status == RECALLED_WITH_HELP（需提示）
 *  +2 近期复习 INCORRECT
 *  +1 applicationLevel == 0（从未在口语中应用）
 *  +1 PHRASE / CHUNK
 *  -1 applicationLevel >= 2（已多次应用，让位给更需要巩固的）
 *
 * @param states  用户全部词条状态
 * @param itemOf  itemId → 词条定义（seed catalog）
 * @param signals 一次性事件信号（可选）
 * @returns 至多 MAX_TARGET_EXPRESSIONS 个候选；无候选返回 []（合法）
 */
export function selectTargetExpressions(
  states: UserItemState[],
  itemOf: (itemId: string) => SeedLearningItem | null,
  signals?: TargetSelectionSignals,
): TargetCandidate[] {
  const candidates: TargetCandidate[] = [];

  for (const state of states) {
    if (state.status === "NEW") continue; // 未学过不进入
    const item = itemOf(state.itemId);
    if (!item) continue;
    if (!isSpeakable(item)) continue;
    if (!hasSpeakingTag(item)) continue;

    const reasons: string[] = [];
    let score = 0;

    if (signals?.recentlyLearned?.has(state.itemId)) {
      score += 3;
      reasons.push("近期新学，尚未巩固");
    }
    if (state.status === "EXPOSED") {
      score += 2;
      reasons.push("学过但从未独立回忆");
    } else if (state.status === "RECALLED_WITH_HELP") {
      score += 2;
      reasons.push("需要提示才能回忆");
    }
    if (signals?.recentlyIncorrect?.has(state.itemId)) {
      score += 2;
      reasons.push("最近一次复习不理想");
    }
    if (state.applicationLevel === 0) {
      score += 1;
      reasons.push("还未在口语中用过");
    }
    if (item.itemType === "PHRASE" || item.itemType === "CHUNK") {
      score += 1;
    }
    if (state.applicationLevel >= 2) {
      score -= 1;
    }

    candidates.push({
      itemId: state.itemId,
      canonicalForm: item.term,
      meaning: item.coreMeaning,
      reason: reasons.length > 0 ? reasons.join("；") : "适合在口语中主动调用",
      score,
    });
  }

  // 确定性排序：分高优先；同分按 canonicalForm 字典序（稳定、可测试）
  candidates.sort((a, b) => b.score - a.score || a.canonicalForm.localeCompare(b.canonicalForm));
  return candidates.slice(0, MAX_TARGET_EXPRESSIONS);
}
