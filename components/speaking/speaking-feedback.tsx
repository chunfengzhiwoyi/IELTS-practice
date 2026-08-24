"use client";
/**
 * AI IELTS Speaking Diagnostic Report
 * -------------------------------------------------------
 * 完整诊断报告展示：
 * - Overall Diagnosis
 * - IELTS 四维能力卡片（含进度条）
 * - 你的最大提升机会（Priority Issue）
 * - Priority Actions
 * - 操作按钮
 *
 * Props 不变
 */
import type { SpeakingAnalysisResult, SpeakingPart, DimensionAnalysis } from "@/lib/speaking/types";

interface Props {
  analysis: SpeakingAnalysisResult;
  isSecondAnswer: boolean;
  onViewDrill?: () => void;
  onTryAgain?: () => void;
  onFinish: () => void;
  nextPart?: SpeakingPart;
  onContinuePart?: () => void;
}

// =============================================================
// Level Config
// =============================================================

const LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; bar: string; pct: number }> = {
  strong:     { label: "Strong",     color: "text-green-700", bg: "bg-green-50 border-green-200", bar: "bg-green-500", pct: 95 },
  adequate:   { label: "Adequate",   color: "text-blue-700",  bg: "bg-blue-50 border-blue-200",   bar: "bg-blue-500",  pct: 70 },
  developing: { label: "Developing", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", bar: "bg-amber-500", pct: 45 },
  weak:       { label: "Weak",       color: "text-red-700",   bg: "bg-red-50 border-red-200",     bar: "bg-red-400",   pct: 20 },
};

// =============================================================
// Dimension Card
// =============================================================

function DimensionCard({ dim, title }: { dim: DimensionAnalysis; title: string }) {
  const config = LEVEL_CONFIG[dim.level] ?? LEVEL_CONFIG.developing!;

  return (
    <div className="rounded-xl border border-ink/8 bg-white p-4 shadow-sm space-y-3">
      {/* Header + Level */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-ink">{title}</h4>
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${config.bg} ${config.color}`}>
            {config.label}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-ink/5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${config.bar}`}
            style={{ width: `${config.pct}%` }}
          />
        </div>
      </div>

      {/* Evidence — "AI 为什么这样判断？" */}
      {dim.evidence.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-meta">AI 判断依据</p>
          <ul className="space-y-1">
            {dim.evidence.map((ev, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-ink-soft leading-relaxed">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-meta/40" />
                <span>{ev}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Issues */}
      {dim.issues.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-meta">发现问题</p>
          <ul className="space-y-1">
            {dim.issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-ink-soft leading-relaxed">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {dim.suggestions.length > 0 && (
        <div className="space-y-1 border-t border-ink/5 pt-2.5">
          <p className="text-xs font-medium text-ink-meta">改善建议</p>
          {dim.suggestions.map((s, i) => (
            <p key={i} className="text-xs text-accent font-medium leading-relaxed">{s}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================
// Pronunciation Placeholder
// =============================================================

function PronunciationPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-ink/10 bg-surface-raised p-4 flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/5">
        <svg className="h-4 w-4 text-ink-meta" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
        </svg>
      </div>
      <div>
        <p className="text-xs font-medium text-ink-meta">Pronunciation</p>
        <p className="text-xs text-ink-meta/70">Coming soon — 发音评估需要专用语音分析</p>
      </div>
    </div>
  );
}

// =============================================================
// Main Component
// =============================================================

export function SpeakingFeedback({ analysis, isSecondAnswer, onViewDrill, onTryAgain, onFinish, nextPart, onContinuePart }: Props) {
  const ielts = analysis.ieltsAnalysis;

  return (
    <div className="space-y-5">
      {/* ─── Report Header ─── */}
      <div className="rounded-xl border border-ink/8 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
            <svg className="h-4.5 w-4.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-medium text-ink">
              {isSecondAnswer ? "重答诊断报告" : "IELTS Speaking Report"}
            </h3>
            <p className="text-xs text-ink-meta">AI Diagnostic Analysis</p>
          </div>
        </div>

        {/* Overall Diagnosis */}
        <div className="rounded-lg bg-surface-raised p-3.5">
          <p className="text-xs font-medium text-ink-meta mb-1">Overall Diagnosis</p>
          {ielts?.overallDiagnosis ? (
            <p className="text-sm leading-relaxed text-ink">{ielts.overallDiagnosis}</p>
          ) : (
            <p className="text-sm leading-relaxed text-ink">{analysis.summary}</p>
          )}
        </div>

        {/* Metrics */}
        <div className="mt-3 flex gap-4 text-xs text-ink-meta">
          <span className="font-mono tabular-nums">{analysis.metrics.wordCount} words</span>
          <span className="font-mono tabular-nums">{analysis.metrics.sentenceCount} sentences</span>
        </div>
      </div>

      {/* ─── IELTS 四维能力分析 ─── */}
      {ielts && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-ink-meta uppercase tracking-wide">IELTS Speaking Dimensions</p>
          <div className="grid gap-3 lg:grid-cols-3">
            {ielts.fluency && <DimensionCard dim={ielts.fluency} title="Fluency & Coherence" />}
            {ielts.lexicalResource && <DimensionCard dim={ielts.lexicalResource} title="Lexical Resource" />}
            {ielts.grammaticalRange && <DimensionCard dim={ielts.grammaticalRange} title="Grammar Range & Accuracy" />}
          </div>
          <PronunciationPlaceholder />
        </div>
      )}

      {/* ─── 你的最大提升机会 ─── */}
      <div className="rounded-xl border border-ink/8 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-xs">🎯</span>
          <p className="text-sm font-medium text-ink">你的最大提升机会</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-accent/8 px-2 py-0.5 text-xs font-semibold text-accent">
              {analysis.mainIssue.dimension}
            </span>
            <span className="text-xs text-ink-meta">
              {analysis.mainIssue.severity === "major" ? "关键问题" : "可优化"}
            </span>
          </div>
          <p className="text-sm text-ink leading-relaxed">{analysis.mainIssue.description}</p>
          <div className="rounded-lg bg-accent/3 border border-accent/10 p-3">
            <p className="text-xs font-medium text-accent mb-0.5">改善方向</p>
            <p className="text-sm text-ink">{analysis.mainIssue.suggestion}</p>
          </div>
        </div>
      </div>

      {/* ─── Priority Actions ─── */}
      {ielts && ielts.prioritizedSuggestions.length > 0 && (
        <div className="rounded-xl border border-accent/12 bg-gradient-to-b from-accent/3 to-transparent p-4 space-y-2.5">
          <p className="text-xs font-semibold text-accent uppercase tracking-wide">Priority Actions</p>
          <ol className="space-y-2">
            {ielts.prioritizedSuggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-ink leading-relaxed">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent mt-0.5">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ─── Fallback (no ieltsAnalysis — rule-based) ─── */}
      {!ielts && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2">
          <p className="text-xs font-medium text-amber-800">基础分析（文本模式）</p>
          <p className="text-sm text-ink-soft">{analysis.summary}</p>
        </div>
      )}

      {/* ─── Actions ─── */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!isSecondAnswer && onTryAgain && (
          <button
            onClick={onTryAgain}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent/90"
          >
            重新回答
          </button>
        )}
        {!isSecondAnswer && onViewDrill && (
          <button
            onClick={onViewDrill}
            className="rounded-lg border border-accent bg-white px-4 py-2.5 text-sm font-medium text-accent shadow-sm transition hover:bg-accent/5"
          >
            立即练习
          </button>
        )}
        {!isSecondAnswer && nextPart && onContinuePart && (
          <button
            onClick={onContinuePart}
            className="rounded-lg border border-ink/10 px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-raised"
          >
            继续 {nextPart} →
          </button>
        )}
        <button
          onClick={onFinish}
          className="rounded-lg px-4 py-2.5 text-sm text-ink-soft transition hover:text-ink"
        >
          {isSecondAnswer ? "完成练习" : "结束"}
        </button>
      </div>
    </div>
  );
}
