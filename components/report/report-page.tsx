"use client";

import { useEffect, useState } from "react";

import {
  buildClientReportFromRaw,
  buildLexiconFromData,
  type ClientReport,
  type LexiconEntry,
} from "@/lib/client/report-transform";
import { buildLede, detectMilestone, type Milestone } from "@/lib/client/report-narrative";
import { localDayKey } from "@/lib/client/day";
import { buildSpeakingAbilityProfileFromObservations, type SpeakingAbilityProfile } from "@/lib/ability/profile-builder";
import type { SpeakingEvaluation } from "@/lib/evaluation/types";
import type { AbilityObservation } from "@/lib/ability/types";

import { ReportLede } from "./report-lede";
import { LexiconSection } from "./lexicon-section";
import { CompareSection } from "./compare-section";
import { TwoHands } from "./two-hands";
import { MilestoneLine } from "./milestone-line";
import { NextStep } from "./next-step";
import { SpeakingGrowthCard } from "./speaking-growth-card";
import { AbilitySummaryCard } from "./ability-summary-card";
import { AiRecommendationCard } from "./ai-recommendation-card";
import { GoalOverview } from "@/components/goals/goal-overview";

/**
 * M1: Single Source of Truth
 * 报告数据全部来自服务端 /api/report。
 * 客户端只做纯展示转换，不维护另一套业务事实。
 */

interface ServerReportResponse {
  period: string;
  generatedAt: string;
  memory: { totalItems: number; newItems: number; reviewedCount: number; dueSoon: number; statusDistribution: Record<string, number> };
  review: { totalReviews: number; correctIndependent: number; correctWithHint: number; incorrect: number; skipped: number; correctRate: number };
  speakingObservations: Array<{ dimension: string; count: number; isPattern: boolean }>;
  recommendations: Array<{ taskType: string; reason: string; priority: string }>;
  insufficientData: boolean;
  llmSummary: { overallAssessment: string; keyInsight: string; actionableSuggestion: string; encouragement: string } | null;
  abilityObservations: AbilityObservation[];
  evaluations: SpeakingEvaluation[];
  _raw: {
    states: Array<{ userId: string; itemId: string; status: string; recallLevel: number; nextReviewAt: string; updatedAt: string }>;
    events: Array<{ userId: string; itemId: string; eventType: string; correctness: string; createdAt: string }>;
    sessions: Array<{ id: string; userId: string; part: string; status: string; firstAnalysis: unknown; secondAnalysis: unknown; createdAt: string }>;
    itemContents: Record<string, { term: string; coreMeaning: string }>;
  };
}

function computeGapDays(report: ClientReport): number {
  const cells = report.weeklyActivity;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (c && c.hasActivity) {
      return i === cells.length - 1 ? 0 : cells.length - 1 - i;
    }
  }
  return cells.length;
}

function rangeLabel(): string {
  const fmt = (d: Date) => {
    const [, m, day] = localDayKey(d).split("-");
    return `${parseInt(m!, 10)}/${parseInt(day!, 10)}`;
  };
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return `${fmt(start)} — ${fmt(end)}`;
}

export function ReportPage() {
  const [report, setReport] = useState<ClientReport | null>(null);
  const [lexicon, setLexicon] = useState<{ recent: LexiconEntry[]; attention: LexiconEntry[] } | null>(null);
  const [speakingProfile, setSpeakingProfile] = useState<SpeakingAbilityProfile | null>(null);
  const [evaluations, setEvaluations] = useState<SpeakingEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/report");
        const json = (await res.json()) as ServerReportResponse;
        if (!res.ok) {
          if (!cancelled) setError(json?.recommendations?.[0]?.reason ?? "加载失败");
          return;
        }
        if (cancelled) return;

        // M1: 从服务端原始数据构建客户端展示格式（纯转换）
        const clientReport = buildClientReportFromRaw({
          states: json._raw.states as never,
          events: json._raw.events as never,
          sessions: json._raw.sessions as never,
        });
        setReport(clientReport);

        const lex = buildLexiconFromData(
          json._raw.states as never,
          json._raw.events as never,
          json._raw.itemContents,
        );
        setLexicon(lex);

        // M1: 从服务端 observations 构建能力画像
        // LEARNING-REPORT-ONLINEIZATION-01: 不再使用 demo 身份；userId 取服务端真实数据。
        const realUserId = json._raw.states[0]?.userId ?? "";
        const profile = buildSpeakingAbilityProfileFromObservations(realUserId, json.abilityObservations);
        setSpeakingProfile(profile);
        setEvaluations(json.evaluations);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="report-skeleton" role="status" aria-live="polite" aria-label="正在生成学习手记">
        <div className="skeleton skeleton--bar" />
        <div className="skeleton skeleton--block" />
        <div className="skeleton skeleton--bar" style={{ width: "82%" }} />
        <div className="skeleton skeleton--bar" style={{ width: "64%" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <h2 className="font-display text-lg text-ink">报告加载失败</h2>
        <p className="mt-2 text-ink-meta">{error}</p>
        <button onClick={() => window.location.reload()} className="btn btn--primary mt-6">重试</button>
      </div>
    );
  }

  if (!report) return null;

  const hasData = report.totalItems > 0 || report.speakingCount > 0;
  if (!hasData) {
    return (
      <div className="py-16 text-center">
        <h2 className="font-display text-lg text-ink">暂无学习记录</h2>
        <p className="mt-2 text-ink-meta">开始学习新表达后，报告会自动生成。</p>
        <p className="mt-6 text-sm text-ink-meta">学习功能入口未在当前部署开放（当前仅数据看板与学习报告）。</p>
      </div>
    );
  }

  const ledeParts = buildLede({
    gapDays: computeGapDays(report),
    newThisWeek: report.newThisWeek,
    newLastWeek: report.newLastWeek,
    totalItems: report.totalItems,
    speakingCompleted: report.speaking.completedCount,
    accThis: report.thisWeek.reviewAccuracy,
    accLast: report.lastWeek.reviewAccuracy,
    topIssueCount: report.speaking.topIssue?.count ?? 0,
    topIssueLabel: report.speaking.topIssue?.label ?? "",
  });

  const milestone: Milestone | null = detectMilestone({
    totalItems: report.totalItems,
    reviewTotal: report.reviewTotal,
    streak: report.streak,
    partsCovered: report.speaking.partsCovered,
    hasRecentActivity:
      report.thisWeek.newItems > 0 ||
      report.thisWeek.reviews > 0 ||
      report.thisWeek.speakingCompleted > 0,
  });

  const hasSpeakingData = speakingProfile && speakingProfile.hasEnoughData;

  return (
    <div className="space-y-10">
      {/* Section 1: 本周学习总结 */}
      <section className="space-y-5">
        <GoalOverview />
        <ReportLede
          parts={ledeParts}
          marginalia={{
            range: rangeLabel(),
            newItems: report.thisWeek.newItems,
            reviews: report.thisWeek.reviews,
            activeDays: report.thisWeek.activeDays,
          }}
        />
        <div className="flex items-center gap-4 rounded-lg bg-surface-raised px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            <span className="text-xs text-ink-meta">活跃 {report.thisWeek.activeDays}/7 天</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-xs text-ink-meta">连续 {report.streak} 天</span>
          </div>
          {report.thisWeek.newItems > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-xs text-ink-meta">新学 {report.thisWeek.newItems} 个表达</span>
            </div>
          )}
        </div>
        <MilestoneLine milestone={milestone} />
      </section>

      {/* Section 2: 能力画像 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-ink-meta uppercase tracking-wide">能力画像</h2>
          <div className="flex-1 h-px bg-ink/5" />
        </div>

        {/* 词汇能力 */}
        <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-ink">词汇能力</h3>
                <p className="text-xs text-ink-meta">{report.totalItems} 个表达</p>
              </div>
            </div>
            {report.thisWeek.reviewAccuracy != null && (
              <span className="text-xs font-mono text-ink-meta tabular-nums">
                正确率 {Math.round(report.thisWeek.reviewAccuracy)}%
              </span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-ink/5">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${Math.min(100, (report.totalItems / 100) * 100)}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-ink-meta">
            <span>本周复习 {report.thisWeek.reviews} 次</span>
            <span>待复习 {report.dueSoon}</span>
          </div>
        </div>

        {/* 口语能力 */}
        {hasSpeakingData ? (
          <SpeakingGrowthCard profile={speakingProfile} />
        ) : (
          <div className="rounded-xl border border-dashed border-ink/10 bg-surface-raised p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/5">
                <svg className="h-4 w-4 text-ink-meta" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-ink-soft">口语能力</h3>
                <p className="text-xs text-ink-meta">已完成 {speakingProfile?.totalSessions ?? 0}/2 次训练</p>
              </div>
            </div>
            <p className="text-xs text-ink-meta leading-relaxed">完成 2 次口语训练后，AI 将展示流利度、词汇表达、语法复杂度三维评估。</p>
          </div>
        )}
      </section>

      {/* Section 3: AI 诊断 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-ink-meta uppercase tracking-wide">AI 诊断</h2>
          <div className="flex-1 h-px bg-ink/5" />
        </div>

        {hasSpeakingData ? (
          <AbilitySummaryCard profile={speakingProfile} evaluations={evaluations} />
        ) : (
          <div className="rounded-xl border border-dashed border-ink/10 bg-surface-raised p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/8">
                <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-ink">AI 正在建立你的学习画像</h3>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed">完成更多训练后，AI 将识别：</p>
            <ul className="space-y-1.5 text-xs text-ink-soft">
              <li className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 text-accent/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                高频错误模式
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 text-accent/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                薄弱能力维度
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 text-accent/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                反馈是否有效
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 text-accent/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                下一阶段训练重点
              </li>
            </ul>
            <div className="flex items-center gap-2 rounded-lg bg-white border border-ink/5 px-3 py-2">
              <div className="h-1.5 flex-1 rounded-full bg-ink/5">
                <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.min(100, ((speakingProfile?.totalSessions ?? 0) / 2) * 100)}%` }} />
              </div>
              <span className="text-xs font-mono text-ink-meta tabular-nums whitespace-nowrap">{speakingProfile?.totalSessions ?? 0}/2 次训练</span>
            </div>
          </div>
        )}
      </section>

      {/* Section 4: 下一步行动 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-ink-meta uppercase tracking-wide">下一步行动</h2>
          <div className="flex-1 h-px bg-ink/5" />
        </div>
        {hasSpeakingData ? (
          <AiRecommendationCard profile={speakingProfile} />
        ) : (
          <NextStep nextStep={report.nextStep} />
        )}
      </section>

      {/* Section 5: 学习记录 */}
      <section className="space-y-8">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-ink-meta uppercase tracking-wide">学习记录</h2>
          <div className="flex-1 h-px bg-ink/5" />
        </div>
        <LexiconSection totalItems={report.totalItems} recent={lexicon?.recent ?? []} attention={lexicon?.attention ?? []} />
        <CompareSection thisWeek={report.thisWeek} lastWeek={report.lastWeek} weeklyActivity={report.weeklyActivity} />
        <TwoHands report={report} />
      </section>
    </div>
  );
}
