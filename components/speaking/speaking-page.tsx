"use client";

import { useState } from "react";
import Link from "next/link";

import type { SpeakingAnalysisResult, SpeakingPart, SpeakingSession, SpeakingQuestion } from "@/lib/speaking/types";
import type { AudioMetadata } from "@/lib/speaking/audio-types";
import { writeAbilityObservations } from "@/lib/ability/writer";
import { buildSpeakingAbilityProfile } from "@/lib/ability/profile-builder";
import { retrieveAbilityContext } from "@/lib/ability/memory-retriever";
import { computeSessionEvaluation } from "@/lib/evaluation/evaluation-builder";
import { getEvaluationRepository } from "@/lib/evaluation/repository";
import { TopicSelector } from "@/components/speaking/topic-selector";
import { AnswerInput } from "@/components/speaking/answer-input";
import { SpeakingFeedback } from "@/components/speaking/speaking-feedback";
import { MicroDrillCard } from "@/components/speaking/micro-drill-card";
import { PartStepper } from "@/components/speaking/part-stepper";
import { SpeakingPrep } from "@/components/speaking/speaking-prep";

type PageState =
  | { kind: "TOPIC_SELECT" }
  | { kind: "LOADING_SESSION" }
  | { kind: "PREP"; session: SpeakingSession; questionData: SpeakingQuestion }
  | { kind: "FIRST_ANSWER"; session: SpeakingSession; questionData: SpeakingQuestion }
  | { kind: "ANALYZING" }
  | { kind: "FEEDBACK"; session: SpeakingSession; questionData: SpeakingQuestion; analysis: SpeakingAnalysisResult; isSecond: boolean }
  | { kind: "MICRO_DRILL"; session: SpeakingSession; questionData: SpeakingQuestion; analysis: SpeakingAnalysisResult }
  | { kind: "SECOND_ANSWER"; session: SpeakingSession; questionData: SpeakingQuestion }
  | { kind: "COMPLETED"; collected: Array<{ part: SpeakingPart; analysis: SpeakingAnalysisResult }>; lastAnalysis: SpeakingAnalysisResult | null }
  | { kind: "ERROR"; message: string };

const PART_ORDER: SpeakingPart[] = ["P1", "P2", "P3"];

function SpeakingLoader({ kind }: { kind: "LOADING_SESSION" | "ANALYZING" }) {
  const label = kind === "LOADING_SESSION" ? "正在生成题目…" : "AI 正在分析你的回答…";
  return (
    <div className="flex flex-col items-center gap-4 py-12" role="status" aria-live="polite">
      <div className="relative h-10 w-10">
        <span className="absolute inset-0 rounded-full border-2 border-accent/20" />
        <span className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
      <p className="text-sm text-ink-soft">{label}</p>
    </div>
  );
}

export function SpeakingPage() {
  const [state, setState] = useState<PageState>({ kind: "TOPIC_SELECT" });
  const [currentPart, setCurrentPart] = useState<SpeakingPart | null>(null);
  const [visited, setVisited] = useState<SpeakingPart[]>([]);
  const [collected, setCollected] = useState<Array<{ part: SpeakingPart; analysis: SpeakingAnalysisResult }>>([]);

  const handleStartSession = async (part: SpeakingPart) => {
    setCurrentPart(part);
    setVisited((prev) => (prev.includes(part) ? prev : [...prev, part]));
    setState({ kind: "LOADING_SESSION" });
    try {
      const res = await fetch("/api/speaking/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ part }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({ kind: "ERROR", message: json?.error?.message ?? `创建失败 (${res.status})` });
        return;
      }
      // P2 是 long-turn：先进准备阶段（构思要点），P1/P3 直接作答
      if (part === "P2") {
        setState({ kind: "PREP", session: json.session, questionData: json.questionData });
      } else {
        setState({ kind: "FIRST_ANSWER", session: json.session, questionData: json.questionData });
      }
    } catch (err) {
      setState({ kind: "ERROR", message: err instanceof Error ? err.message : "创建失败" });
    }
  };

  const handleSubmitAnswer = async (answer: string, isSecond: boolean, audioMetadata?: AudioMetadata) => {
    if (state.kind !== "FIRST_ANSWER" && state.kind !== "SECOND_ANSWER") return;
    const { session, questionData } = state;
    setState({ kind: "ANALYZING" });
    try {
      // Phase 4.3: 构建能力上下文（不阻塞主流程）
      let abilityContext = null;
      try {
        const profile = buildSpeakingAbilityProfile(session.userId);
        abilityContext = retrieveAbilityContext(profile);
      } catch {
        // Profile Builder 失败不影响分析
      }

      const res = await fetch("/api/speaking/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          answer,
          isSecondAnswer: isSecond,
          ...(audioMetadata ? { audioMetadata } : {}),
          ...(abilityContext ? { abilityContext } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({ kind: "ERROR", message: json?.error?.message ?? `分析失败 (${res.status})` });
        return;
      }
      // 按 part 累积分析，供完成页回顾整套练习
      setCollected((prev) => {
        const others = prev.filter((x) => x.part !== questionData.part);
        return [...others, { part: questionData.part, analysis: json.analysis }];
      });

      // Phase 4.1: 沉淀能力观察（Analysis = 推理，Writer = 状态更新）
      try {
        writeAbilityObservations({
          userId: session.userId,
          sessionId: session.id,
          analysis: json.analysis as SpeakingAnalysisResult,
        });
      } catch {
        // Ability Writer 失败不阻塞主流程
      }

      // Phase 5: 二次回答后计算效果评估
      if (isSecond) {
        try {
          const updatedSession = json.session as import("@/lib/speaking/types").SpeakingSession;
          const evaluation = computeSessionEvaluation(updatedSession);
          if (evaluation) {
            getEvaluationRepository().save(evaluation);
          }
        } catch {
          // Evaluation 失败不阻塞主流程
        }
      }

      setState({ kind: "FEEDBACK", session: json.session, questionData, analysis: json.analysis, isSecond });
    } catch (err) {
      setState({ kind: "ERROR", message: err instanceof Error ? err.message : "网络错误" });
    }
  };

  const handleViewDrill = () => {
    if (state.kind !== "FEEDBACK") return;
    setState({ kind: "MICRO_DRILL", session: state.session, questionData: state.questionData, analysis: state.analysis });
  };

  const handleTryAgain = () => {
    if (state.kind !== "MICRO_DRILL" && state.kind !== "FEEDBACK") return;
    const s = state as { session: SpeakingSession; questionData: SpeakingQuestion };
    setState({ kind: "SECOND_ANSWER", session: s.session, questionData: s.questionData });
  };

  const handleFinish = () => {
    const analysis =
      state.kind === "FEEDBACK" || state.kind === "MICRO_DRILL"
        ? state.analysis
        : null;
    setState({ kind: "COMPLETED", collected, lastAnalysis: analysis });
  };

  const handleNewSession = () => {
    setCollected([]);
    setState({ kind: "TOPIC_SELECT" });
  };

  const nextPart = currentPart
    ? PART_ORDER[PART_ORDER.indexOf(currentPart) + 1]
    : undefined;

  // 流程内头部：Part 步进器 + 返回（仅在已进入会话后显示）
  const showStepper = currentPart && state.kind !== "TOPIC_SELECT" && state.kind !== "ERROR";

  return (
    <div className="space-y-6">
      {/* ─── 顶部导航 + 考试状态 ─── */}
      {showStepper && (
        <div className="flex items-center justify-between">
          <button
            onClick={handleNewSession}
            className="text-sm font-medium text-ink-soft hover:text-ink transition"
          >
            ← 返回题型选择
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/8 px-3 py-1 text-xs font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              Practice Mode
            </span>
          </div>
        </div>
      )}

      {/* ─── Part 步进器（紧凑） ─── */}
      {showStepper && (
        <PartStepper current={currentPart} visited={visited} onSelect={handleStartSession} />
      )}

      {/* ─── 题型选择 ─── */}
      {state.kind === "TOPIC_SELECT" && <TopicSelector onSelect={handleStartSession} />}

      {/* ─── 加载状态 ─── */}
      {(state.kind === "LOADING_SESSION" || state.kind === "ANALYZING") && (
        <SpeakingLoader kind={state.kind} />
      )}

      {/* ─── 错误 ─── */}
      {state.kind === "ERROR" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-sm font-medium text-red-800">出错了</p>
          <p className="mt-1 text-sm text-red-600">{state.message}</p>
          <button onClick={handleNewSession} className="mt-3 text-sm font-medium text-accent hover:underline">
            重试
          </button>
        </div>
      )}

      {/* ─── P2 构思准备 ─── */}
      {state.kind === "PREP" && (
        <SpeakingPrep
          question={state.questionData}
          onStart={() => setState({ kind: "FIRST_ANSWER", session: state.session, questionData: state.questionData })}
        />
      )}

      {/* ─── 首答 ─── */}
      {state.kind === "FIRST_ANSWER" && (
        <AnswerInput
          question={state.questionData.question}
          questionZh={state.questionData.questionZh}
          part={state.questionData.part}
          topic={state.questionData.topic}
          onSubmit={(a, meta) => handleSubmitAnswer(a, false, meta)}
          label="Your Answer"
        />
      )}

      {/* ─── 重答 ─── */}
      {state.kind === "SECOND_ANSWER" && (
        <AnswerInput
          question={state.questionData.question}
          questionZh={state.questionData.questionZh}
          part={state.questionData.part}
          topic={state.questionData.topic}
          onSubmit={(a, meta) => handleSubmitAnswer(a, true, meta)}
          label="Try Again — 尝试改善主要问题"
        />
      )}

      {/* ─── AI 反馈 ─── */}
      {state.kind === "FEEDBACK" && (
        <SpeakingFeedback
          analysis={state.analysis}
          isSecondAnswer={state.isSecond}
          onViewDrill={!state.isSecond ? handleViewDrill : undefined}
          onTryAgain={!state.isSecond ? handleTryAgain : undefined}
          onFinish={handleFinish}
          nextPart={nextPart}
          onContinuePart={nextPart ? () => handleStartSession(nextPart) : undefined}
        />
      )}

      {/* ─── 微训练 ─── */}
      {state.kind === "MICRO_DRILL" && (
        <MicroDrillCard drill={state.analysis.microDrill} onTryAgain={handleTryAgain} onFinish={handleFinish} />
      )}

      {/* ─── 练习完成 ─── */}
      {state.kind === "COMPLETED" && (
        <div className="rounded-xl border border-ink/8 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-ink">练习完成</h3>
          </div>

          {state.collected.length > 0 ? (
            <div className="space-y-3">
              {[...state.collected]
                .sort((a, b) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part))
                .map(({ part, analysis }) => (
                  <div key={part} className="rounded-lg border border-ink/5 bg-surface-raised p-4">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center rounded-md bg-accent/8 px-2 py-0.5 text-xs font-medium text-accent">{part}</span>
                      <span className="font-mono text-xs text-ink-meta">{analysis.metrics.wordCount} words</span>
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">{analysis.mainIssue.description}</p>
                    <p className="mt-1 text-sm font-medium text-ink">{analysis.mainIssue.suggestion}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              {state.lastAnalysis
                ? `主要改善点：${state.lastAnalysis.mainIssue.description}`
                : "本次练习已记录，去报告页查看趋势。"}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-ink/5">
            {nextPart && (
              <button onClick={() => handleStartSession(nextPart)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90 transition">
                继续 {nextPart} →
              </button>
            )}
            <button onClick={handleNewSession} className="rounded-lg border border-ink/10 px-4 py-2 text-sm font-medium text-ink hover:bg-surface-raised transition">
              再练一题
            </button>
            <Link href="/report" className="rounded-lg border border-ink/10 px-4 py-2 text-sm font-medium text-ink hover:bg-surface-raised transition">
              看报告
            </Link>
            <Link href="/" className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:text-ink transition">
              返回主页
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
