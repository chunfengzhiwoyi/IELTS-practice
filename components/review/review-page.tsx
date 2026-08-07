"use client";

import { useEffect, useState } from "react";

import type { ReviewResult } from "@/lib/review/answer-judge";
import { getReviewSession, submitReviewAnswer, type ReviewTask } from "@/lib/client/demo-service";
import { ReviewEmptyState } from "@/components/review/review-empty-state";
import { ReviewFeedback } from "@/components/review/review-feedback";
import { ReviewProgress } from "@/components/review/review-progress";
import { ReviewSummary, type ReviewSessionStats } from "@/components/review/review-summary";
import { ReviewTaskCard } from "@/components/review/review-task-card";

type PageState =
  | { kind: "LOADING" }
  | { kind: "EMPTY" }
  | { kind: "TASK_READY" }
  | { kind: "SUBMITTING" }
  | { kind: "FEEDBACK"; result: ReviewResult; feedback: string; nextReviewAt: string }
  | { kind: "SUMMARY" }
  | { kind: "ERROR"; message: string };

interface Props {
  initialItemId?: string;
}

export function ReviewPage({ initialItemId }: Props) {
  const [state, setState] = useState<PageState>({ kind: "LOADING" });
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<ReviewSessionStats>({
    correct: 0, hinted: 0, incorrect: 0, skipped: 0, nextReviewTimes: [],
  });

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setCurrentIndex(0);
      setStats({ correct: 0, hinted: 0, incorrect: 0, skipped: 0, nextReviewTimes: [] });
      setState({ kind: "TASK_READY" });
    } catch (err) {
      setState({ kind: "ERROR", message: err instanceof Error ? err.message : "加载失败" });
    }
  };

  const handleSubmit = async (answer: string, usedHint: boolean) => {
    const task = tasks[currentIndex];
    if (!task) return;
    setState({ kind: "SUBMITTING" });
    try {
      const res = await submitReviewAnswer({ itemId: task.itemId, answer, usedHint, skipped: false, task });
      updateStats(res.result, res.nextReviewAt);
      setState({ kind: "FEEDBACK", result: res.result, feedback: res.feedback, nextReviewAt: res.nextReviewAt });
    } catch (err) {
      setState({ kind: "ERROR", message: err instanceof Error ? err.message : "提交失败" });
    }
  };

  const handleSkip = async () => {
    const task = tasks[currentIndex];
    if (!task) return;
    setState({ kind: "SUBMITTING" });
    try {
      const res = await submitReviewAnswer({ itemId: task.itemId, answer: "", usedHint: false, skipped: true, task });
      updateStats(res.result, res.nextReviewAt);
      setState({ kind: "FEEDBACK", result: res.result, feedback: res.feedback, nextReviewAt: res.nextReviewAt });
    } catch (err) {
      setState({ kind: "ERROR", message: err instanceof Error ? err.message : "提交失败" });
    }
  };

  const updateStats = (result: ReviewResult, nextReviewAt: string) => {
    setStats((prev) => {
      const next = { ...prev, nextReviewTimes: [...prev.nextReviewTimes, nextReviewAt] };
      switch (result) {
        case "CORRECT_INDEPENDENT": next.correct += 1; break;
        case "CORRECT_WITH_HINT": next.hinted += 1; break;
        case "INCORRECT": next.incorrect += 1; break;
        case "SKIPPED": next.skipped += 1; break;
      }
      return next;
    });
  };

  const handleNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= tasks.length) {
      setState({ kind: "SUMMARY" });
    } else {
      setCurrentIndex(nextIndex);
      setState({ kind: "TASK_READY" });
    }
  };

  if (state.kind === "LOADING") return <div className="py-8 text-center text-sm text-slate-500">加载复习任务中…</div>;
  if (state.kind === "EMPTY") return <ReviewEmptyState />;
  if (state.kind === "ERROR") return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p className="font-medium">请求失败</p>
      <p className="mt-1">{state.message}</p>
      <button onClick={loadSession} className="mt-2 text-xs text-brand-600 underline">重试</button>
    </div>
  );
  if (state.kind === "SUMMARY") return <ReviewSummary stats={stats} />;

  const currentTask = tasks[currentIndex];
  return (
    <div className="space-y-4">
      <ReviewProgress current={currentIndex + 1} total={tasks.length} />
      {(state.kind === "TASK_READY" || state.kind === "SUBMITTING") && currentTask && (
        <ReviewTaskCard term={currentTask.term} prompt={currentTask.prompt} onSubmit={handleSubmit} onSkip={handleSkip} disabled={state.kind === "SUBMITTING"} />
      )}
      {state.kind === "FEEDBACK" && (
        <ReviewFeedback result={state.result} feedback={state.feedback} nextReviewAt={state.nextReviewAt} onNext={handleNext} />
      )}
    </div>
  );
}
