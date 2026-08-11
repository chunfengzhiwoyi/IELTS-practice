/**
 * 稳定 itemId 生成 + normalizeTerm
 * ------------------------------------------------------------
 * 纯函数，客户端和服务端共用。不含 "use client" / "server-only"。
 * 给定同一个 normalized term，永远返回同一个 itemId。
 */

/**
 * 标准化 term：全小写，去首尾空格，合并连续空格。
 */
export function normalizeTerm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * 为一个 normalized term 生成确定性、稳定的 itemId。
 * 格式：item-{hash36}
 * 
 * Seed 词条保留原有 "seed-xxx" 格式（本函数不处理 seed）。
 * 本函数只用于动态生成的 LearningItem。
 */
export function stableItemId(normalizedTerm: string): string {
  let hash = 0;
  for (let i = 0; i < normalizedTerm.length; i++) {
    hash = ((hash << 5) - hash) + normalizedTerm.charCodeAt(i);
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
