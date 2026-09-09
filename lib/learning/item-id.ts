/**
 * 稳定 itemId 生成 + normalizeTerm + canonicalKey
 * ------------------------------------------------------------
 * 纯函数，客户端和服务端共用。不含 "use client" / "server-only"。
 *
 * 三个概念分离：
 * - canonicalForm (display): 用户看到的书写形式，如 "well-being"
 * - normalizedTerm (retrieval query): 用户输入的标准化形式，如 "well-being"
 * - canonicalKey (identity): 用于去重和 itemId 的规范键，如 "wellbeing"
 */

/**
 * 标准化 term：全小写，去首尾空格，合并连续空格。
 * 用于 display form 和 retrieval query。
 */
export function normalizeTerm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Canonical Key：用于 lexical identity / deduplication。
 * 在 normalizeTerm 基础上去除连字符，使 "well-being" 和 "wellbeing"
 * 映射到同一个 canonical identity。
 *
 * 设计原则：
 * - display form (canonicalForm) 保留原始书写，如 "well-being"
 * - canonical identity (canonicalKey) 用于 itemId 和去重，如 "wellbeing"
 * - retrieval query (normalizedTerm) 保留用户输入形式，如 "well-being"
 * 三者不混为一个字段。
 *
 * 已知 trade-off：极少数真正不同的词可能被合并（如 co-op/coop），
 * 但对 IELTS 词汇学习场景，同一概念因书写变体产生两份长期状态的代价更大。
 */
export function canonicalKey(raw: string): string {
  return normalizeTerm(raw).replace(/-/g, "");
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
