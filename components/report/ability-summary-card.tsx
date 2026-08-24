"use client";
/**
 * AI Insights Card — AI 发现 + 依据 + 建议
 * -------------------------------------------------------
 * 强化展示：基于多少次记录、发现了什么、进步证据、下一阶段目标
 */
import type { SpeakingAbilityProfile } from "@/lib/ability/profile-builder";
import type { SpeakingEvaluation } from "@/lib/evaluation/types";

interface Props {
  profile: SpeakingAbilityProfile;
  evaluations: SpeakingEvaluation[];
}

const DIMENSION_LABELS: Record<string, string> = {
  fluency: "流利度",
  lexicalResource: "词汇表达",
  grammaticalRange: "语法复杂度",
  pronunciation: "发音",
};

export function AbilitySummaryCard({ profile, evaluations }: Props) {
  const adoptedEvals = evaluations.filter((e) => e.feedbackAdopted);
  const effectiveCount = adoptedEvals.filter((e) => e.feedbackEffectiveness === "effective").length;
  const adoptionRate = evaluations.length > 0 ? adoptedEvals.length / evaluations.length : 0;
  const effectiveRate = adoptedEvals.length > 0 ? effectiveCount / adoptedEvals.length : 0;
  const avgResolution = adoptedEvals.length > 0
    ? adoptedEvals.reduce((s, e) => s + e.issueResolutionRate, 0) / adoptedEvals.length
    : 0;

  return (
    <div className="space-y-4">
      {/* ─── AI 发现 ─── */}
      {profile.nextFocus && (
        <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-xs">🎯</span>
            <h3 className="text-sm font-medium text-ink">AI 发现</h3>
          </div>

          {/* 发现内容 */}
          <div className="rounded-lg bg-surface-raised p-3.5 space-y-2.5">
            <p className="text-sm text-ink leading-relaxed">
              你的<span className="font-medium text-accent">{DIMENSION_LABELS[profile.nextFocus.dimension] ?? profile.nextFocus.dimension}</span>是当前最大瓶颈。
            </p>

            {/* 依据 */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-ink-meta">依据</p>
              <p className="text-xs text-ink-soft leading-relaxed">
                最近 {profile.totalSessions} 次口语训练中，
                {profile.recurringIssues.length > 0
                  ? `「${profile.recurringIssues[0]!.description}」反复出现 ${profile.recurringIssues[0]!.occurrenceCount} 次。`
                  : "该维度评估持续偏低。"}
              </p>
            </div>

            {/* 建议 */}
            <div className="space-y-1 border-t border-ink/5 pt-2">
              <p className="text-xs font-medium text-ink-meta">下一阶段目标</p>
              <p className="text-xs text-accent font-medium leading-relaxed">
                {profile.nextFocus.focusIssue
                  ? `解决「${profile.nextFocus.focusIssue}」问题`
                  : `提升${DIMENSION_LABELS[profile.nextFocus.dimension] ?? "该维度"}至基本达标`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── 反复出现的问题 ─── */}
      {profile.recurringIssues.length > 1 && (
        <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-medium text-ink">AI 观察到的模式</h3>
          <p className="text-xs text-ink-meta">以下问题多次出现，建议重点关注</p>
          <ul className="space-y-2">
            {profile.recurringIssues.slice(0, 3).map((issue, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/8 text-xs font-bold text-accent mt-0.5">
                  {issue.occurrenceCount}×
                </span>
                <div>
                  <p className="text-sm text-ink">{issue.description}</p>
                  <p className="text-xs text-ink-meta">{DIMENSION_LABELS[issue.dimension] ?? issue.dimension}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── AI 反馈效果 ─── */}
      {evaluations.length >= 2 && (
        <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">AI 反馈有效吗？</h3>
            <span className="text-xs text-ink-meta">最近 {evaluations.length} 次</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCell label="采纳反馈" value={`${Math.round(adoptionRate * 100)}%`} sub="完成重答" />
            <StatCell label="有效改善" value={`${Math.round(effectiveRate * 100)}%`} sub="表现提升" />
            <StatCell label="问题解决" value={`${Math.round(avgResolution * 100)}%`} sub="不再出现" />
          </div>
          {effectiveRate >= 0.5 && (
            <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
              AI 的反馈对你有效——继续保持「反馈 → 重答」的节奏
            </p>
          )}
          {effectiveRate < 0.3 && adoptedEvals.length >= 3 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
              反馈转化率偏低——建议降低难度，先从 Part 1 短回答开始
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="text-center rounded-lg bg-surface-raised py-3 px-2">
      <p className="text-lg font-semibold text-accent tabular-nums">{value}</p>
      <p className="text-xs font-medium text-ink mt-0.5">{label}</p>
      <p className="text-xs text-ink-meta">{sub}</p>
    </div>
  );
}
