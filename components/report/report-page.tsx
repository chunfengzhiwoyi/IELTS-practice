"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  generateClientReport,
  buildLexicon,
  type ClientReport,
  type LexiconEntry,
} from "@/lib/client/demo-service";
import { buildLede, detectMilestone, type Milestone } from "@/lib/client/report-narrative";
import { localDayKey } from "@/lib/client/day";
import { buildSpeakingAbilityProfile, type SpeakingAbilityProfile } from "@/lib/ability/profile-builder";
import { getEvaluationRepository } from "@/lib/evaluation/repository";
import type { SpeakingEvaluation } from "@/lib/evaluation/types";

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

/** 距上次学习活动隔了几天（今天有活动则 0；整周无活动则 7）。 */
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

/** 本期区间文本，如「8/5 — 8/11」。 */
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
  const [lexicon, setLexicon] = useState<{ recent: LexiconEntry[]; attention: LexiconEntry[] } | null>(
    null,
  );
  const [speakingProfile, setSpeakingProfile] = useState<SpeakingAbilityProfile | null>(null);
  const [evaluations, setEvaluations] = useState<SpeakingEvaluation[]>([]);

  useEffect(() => {
    const r = generateClientReport();
    setReport(r);
    buildLexicon().then(setLexicon);

    // Phase 7: Speaking Ability Profile + Evaluations
    try {
      const profile = buildSpeakingAbilityProfile("demo");
      setSpeakingProfile(profile);
      const evals = getEvaluationRepository().getAll("demo");
      setEvaluations(evals);
    } catch {
      // Ability data not available yet — ok
    }
  }, []);

  if (!report) {
    return (
      <div className="report-skeleton" role="status" aria-live="polite" aria-label="正在生成学习手记">
        <div className="skeleton skeleton--bar" />
        <div className="skeleton skeleton--block" />
        <div className="skeleton skeleton--bar" style={{ width: "82%" }} />
        <div className="skeleton skeleton--bar" style={{ width: "64%" }} />
      </div>
    );
  }

  const hasData = report.totalItems > 0 || report.speakingCount > 0;
  if (!hasData) {
    return (
      <div className="py-16 text-center">
        <h2 className="font-display text-lg text-ink">暂无学习记录</h2>
        <p className="mt-2 text-ink-meta">开始学习新表达后，报告会自动生成。</p>
        <Link href="/learn" className="btn btn--primary mt-6">
          学习一个新表达
        </Link>
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

  return (
    <div className="space-y-10">
      {/* ═══════════════════════════════════════════════════════
          Section 1: AI Learning Summary
          回答：我现在怎么样？
          ═══════════════════════════════════════════════════════ */}
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
        <MilestoneLine milestone={milestone} />
      </section>

      {/* ═══════════════════════════════════════════════════════
          Section 2: Ability Profile
          统一展示：Vocabulary + Speaking + Learning Habit
          ═══════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-ink-meta uppercase tracking-wide">Ability Profile</h2>
          <div className="flex-1 h-px bg-ink/5" />
        </div>

        {/* Vocabulary 能力（基于复习数据） */}
        <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-ink">Vocabulary</h3>
                <p className="text-xs text-ink-meta">{report.totalItems} 个表达</p>
              </div>
            </div>
            {report.thisWeek.reviewAccuracy != null && (
              <span className="text-xs font-mono text-ink-meta tabular-nums">
                正确率 {Math.round(report.thisWeek.reviewAccuracy * 100)}%
              </span>
            )}
          </div>
          <div className="h-1.5 w-full rounded-full bg-ink/5">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-700"
              style={{ width: `${Math.min(100, (report.totalItems / 100) * 100)}%` }}
            />
          </div>
          <div className="flex gap-4 text-xs text-ink-meta">
            <span>本周新学 {report.thisWeek.newItems}</span>
            <span>复习 {report.thisWeek.reviews} 次</span>
            <span>待复习 {report.dueSoon}</span>
          </div>
        </div>

        {/* Speaking 能力（使用 SpeakingGrowthCard） */}
        {speakingProfile && speakingProfile.hasEnoughData && (
          <SpeakingGrowthCard profile={speakingProfile} />
        )}

        {/* Learning Habit 学习稳定度 */}
        <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-50">
                <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-ink">Learning Habit</h3>
                <p className="text-xs text-ink-meta">连续 {report.streak} 天</p>
              </div>
            </div>
            <span className="text-xs font-mono text-ink-meta tabular-nums">
              活跃 {report.thisWeek.activeDays}/7 天
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-ink/5">
            <div
              className="h-full rounded-full bg-purple-500 transition-all duration-700"
              style={{ width: `${Math.min(100, (report.thisWeek.activeDays / 7) * 100)}%` }}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          Section 3: AI Insights
          回答：我哪里需要提升？
          ═══════════════════════════════════════════════════════ */}
      {speakingProfile && speakingProfile.hasEnoughData && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-ink-meta uppercase tracking-wide">AI Insights</h2>
            <div className="flex-1 h-px bg-ink/5" />
          </div>
          <AbilitySummaryCard profile={speakingProfile} evaluations={evaluations} />
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          Section 4: Next Action
          回答：下一步做什么？
          ═══════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-ink-meta uppercase tracking-wide">Next Action</h2>
          <div className="flex-1 h-px bg-ink/5" />
        </div>
        {speakingProfile && speakingProfile.hasEnoughData ? (
          <AiRecommendationCard profile={speakingProfile} />
        ) : (
          <NextStep nextStep={report.nextStep} />
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════
          Section 5: Detailed Records
          详细学习记录（保留原有模块）
          ═══════════════════════════════════════════════════════ */}
      <section className="space-y-8">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-ink-meta uppercase tracking-wide">Detailed Records</h2>
          <div className="flex-1 h-px bg-ink/5" />
        </div>
        <LexiconSection
          totalItems={report.totalItems}
          recent={lexicon?.recent ?? []}
          attention={lexicon?.attention ?? []}
        />
        <CompareSection
          thisWeek={report.thisWeek}
          lastWeek={report.lastWeek}
          weeklyActivity={report.weeklyActivity}
        />
        <TwoHands report={report} />
      </section>
    </div>
  );
}
