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

import { ReportLede } from "./report-lede";
import { LexiconSection } from "./lexicon-section";
import { CompareSection } from "./compare-section";
import { TwoHands } from "./two-hands";
import { MilestoneLine } from "./milestone-line";
import { NextStep } from "./next-step";
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

  useEffect(() => {
    const r = generateClientReport();
    setReport(r);
    buildLexicon().then(setLexicon);
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
    <div className="space-y-14">
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
      <MilestoneLine milestone={milestone} />
      <NextStep nextStep={report.nextStep} />
    </div>
  );
}
