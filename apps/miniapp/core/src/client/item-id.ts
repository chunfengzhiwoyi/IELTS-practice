/** 归一化词条：小写、去首尾空白、压缩内部空白 */
export function normalizeTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 由归一化词条生成稳定 id（FNV-1a 32 位哈希，十六进制） */
export function stableItemId(normalizedTerm: string): string {
  const s = normalizeTerm(normalizedTerm);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "it-" + (h >>> 0).toString(16).padStart(8, "0");
}
