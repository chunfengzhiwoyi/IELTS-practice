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

  useEffect(() => { loadSession(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (next >= tasks.length) {
      setState({ kind: "SUMMARY" });
    } else {
      setTaskIndex(next);
      setAnswer("");
      setHintRevealed(false);
      setState({ kind: "TASK" });
    }
  };

  // --- Render ---

  if (state.kind === "LOADING") {
    return <div className="py-12 text-center text-sm text-slate-500">加载中…</div>;
  }

  if (state.kind === "ERROR") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {state.message}
        <button onClick={loadSession} className="ml-2 underline">重试</button>
      </div>
    );
  }

  if (state.kind === "EMPTY") {
    return (
      <div className="py-16 text-center">
        <h2 className="text-lg font-semibold text-slate-800">今天暂时没有需要复习的内容</h2>
        <p className="mt-2 text-sm text-slate-500">目前学过的表达还没到下一次复习时间。</p>
        <Link href="/learn" className="mt-6 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          学习一个新表达
        </Link>
      </div>
    );
  }

  if (state.kind === "SUMMARY") {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-800">今日复习完成</h2>
          <p className="mt-1 text-sm text-slate-500">共复习 {stats.total} 个表达</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="独立想起来" value={stats.independent} color="text-emerald-700 bg-emerald-50" />
          <StatCard label="在提示下想起来" value={stats.hinted} color="text-amber-700 bg-amber-50" />
          <StatCard label="还需巩固" value={stats.incorrect} color="text-rose-700 bg-rose-50" />
          <StatCard label="跳过" value={stats.skipped} color="text-slate-600 bg-slate-50" />
        </div>
        {stats.incorrectTerms.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-700">还值得再看看：</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {stats.incorrectTerms.map((t, i) => (
                <span key={i} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm text-rose-700">{t}</span>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button onClick={loadSession} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            继续复习
          </button>
          <Link href="/learn" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            学习一个新表达
          </Link>
          <Link href="/" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "FEEDBACK") {
    const { result, term, coreMeaning, nextTime } = state;
    const feedbackConfig = getFeedbackConfig(result);

    return (
      <div className="space-y-4">
        <ProgressBar current={taskIndex + 1} total={tasks.length} />
        <div className={`rounded-xl border p-5 ${feedbackConfig.colorClass}`}>
          <p className="text-base font-semibold text-slate-800">{feedbackConfig.title}</p>
          <p className="mt-1 text-sm text-slate-700">{feedbackConfig.body}</p>
          <div className="mt-3 rounded-md bg-white/60 px-3 py-2">
            <p className="text-sm"><span className="font-medium">{term}</span> = {coreMeaning}</p>
          </div>
          <p className="mt-2 text-xs text-slate-500">下次复习：{nextTime}</p>
        </div>
        <button onClick={handleNext} className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
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
    <div className="space-y-4">
      {taskIndex === 0 && (
        <p className="text-sm text-slate-600">
          今天有 {tasks.length} 个表达需要巩固 · 预计约 {minutes} 分钟
        </p>
      )}
      <ProgressBar current={taskIndex + 1} total={tasks.length} />
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-2xl font-bold text-slate-900">{task.term}</p>
        <p className="mt-3 text-sm text-slate-500">你还记得这个表达的核心意思吗？</p>
      </div>

      {hintRevealed && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          💡 提示：和「{buildHintText(task)}」有关
        </div>
      )}

      <div className="space-y-3">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={isSubmitting}
          rows={2}
          placeholder="输入你记得的含义…"
          className="w-full resize-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
        />
        <div className="flex items-center justify-between">
          <button
            onClick={() => setHintRevealed(true)}
            disabled={hintRevealed || isSubmitting}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {hintRevealed ? "提示已显示" : "查看提示"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleSkip}
              disabled={isSubmitting}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              跳过
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !answer.trim()}
              className="rounded-md bg-brand-600 px-5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-40"
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
  // fallback: 取 coreMeaning 的前几个字
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
  colorClass: string;
}

function getFeedbackConfig(result: ReviewResult): FeedbackConfig {
  switch (result) {
    case "CORRECT_INDEPENDENT":
      return {
        title: "记住了 👏",
        body: "你这次可以不看提示回忆出核心意思。",
        colorClass: "border-emerald-200 bg-emerald-50",
      };
    case "CORRECT_WITH_HINT":
      return {
        title: "在提示下想起来了",
        body: "核心意思已经找回来了，不过这次还需要一点帮助。",
        colorClass: "border-amber-200 bg-amber-50",
      };
    case "INCORRECT":
      return {
        title: "这次还没完全想起来",
        body: "先重新看一下核心意思，之后会更快再次遇到它。",
        colorClass: "border-rose-200 bg-rose-50",
      };
    case "SKIPPED":
      return {
        title: "先放一放",
        body: "这个表达之后会再次安排复习。",
        colorClass: "border-slate-200 bg-slate-100",
      };
  }
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span className="font-medium">{current} / {total}</span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg px-3 py-3 text-center ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-xs">{label}</div>
    </div>
  );
}
