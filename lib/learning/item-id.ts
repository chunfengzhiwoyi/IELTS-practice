/**
 * 稳定 itemId 生成 + normalizeTerm + canonicalKey
 * ------------------------------------------------------------
 * 纯函数，客户端和服务端共用。不含 "use client" / "server-only"。
 *
 * 三个概念分离：
 * - canonicalForm (display): 用户看到的书写形式，如 "well-being"
 * - normalizedTerm (retrieval query): 用户输入的标准化形式，如 "well-being" / "wellbeing"
 * - canonicalKey (identity): 用于去重和 itemId 的规范键，如 "well-being"（变体经注册表解析）
 */

/**
 * 标准化 term：全小写，去首尾空格，合并连续空格。
 * 用于 display form 和 retrieval query。
 */
export function normalizeTerm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * 词法变体注册表（冻结，最小集合，Bad Case 035 Final Contract）
 * ------------------------------------------------------------
 * 同一 lexical identity 的不同书写变体 → 规范书写形。
 *
 * 规则：
 * - 仅收录「已确认为同一个词」的书写变体；
 * - 未收录的输入一律保持 normalizeTerm 原样（fail-safe：宁可不合并，不误合并）；
 * - 不引入 LLM lexical identity judge，不做大型词典系统。
 *
 * 代表性（canonical）必须是注册表值的自固定点：canonicalKey(值) === 值。
 * 与 supabase/migrations/0009_lexical_canonical_key.sql 的 UPDATE 保持一致。
 */
export const LEXICAL_VARIANTS: Readonly<Record<string, string>> = {
  "wellbeing": "well-being", // 同词异拼（IELTS health 话题高频）
  "e-mail": "email", // 同词异拼（现代标准拼写）
  "co-operate": "cooperate", // 同词异拼（现代标准拼写）
} as const;

/**
 * Canonical Key：用于 lexical identity / deduplication。
 *
 * 先 normalizeTerm（小写、trim、合并空格），再查词法变体注册表：
 * - 命中注册表 → 解析为规范书写形（如 "wellbeing" → "well-being"）；
 * - 未命中 → 保持原样（连字符、空格均保留，如 "re-cover" / "recover" 各自独立）。
 *
 * 设计原则：
 * - display form (canonicalForm) 保留原始书写，如 "well-being"
 * - canonical identity (canonicalKey) 用于 itemId 和去重，如 "well-being"
 * - retrieval query (normalizedTerm) 保留用户输入形式，如 "well-being" / "wellbeing"
 * 三者不混为一个字段。
 *
 * 安全性：不再无条件删除所有连字符。全局去连字符（旧方案）会把
 * re-cover/recover、co-op/coop 等真正不同的词错误合并；注册表方案只合并
 * 明确登记的同词变体，未登记输入各自独立（false positive 归零，
 * false negative 有界且可解释——新变体首次出现时按独立词处理）。
 */
export function canonicalKey(raw: string): string {
  const normalized = normalizeTerm(raw);
  return LEXICAL_VARIANTS[normalized] ?? normalized;
}

/**
 * 为一个 canonical key 生成确定性、稳定的 itemId。
 * 格式：item-{hash36}
 *
 * 使用 canonicalKey 而非 normalizedTerm，确保 "well-being" 和 "wellbeing"
 * 生成同一个 itemId。
 *
 * Seed 词条保留原有 "seed-xxx" 格式（本函数不处理 seed）。
 * 本函数只用于动态生成的 LearningItem。
 */
export function stableItemId(canonical: string): string {
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash) + canonical.charCodeAt(i);
    hash = hash & hash; // 32-bit int
  }
  return `item-${Math.abs(hash).toString(36)}`;
}

/**
 * 判断一个 itemId 是否来自 seed 词库。
 */
export function isSeedItemId(itemId: string): boolean {
  return itemId.startsWith("seed-");
}
