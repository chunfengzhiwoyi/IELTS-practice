"use client";

import type { SuggestedExpression } from "@/lib/speaking/types";

/**
 * PRODUCT-LOOP-02C — 建议表达提示（V1, OPTIONAL）
 * ------------------------------------------------------------
 * 轻量提示区域：不抢占题目主体，不把 Speaking 变成造句练习。
 * 空数组时返回 null（UI 完全保持现有 Speaking 体验）。
 * 文案明确「自然表达优先，不用也没关系」——无强制、无隐藏测试、不用不扣分。
 */
export function SuggestedExpressions({ expressions }: { expressions: SuggestedExpression[] }) {
  if (expressions.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3"
      role="complementary"
      aria-label="本话题可尝试的表达"
    >
      <p className="text-xs font-medium text-accent">本话题可以试试</p>
      <ul className="mt-1 space-y-1">
        {expressions.map((expr) => (
          <li key={expr.itemId} className="text-sm text-ink">
            <span className="font-medium">{expr.canonicalForm}</span>
            {expr.meaning ? <span className="text-ink-soft">（{expr.meaning}）</span> : null}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-ink-soft">自然表达优先，不用也没关系。</p>
    </div>
  );
}
