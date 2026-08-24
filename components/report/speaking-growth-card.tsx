"use client";
/**
 * Speaking Growth Card — 口语能力画像（用户化语言）
 * -------------------------------------------------------
 * 避免技术字段（dimension/level/trend）
 * 使用自然中文表达用户可理解的能力描述
 */
import type { SpeakingAbilityProfile, DimensionTrend } from "@/lib/ability/profile-builder";

interface Props {
  profile: SpeakingAbilityProfile;
}

const DIMENSION_UI: Record<string, { name: string; desc: string }> = {
  fluency: { name: "流利度", desc: "表达是否连贯自然" },
  lexicalResource: { name: "词汇表达", desc: "用词是否丰富准确" },
  grammaticalRange: { name: "语法复杂度", desc: "句式是否多样" },
};

const LEVEL_UI: Record<string, { label: string; color: string; bar: string; pct: number }> = {
  strong:     { label: "表现优秀", color: "text-green-700", bar: "bg-green-500", pct: 95 },
  adequate:   { label: "基本达标", color: "text-blue-700",  bar: "bg-blue-500",  pct: 70 },
  developing: { label: "持续成长中", color: "text-amber-700", bar: "bg-amber-500", pct: 45 },
  weak:       { label: "需要加强", color: "text-red-700",   bar: "bg-red-400",   pct: 20 },
};

const TREND_UI: Record<string, { icon: string; text: string; color: string }> = {
  improving: { icon: "↑", text: "在进步", color: "text-green-600" },
  stable:    { icon: "→", text: "保持稳定", color: "text-ink-meta" },
  declining: { icon: "↓", text: "需关注", color: "text-red-600" },
};

function DimensionRow({ dimensionKey, trend }: { dimensionKey: string; trend: DimensionTrend | null }) {
  if (!trend) return null;

  const ui = DIMENSION_UI[dimensionKey] ?? { name: dimensionKey, desc: "" };
  const level = LEVEL_UI[trend.currentLevel] ?? LEVEL_UI.developing!;
  const trendInfo = TREND_UI[trend.trend] ?? TREND_UI.stable!;

  return (
    <div className="space-y-2 py-3 border-b border-ink/5 last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{ui.name}</p>
          <p className="text-xs text-ink-meta">{ui.desc}</p>
        </div>
        <div className="text-right">
          <p className={`text-xs font-semibold ${level.color}`}>{level.label}</p>
          <p className={`text-xs ${trendInfo.color}`}>{trendInfo.icon} {trendInfo.text}</p>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-ink/5">
        <div
          className={`h-full rounded-full transition-all duration-700 ${level.bar}`}
          style={{ width: `${level.pct}%` }}
        />
      </div>
    </div>
  );
}

export function SpeakingGrowthCard({ profile }: Props) {
  const { dimensions, totalSessions } = profile;

  return (
    <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-medium text-ink">口语能力</h3>
          <p className="text-xs text-ink-meta">基于 {totalSessions} 次训练评估</p>
        </div>
      </div>

      {/* Dimensions */}
      <div>
        <DimensionRow dimensionKey="fluency" trend={dimensions.fluency} />
        <DimensionRow dimensionKey="lexicalResource" trend={dimensions.lexicalResource} />
        <DimensionRow dimensionKey="grammaticalRange" trend={dimensions.grammaticalRange} />
      </div>

      {/* Pronunciation placeholder */}
      <div className="flex items-center gap-2 py-2 opacity-50">
        <span className="text-xs text-ink-meta">发音评估</span>
        <span className="text-xs text-ink-meta/60">— 即将支持</span>
      </div>
    </div>
  );
}
