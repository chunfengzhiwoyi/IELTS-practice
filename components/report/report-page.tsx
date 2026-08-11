"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { generateClientReport, type ClientReport } from "@/lib/client/demo-service";
import { getItem } from "@/lib/client/storage";
import type { UserItemState } from "@/lib/learning/types";
import type { SpeakingSession } from "@/lib/speaking/types";

export function ReportPage() {
  const [report, setReport] = useState<ClientReport | null>(null);
  const [attentionItems, setAttentionItems] = useState<Array<{ term: string; reason: string }>>([]);
  const [speakingInsight, setSpeakingInsight] = useState<{ text: string; isPattern: boolean } | null>(null);

  useEffect(() => {
    const r = generateClientReport();
    setReport(r);
    buildAttentionItems();
    buildSpeakingInsight();
  }, []);

  const buildAttentionItems = () => {
    const states = getItem<Record<string, UserItemState>>("states") ?? {};
    const items: Array<{ term: string; reason: string; priority: number }> = [];

    for (const s of Object.values(states)) {
      // 需要关注：status=EXPOSED 或连续正确为 0
      if (s.status === "EXPOSED") {
        items.push({ term: s.itemId.replace("seed-", ""), reason: "上次回忆不成功，需要加强", priority: 0 });
      } else if (s.status === "RECALLED_WITH_HELP") {
        items.push({ term: s.itemId.replace("seed-", ""), reason: "目前还需要提示辅助回忆", priority: 1 });
      }
    }

    // 尝试用真实 term（从 localStorage 的 seed 数据）
    // 这里简化：优先用 itemId 对应 seed 的 term
    items.sort((a, b) => a.priority - b.priority);
    setAttentionItems(items.slice(0, 5).map((i) => ({ term: i.term, reason: i.reason })));
  };

  const buildSpeakingInsight = () => {
    const sessions = getItem<SpeakingSession[]>("speaking_sessions") ?? [];
    if (sessions.length === 0) { setSpeakingInsight(null); return; }

    const dimCount: Record<string, number> = {};
    for (const s of sessions) {
      const dim = s.firstAnalysis?.mainIssue?.dimension;
      if (dim) dimCount[dim] = (dimCount[dim] ?? 0) + 1;
    }
    const top = Object.entries(dimCount).sort((a, b) => b[1] - a[1])[0];
    if (!top) { setSpeakingInsight(null); return; }

    const dimLabels: Record<string, string> = {
      fluency: "回答长度不足", vocabulary: "词汇重复", coherence: "缺少过渡衔接",
      development: "内容展开不够", argumentation: "论证逻辑",
    };
    const label = dimLabels[top[0]] ?? top[0];
    const isPattern = top[1] >= 2;
    const text = isPattern
      ? `「${label}」反复出现（${top[1]} 次），建议重点练习`
      : `最近一次观察到「${label}」`;
    setSpeakingInsight({ text, isPattern });
  };

  if (!report) return <div className="py-8 text-center font-ui text-sm text-ink-meta">生成中…</div>;

  const hasData = report.totalItems > 0 || report.speakingCount > 0;

  if (!hasData) {
    return (
      <div className="py-16 text-center">
        <h2 className="font-display text-lg text-ink">暂无学习记录</h2>
        <p className="mt-2 text-ink-meta">开始学习新表达后，报告会自动生成。</p>
        <Link href="/learn" className="btn btn--primary mt-6">学习一个新表达</Link>
      </div>
    );
  }

  // 复习评估
  const reviewAssessment = (): string => {
    if (report.reviewTotal === 0) return "还没有复习记录";
    if (report.reviewTotal < 5) return "数据还比较少，继续复习会更准确";
    if (report.correctRate >= 0.8) return "目前比较稳定，大部分内容可以独立回忆";
    if (report.correctRate >= 0.5) return "还有一些内容需要巩固";
    return "不少内容还需要加强复习";
  };

  // 推荐
  const recommendations = buildRecommendations(report, attentionItems.length, speakingInsight);

  return (
    <div className="space-y-8">
      {/* 概览 */}
      <section>
        <h3 className="section-label">概览</h3>
        <div className="progress-band">
          <OverviewStat label="已学习表达" value={report.totalItems} />
          <OverviewStat label="待复习" value={report.dueSoon} />
          <OverviewStat label="口语练习" value={report.speakingCount} />
        </div>
      </section>

      {/* 词汇与记忆 */}
      <section>
        <h3 className="section-label">词汇与记忆</h3>
        <div className="note">
          <MemoryBreakdown
            independent={report.correctIndependent}
            withHint={report.correctWithHint}
            incorrect={report.incorrect}
          />
          {attentionItems.length > 0 && (
            <div className="mt-5 space-y-2">
              <p className="font-ui text-xs font-medium text-ink-meta">需要关注的表达：</p>
              {attentionItems.map((item, i) => (
                <div key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-ink">{item.term}</span>
                  <span className="text-ink-meta">— {item.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 复习情况 */}
      <section>
        <h3 className="section-label">复习情况</h3>
        <div className="note">
          <p className="text-ink-soft">{reviewAssessment()}</p>
          {report.reviewTotal > 0 && (
            <p className="mt-1 font-ui text-xs text-ink-meta">
              共复习 {report.reviewTotal} 次，本周复习正确率 {Math.round(report.correctRate * 100)}%
            </p>
          )}
        </div>
      </section>

      {/* 口语表现 */}
      {report.speakingCount > 0 && (
        <section>
          <h3 className="section-label">口语表现</h3>
          <div className="note">
            <p className="text-ink-soft">完成 {report.speakingCount} 次口语练习</p>
            {speakingInsight && (
              <p className={`mt-2 text-sm ${speakingInsight.isPattern ? "font-medium text-warn" : "text-ink-meta"}`}>
                {speakingInsight.text}
              </p>
            )}
          </div>
        </section>
      )}

      {/* 推荐 */}
      <section>
        <h3 className="section-label">接下来最值得做</h3>
        <div className="space-y-3">
          {recommendations.map((rec, i) => (
            <div key={i} className="note note--accent">
              <p className="font-display text-base text-ink">{rec.title}</p>
              <p className="mt-1 text-ink-soft">{rec.reason}</p>
              <Link href={rec.link} className="btn--quiet mt-2">{rec.buttonText}</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// --- Helpers ---

function OverviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat__num">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

function MemoryBreakdown({
  independent,
  withHint,
  incorrect,
}: {
  independent: number;
  withHint: number;
  incorrect: number;
}) {
  const total = independent + withHint + incorrect;
  if (total === 0) {
    return <p className="text-sm text-ink-meta">还没有记忆记录，学过的词条会出现在这里。</p>;
  }
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div>
      <div
        className="memory-bar"
        role="img"
        aria-label={`记忆分布：独立回忆 ${independent}，需要提示 ${withHint}，还需巩固 ${incorrect}`}
      >
        <i className="seg-pos" style={{ width: pct(independent) }} />
        <i className="seg-warn" style={{ width: pct(withHint) }} />
        <i className="seg-neg" style={{ width: pct(incorrect) }} />
      </div>
      <div className="memory-legend">
        <span><i className="dot dot--pos" />可独立回忆 <b>{independent}</b></span>
        <span><i className="dot dot--warn" />需要提示 <b>{withHint}</b></span>
        <span><i className="dot dot--neg" />还需巩固 <b>{incorrect}</b></span>
      </div>
    </div>
  );
}

interface Recommendation {
  title: string;
  reason: string;
  link: string;
  buttonText: string;
}

function buildRecommendations(
  report: ClientReport,
  attentionCount: number,
  speakingInsight: { text: string; isPattern: boolean } | null,
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (report.dueSoon > 0) {
    recs.push({
      title: "开始今日复习",
      reason: `有 ${report.dueSoon} 个表达等待复习`,
      link: "/review",
      buttonText: "去复习",
    });
  }

  if (speakingInsight?.isPattern) {
    recs.push({
      title: "练一次口语",
      reason: speakingInsight.text,
      link: "/speaking",
      buttonText: "去练习",
    });
  }

  if (attentionCount > 0 && recs.length < 3) {
    recs.push({
      title: "巩固薄弱词条",
      reason: `有 ${attentionCount} 个表达需要更多练习`,
      link: "/review",
      buttonText: "去巩固",
    });
  }

  if (recs.length < 3) {
    recs.push({
      title: "学习一个新表达",
      reason: "扩展词汇量，保持学习节奏",
      link: "/learn",
      buttonText: "去学习",
    });
  }

  return recs.slice(0, 3);
}
