"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getReviewSession, submitReviewAnswer, type ReviewTask } from "@/lib/client/demo-service";
import type { ReviewResult } from "@/lib/review/answer-judge";

type PageState =
  | { kind: "LOADING" }
  | { kind: "EMPTY" }
  | { kind: "INTRO" }
  | { kind: "TASK" }
  | { kind: "SUBMITTING" }
  | { kind: "FEEDBACK"; result: ReviewResult; term: string; coreMeaning: string; nextTime: string }
  | { kind: "SUMMARY" }
  | { kind: "ERROR"; message: string };

interface SessionStats {
  total: number;
  independent: number;
  hinted: number;
  incorrect: number;
  skipped: number;
  incorrectTerms: string[];
}

interface Props {
  initialItemId?: string;
}

export function ReviewPage({ initialItemId }: Props) {
  const [state, setState] = useState<PageState>({ kind: "LOADING" });
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [taskIndex, setTaskIndex] = useState(0);
  const [stats, setStats] = useState<SessionStats>({ total: 0, independent: 0, hinted: 0, incorrect: 0, skipped: 0, incorrectTerms: [] });
  const [answer, setAnswer] = useState("");
  const [hintRevealed, setHintRevealed] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => { loadSession(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const loadSession = async () => {
    setState({ kind: "LOADING" });
    try {
      const mode = initialItemId ? "MANUAL" as const : "DUE" as const;
      const data = await getReviewSession(mode, initialItemId);
      if (data.tasks.length === 0) {
        setState({ kind: "EMPTY" });
        return;
      }
      setTasks(data.tasks);
      setTaskIndex(0);
      setStats({ total: data.tasks.length, independent: 0, hinted: 0, incorrect: 0, skipped: 0, incorrectTerms: [] });
      setAnswer("");
      setHintRevealed(false);
      setState({ kind: "TASK" });
    } catch {
      setState({ kind: "ERROR", message: "加载失败，请刷新重试" });
    }
  };

  const handleSubmit = async () => {
    const task = tasks[taskIndex];
    if (!task || !answer.trim()) return;
    setConfirmExit(false);
    setState({ kind: "SUBMITTING" });
    try {
      const res = await submitReviewAnswer({ itemId: task.itemId, answer: answer.trim(), usedHint: hintRevealed, skipped: false, task });
      updateStats(res.result, task.term);
      setState({ kind: "FEEDBACK", result: res.result, term: task.term, coreMeaning: task.coreMeaning, nextTime: formatNextTime(res.nextReviewAt) });
    } catch {
      setState({ kind: "ERROR", message: "提交失败，请重试" });
    }
  };

  const handleSkip = async () => {
    const task = tasks[taskIndex];
    if (!task) return;
    setConfirmExit(false);
    setState({ kind: "SUBMITTING" });
    try {
      const res = await submitReviewAnswer({ itemId: task.itemId, answer: "", usedHint: false, skipped: true, task });
      updateStats(res.result, task.term);
      setState({ kind: "FEEDBACK", result: "SKIPPED", term: task.term, coreMeaning: task.coreMeaning, nextTime: formatNextTime(res.nextReviewAt) });
    } catch {
      setState({ kind: "ERROR", message: "提交失败，请重试" });
    }
  };

  const updateStats = (result: ReviewResult, term: string) => {
    setStats((prev) => {
      const next = { ...prev };
      if (result === "CORRECT_INDEPENDENT") next.independent++;
      else if (result === "CORRECT_WITH_HINT") next.hinted++;
      else if (result === "INCORRECT") { next.incorrect++; next.incorrectTerms = [...prev.incorrectTerms, term].slice(0, 3); }
      else next.skipped++;
      return next;
    });
  };

  const handleNext = () => {
    const next = taskIndex + 1;
    setConfirmExit(false);
    if (next >= tasks.length) {
      setState({ kind: "SUMMARY" });
    } else {
      setTaskIndex(next);
      setAnswer("");
      setHintRevealed(false);
      setState({ kind: "TASK" });
    }
  };

  // 退出复习：两步确认，避免误触丢失当前复习进度
  const renderExit = () =>
    !confirmExit ? (
      <button
        type="button"
        onClick={() => setConfirmExit(true)}
        className="btn btn--quiet btn--sm whitespace-nowrap"
      >
        退出复习
      </button>
    ) : (
      <span className="exit-confirm">
        <span className="font-ui text-xs text-ink-meta whitespace-nowrap">确认退出本次复习？</span>
        <Link href="/" className="btn btn--quiet btn--sm whitespace-nowrap">确认退出</Link>
        <button
          type="button"
          onClick={() => setConfirmExit(false)}
          className="btn btn--ghost btn--sm whitespace-nowrap"
        >
          继续
        </button>
      </span>
    );

  // --- Render ---

  if (state.kind === "LOADING") {
    return <div className="py-12 text-center text-sm text-ink-meta">加载中…</div>;
  }

  if (state.kind === "ERROR") {
    return (
      <div className="note note--accent">
        {state.message}
        <button onClick={loadSession} className="ml-2 font-semibold text-accent underline">重试</button>
      </div>
    );
  }

  if (state.kind === "EMPTY") {
    return (
      <div className="py-16 text-center">
        <h2 className="text-lg font-semibold text-ink">今天暂时没有需要复习的内容</h2>
        <p className="mt-2 text-sm text-ink-soft">目前学过的表达还没到下一次复习时间。</p>
        <Link href="/learn" className="btn btn--primary mt-6">学习一个新表达</Link>
      </div>
    );
  }

  if (state.kind === "SUMMARY") {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-ink">今日复习完成</h2>
          <p className="mt-1 text-sm text-ink-soft">共复习 {stats.total} 个表达</p>
        </div>
        <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
          <StatCard label="独立想起来" value={stats.independent} tone="good" />
          <StatCard label="在提示下想起来" value={stats.hinted} tone="warn" />
          <StatCard label="还需巩固" value={stats.incorrect} tone="bad" />
          <StatCard label="跳过" value={stats.skipped} tone="muted" />
        </div>
        {stats.incorrectTerms.length > 0 && (
          <div className="note note--bronze">
            <p className="text-sm font-medium text-ink">还值得再看看：</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {stats.incorrectTerms.map((t, i) => (
                <span key={i} className="pill pill--accent">{t}</span>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button onClick={loadSession} className="btn btn--ghost">继续复习</button>
          <Link href="/learn" className="btn btn--ghost">学习一个新表达</Link>
          <Link href="/" className="btn btn--ghost">返回首页</Link>
        </div>
      </div>
    );
  }

  if (state.kind === "FEEDBACK") {
    const { result, term, coreMeaning, nextTime } = state;
    const feedbackConfig = getFeedbackConfig(result);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <ProgressBar current={taskIndex + 1} total={tasks.length} />
          {renderExit()}
        </div>
        <div className={`feedback-card feedback-card--${feedbackConfig.tone}`}>
          <p className="feedback-card__title">{feedbackConfig.title}</p>
          <p className="feedback-card__body">{feedbackConfig.body}</p>
          <div className="feedback-card__pair">
            <span className="k">标准答案</span>
            <p className="mt-1 text-ink"><span className="font-medium">{term}</span> = {coreMeaning}</p>
          </div>
          <p className="mt-2 text-xs text-ink-meta">下次复习：{nextTime}</p>
        </div>
        <button onClick={handleNext} className="btn btn--primary w-full">
          {taskIndex + 1 >= tasks.length ? "查看总结" : "下一个"}
        </button>
      </div>
    );
  }

  // TASK or SUBMITTING
  const task = tasks[taskIndex];
  if (!task) return null;
  const isSubmitting = state.kind === "SUBMITTING";
  const minutes = Math.max(1, Math.ceil(tasks.length * 0.5));

  return (
    <div className="space-y-5">
      {taskIndex === 0 && (
        <p className="text-sm text-ink-soft">
          今天还有 {tasks.length} 个表达等待巩固 · 预计约 {minutes} 分钟
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <ProgressBar current={taskIndex + 1} total={tasks.length} />
        {renderExit()}
      </div>
      <div className="recall-card">
        <p className="recall-card__term">{task.term}</p>
        <p className="recall-card__hint-q">请给出释义 / 翻译</p>
      </div>

      {hintRevealed && (
        <div className="note note--bronze">
          提示：和「{buildHintText(task)}」有关
        </div>
      )}

      <div className="space-y-3">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={isSubmitting}
          rows={2}
          placeholder="输入你记得的含义…"
          className="field-input resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
        />
        <div className="flex items-center justify-between">
          <button
            onClick={() => setHintRevealed(true)}
            disabled={hintRevealed || isSubmitting}
            className="btn btn--ghost px-4 py-1.5 text-sm"
          >
            {hintRevealed ? "提示已显示" : "查看提示"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleSkip}
              disabled={isSubmitting}
              className="btn btn--ghost px-4 py-1.5 text-sm"
            >
              跳过
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !answer.trim()}
              className="btn btn--primary px-6 py-1.5"
            >
              {isSubmitting ? "提交中…" : "提交"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Helpers
// =============================================================

function buildHintText(task: ReviewTask): string {
  // 给关键词线索而非完整答案
  if (task.answerKeywords.length > 0) return task.answerKeywords[0]!;
  return task.coreMeaning.slice(0, 4) + "…";
}

function formatNextTime(isoTime: string): string {
  const diff = new Date(isoTime).getTime() - Date.now();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 12) return "今天稍后";
  if (hours < 36) return "明天";
  const days = Math.round(hours / 24);
  return `${days} 天后`;
}

interface FeedbackConfig {
  title: string;
  body: string;
  tone: "good" | "warn" | "bad" | "muted";
}

function getFeedbackConfig(result: ReviewResult): FeedbackConfig {
  switch (result) {
    case "CORRECT_INDEPENDENT":
      return { title: "记住了", body: "你这次可以不看提示回忆出核心意思。", tone: "good" };
    case "CORRECT_WITH_HINT":
      return { title: "在提示下想起来了", body: "核心意思已经找回来了，不过这次还需要一点帮助。", tone: "warn" };
    case "INCORRECT":
      return { title: "这次还没完全想起来", body: "先重新看一下核心意思，之后会更快再次遇到它。", tone: "bad" };
    case "SKIPPED":
      return { title: "先放一放", body: "这个表达之后会再次安排复习。", tone: "muted" };
  }
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="flex items-center gap-3 text-xs text-ink-meta">
      <span className="font-medium font-ui">{current} / {total}</span>
      <div className="progress-rule flex-1">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" | "muted" }) {
  const toneClass = {
    good: "text-[oklch(42%_0.09_150)]",
    warn: "text-[oklch(52%_0.12_75)]",
    bad: "text-[oklch(46%_0.16_25)]",
    muted: "text-ink-soft",
  }[tone];
  return (
    <div className="report-row" style={{ borderTop: "none" }}>
      <div className="report-row__k">{label}</div>
      <div className={`report-row__v ${toneClass}`}>{value}</div>
    </div>
  );
}
