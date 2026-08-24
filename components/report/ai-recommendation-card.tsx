"use client";
/**
 * AI Task Card — 今日 AI 任务
 * -------------------------------------------------------
 * 不只是 CTA，而是一个 Agent 调度的任务卡：
 * - 任务名称
 * - 推荐原因
 * - 预计耗时
 * - 开始入口
 */
import Link from "next/link";
import type { SpeakingAbilityProfile } from "@/lib/ability/profile-builder";

interface Props {
  profile: SpeakingAbilityProfile;
}

const DIMENSION_LABELS: Record<string, string> = {
  fluency: "流利度",
  lexicalResource: "词汇表达",
  grammaticalRange: "语法复杂度",
  pronunciation: "发音",
};

interface TaskRecommendation {
  title: string;
  reason: string;
  duration: string;
  href: string;
  cta: string;
  priority: "high" | "medium";
}

function buildTask(profile: SpeakingAbilityProfile): TaskRecommendation {
  const { nextFocus, overallTrend, totalSessions } = profile;

  if (!nextFocus || totalSessions < 2) {
    return {
      title: "完成一次口语训练",
      reason: "AI 需要更多数据来分析你的能力模式。完成 2 次以上训练后，个性化建议会更精准。",
      duration: "5-8 分钟",
      href: "/speaking",
      cta: "开始训练",
      priority: "medium",
    };
  }

  const dimLabel = DIMENSION_LABELS[nextFocus.dimension] ?? "口语能力";

  if (overallTrend === "declining") {
    return {
      title: "回归基础：Part 1 短回答",
      reason: "最近表现有波动。建议用 Part 1 简单题找回节奏，重建信心后再挑战长回答。",
      duration: "3-5 分钟",
      href: "/speaking",
      cta: "从 Part 1 开始",
      priority: "high",
    };
  }

  if (overallTrend === "improving") {
    return {
      title: `挑战 Part 2：练习${dimLabel}`,
      reason: `你最近进步明显。现在适合用 Part 2 长回答进一步提升「${dimLabel}」——让优势更稳固。`,
      duration: "8-10 分钟",
      href: "/speaking",
      cta: "接受挑战",
      priority: "medium",
    };
  }

  // stable
  if (nextFocus.focusIssue) {
    return {
      title: `专项突破：${nextFocus.focusIssue}`,
      reason: `「${nextFocus.focusIssue}」已反复出现，是你当前最值得解决的具体问题。集中练习 1-2 次就能有明显改善。`,
      duration: "5-8 分钟",
      href: "/speaking",
      cta: "开始专项训练",
      priority: "high",
    };
  }

  return {
    title: `提升${dimLabel}`,
    reason: `这是你当前最大的提升空间。每次练习后注意 AI 对该维度的反馈，刻意改善。`,
    duration: "5-8 分钟",
    href: "/speaking",
    cta: "开始训练",
    priority: "medium",
  };
}

export function AiRecommendationCard({ profile }: Props) {
  const task = buildTask(profile);

  return (
    <div className="rounded-xl border border-accent/12 bg-gradient-to-br from-accent/4 via-white to-white p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-ink">今日 AI 任务</h3>
        </div>
        {task.priority === "high" && (
          <span className="inline-flex items-center rounded-full bg-accent/8 px-2 py-0.5 text-xs font-medium text-accent">
            推荐优先
          </span>
        )}
      </div>

      {/* Task content */}
      <div className="space-y-2">
        <h4 className="text-base font-medium text-ink">{task.title}</h4>
        <p className="text-sm text-ink-soft leading-relaxed">{task.reason}</p>
      </div>

      {/* Meta + CTA */}
      <div className="flex items-center justify-between pt-1">
        <span className="flex items-center gap-1.5 text-xs text-ink-meta">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          预计 {task.duration}
        </span>
        <Link
          href={task.href}
          className="inline-flex rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90"
        >
          {task.cta} →
        </Link>
      </div>
    </div>
  );
}
