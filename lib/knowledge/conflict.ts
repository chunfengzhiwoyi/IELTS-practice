/**
 * Knowledge Conflict Detection V1 — deterministic helper (ELS-EVAL-026)
 * ---------------------------------------------------------------------
 * 定义（Frozen Gold ELS-EVAL-026）：
 *   conflict = 同一 guidanceType + 同一适用语境下，两个 lexical_guidance 对象
 *   对同一 register/appropriacy 维度给出极性相反的使用指令（positive vs negative），
 *   且指令指向同一 register target（或均为词级总括指令、无具体 target）。
 *
 * 分类（任务 §2）：
 *   A. complementary evidence  —— 多对象互相补充 → 不判冲突
 *   B. duplicate/redundant    —— 同内容重复 → 记录为 duplicate，不判语义冲突
 *   C. actual semantic conflict —— 同一问题给出不可同时成立的指导 → semantic_conflict
 *   D. precedence conflict    —— 不同 provenance/authority 结论不同 → 不自动判冲突
 *      （Gold [FIX-06]：优先级规则未冻结，不得建立 official>lexical 等硬优先级；
 *        本 helper 不比较 provenance，只做语义极性检测）
 *
 * 本模块为纯函数、确定性实现：
 *   - 不调用 LLM
 *   - 不引入优先级规则
 *   - 不依赖向量/重排等重型基础设施（当前 KB 仅 45 对象）
 */

import type { LexicalGuidanceObject, RetrievalMatch } from "@/lib/knowledge/types";

export type KnowledgeConflictType =
  | "semantic_conflict"
  | "duplicate"
  | "complementary"
  | "none";

export interface KnowledgeConflict {
  hasConflict: boolean;
  conflictType: KnowledgeConflictType;
  /** 参与语义冲突的知识对象 ID（trace 诊断用） */
  conflictingObjectIds: string[];
  /** 同内容重复（冗余，非语义冲突）对象 ID */
  duplicateObjectIds: string[];
  /** 冲突维度：guidanceType + 适用语境（无冲突 = null） */
  conflictDimension: string | null;
}

/** 正向使用指令 */
const POSITIVE_DIRECTIVE =
  /必须(?:要)?(?:使用|采用|用)|应当(?:使用|用)|应(?:该)?(?:使用|用)|需(?:要)?(?:使用|用)|优先(?:使用|采用|用)|must use|should use|recommend(?:ed)? to use/i;

/** 负向使用指令：必须绑定使用类动词（使用/采用/用），排除风格性"避免…表述/评价"类
 *  非词用指令（否则 lg-hedging"避免过于绝对的表述"会与 register 正向指引误判冲突）。 */
const NEGATIVE_DIRECTIVE =
  /(?:应|应当|必须|需|要|请)(?:避免|禁止)(?:使用|采用|用)|避免(?:使用|采用|用)|禁止(?:使用|采用|用)|禁用|不要(?:使用|采用|用)|不可(?:使用|采用|用)|不得(?:使用|采用|用)|不应(?:该)?(?:使用|采用|用)|勿(?:使用|采用|用)|should not use|must not use|avoid using|do not use|don'?t use/i;

/** register/appropriacy 维度 target 关键词 */
const REGISTER_TARGET =
  /正式|学术|academic|formal|中性|neutral|口语|informal|colloquial|非正式|semi-formal|半正式/g;

type ClaimPolarity = "positive" | "negative";

interface DirectiveClaim {
  polarity: ClaimPolarity;
  /** 命中的 register target；空数组 = 词级总括指令（无具体 target） */
  targets: string[];
}

function extractClaims(guidance: string): DirectiveClaim[] {
  const clauses = guidance
    .split(/[。！？；;.!?\n，,]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const claims: DirectiveClaim[] = [];
  for (const clause of clauses) {
    const targets = Array.from(new Set(clause.match(REGISTER_TARGET) ?? []));
    if (POSITIVE_DIRECTIVE.test(clause)) {
      claims.push({ polarity: "positive", targets });
    }
    if (NEGATIVE_DIRECTIVE.test(clause)) {
      claims.push({ polarity: "negative", targets });
    }
  }
  return claims;
}

/**
 * 两组指令是否存在语义冲突：
 * - 同 target（含两者均为词级总括 target=null）且极性相反 → 冲突
 * - target 不同 → 互补，不冲突
 */
function claimsConflict(a: DirectiveClaim[], b: DirectiveClaim[]): boolean {
  for (const ca of a) {
    for (const cb of b) {
      if (ca.polarity === cb.polarity) continue;
      const ta: Array<string | null> = ca.targets.length > 0 ? ca.targets : [null];
      const tb: Array<string | null> = cb.targets.length > 0 ? cb.targets : [null];
      if (ta.includes(null) && tb.includes(null)) return true;
      if (ta.some((t) => t !== null && tb.includes(t))) return true;
    }
  }
  return false;
}

function normalizeGuidanceText(g: string): string {
  return g
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，。！？；、：,.!?;:]/g, "");
}

/**
 * 确定性冲突检测（纯函数）。
 * 输入：retrieveKnowledge 的候选命中；只考察 lexical_guidance 对象。
 * 输出：语义冲突 / 重复 / 互补 / 无。
 */
export function detectKnowledgeConflict(matches: RetrievalMatch[]): KnowledgeConflict {
  const guidances = matches
    .filter((m) => m.object.type === "lexical_guidance")
    .map((m) => m.object as LexicalGuidanceObject);

  // 冲突分组：guidanceType + 相同 appliesTo.contexts（适用语境一致）
  const groups = new Map<string, LexicalGuidanceObject[]>();
  for (const g of guidances) {
    const ctxs = (g.content.appliesTo.contexts ?? []).slice().sort();
    const key = `${g.content.guidanceType}|${ctxs.join(",")}`;
    const list = groups.get(key) ?? [];
    list.push(g);
    groups.set(key, list);
  }

  const conflictingIds = new Set<string>();
  const duplicateIds = new Set<string>();
  let conflictDimension: string | null = null;

  for (const [key, list] of groups) {
    if (list.length < 2) continue;

    // 1) 语义冲突：同组内两两比较指令极性 + target
    const idsInvolved = new Set<string>();
    let found = false;
    for (let i = 0; i < list.length && !found; i++) {
      const gi = list[i];
      if (!gi) continue;
      for (let j = i + 1; j < list.length && !found; j++) {
        const gj = list[j];
        if (!gj) continue;
        if (claimsConflict(extractClaims(gi.content.guidance), extractClaims(gj.content.guidance))) {
          idsInvolved.add(gi.id);
          idsInvolved.add(gj.id);
          found = true;
        }
      }
    }
    if (found) {
      for (const id of idsInvolved) conflictingIds.add(id);
      conflictDimension ??= key;
      continue;
    }

    // 2) 重复（冗余）：同 guidanceType + 同语境 + 规范化文本相同 → 非语义冲突
    const seen = new Map<string, string>();
    for (const g of list) {
      const norm = normalizeGuidanceText(g.content.guidance);
      const prev = seen.get(norm);
      if (prev !== undefined && prev !== g.id) {
        duplicateIds.add(prev);
        duplicateIds.add(g.id);
      } else {
        seen.set(norm, g.id);
      }
    }
  }

  const hasConflict = conflictingIds.size > 0;
  const conflictType: KnowledgeConflictType = hasConflict
    ? "semantic_conflict"
    : duplicateIds.size > 0
      ? "duplicate"
      : guidances.length > 1
        ? "complementary"
        : "none";

  return {
    hasConflict,
    conflictType,
    conflictingObjectIds: [...conflictingIds],
    duplicateObjectIds: [...duplicateIds],
    conflictDimension,
  };
}

/**
 * 双源并陈差异提示（Gold pass_criteria 3：走双源并陈必须携带差异提示）。
 * 附加到 promptContext 末尾，告知 LLM 两条互斥指引不可同时遵循。
 */
export function buildConflictNote(conflict: KnowledgeConflict): string {
  const ids = conflict.conflictingObjectIds.join("、");
  const dimension = conflict.conflictDimension ?? "未知维度";
  return (
    `\n[冲突提示] 检测到 ${conflict.conflictingObjectIds.length} 个知识对象给出互斥指引` +
    `（${ids}；维度：${dimension}）：两条指引不能同时成立，此处已并陈且不自动取舍。` +
    `生成词卡时请勿同时遵循，请结合当前词条与 IELTS 语域要求给出单一一致的建议。`
  );
}
