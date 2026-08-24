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
  const step = kind === "LOADING_SESSION" ? 1 : 2;
  const label = kind === "LOADING_SESSION" ? "正在生成题目…" : "正在分析你的回答…";
  return (
    <div className="speaking-loader" role="status" aria-live="polite">
      <div className="speaking-loader__rule">
        <span className="speaking-loader__fill" />
      </div>
      <div className="speaking-loader__meta">
        <span className="speaking-loader__step">步骤 {step} / 2</span>
        <span className="speaking-loader__label">{label}</span>
      </div>
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

  // 流程内头部：Part 步进器 + 返回选题型（仅在已进入会话后显示）
  const showStepper = currentPart && state.kind !== "TOPIC_SELECT" && state.kind !== "ERROR";
  const inSession =
    state.kind === "FIRST_ANSWER" ||
    state.kind === "SECOND_ANSWER" ||
    state.kind === "FEEDBACK" ||
    state.kind === "MICRO_DRILL" ||
    state.kind === "ANALYZING" ||
    state.kind === "LOADING_SESSION" ||
    state.kind === "PREP";

  return (
    <div className="space-y-5">
      {showStepper && (
        <div className="speech-head">
          <PartStepper current={currentPart} visited={visited} onSelect={handleStartSession} />
          {inSession && (
            <button onClick={handleNewSession} className="btn btn--quiet btn--sm">
              ← 返回选题型
            </button>
          )}
        </div>
      )}

      {state.kind === "TOPIC_SELECT" && <TopicSelector onSelect={handleStartSession} />}

      {state.kind === "LOADING_SESSION" || state.kind === "ANALYZING" ? (
        <SpeakingLoader kind={state.kind} />
      ) : null}

      {state.kind === "ERROR" && (
        <div className="feedback-card feedback-card--bad">
          <h3 className="feedback-card__title">出错了</h3>
          <p className="feedback-card__body">{state.message}</p>
          <button onClick={handleNewSession} className="btn btn--ghost mt-3">重试</button>
        </div>
      )}

      {state.kind === "PREP" && (
        <SpeakingPrep
          question={state.questionData}
          onStart={() => setState({ kind: "FIRST_ANSWER", session: state.session, questionData: state.questionData })}
        />
      )}

      {state.kind === "FIRST_ANSWER" && (
        <AnswerInput
          question={state.questionData.question}
          questionZh={state.questionData.questionZh}
          part={state.questionData.part}
          topic={state.questionData.topic}
          onSubmit={(a, meta) => handleSubmitAnswer(a, false, meta)}
          label="首答"
        />
      )}

      {state.kind === "SECOND_ANSWER" && (
        <AnswerInput
          question={state.questionData.question}
          questionZh={state.questionData.questionZh}
          part={state.questionData.part}
          topic={state.questionData.topic}
          onSubmit={(a, meta) => handleSubmitAnswer(a, true, meta)}
          label="重答（尝试改善主要问题）"
        />
      )}

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

      {state.kind === "MICRO_DRILL" && (
        <MicroDrillCard drill={state.analysis.microDrill} onTryAgain={handleTryAgain} onFinish={handleFinish} />
      )}

      {state.kind === "COMPLETED" && (
        <div className="panel">
          <h3 className="font-display text-lg text-ink">本次口语练习完成</h3>
          {state.collected.length > 0 ? (
            <div className="space-y-3">
              {[...state.collected]
                .sort((a, b) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part))
                .map(({ part, analysis }) => (
                  <div key={part} className="feedback-card">
                    <div className="flex items-center justify-between gap-2">
                      <span className="pill">{part}</span>
                      <span className="font-ui text-xs text-ink-meta">{analysis.metrics.wordCount} 词</span>
                    </div>
                    <p className="mt-2 text-ink-soft">{analysis.mainIssue.description}</p>
                    <p className="mt-1 font-medium text-ink">{analysis.mainIssue.suggestion}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-2 text-ink-soft">
              {state.lastAnalysis
                ? `主要改善点：${state.lastAnalysis.mainIssue.description}`
                : "本次练习已记录，去报告页看看趋势。"}
            </p>
          )}
          {nextPart && (
            <button onClick={() => handleStartSession(nextPart)} className="btn btn--primary mt-4">
              继续 {nextPart} →
            </button>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={handleNewSession} className="btn btn--ghost">再练一题</button>
            <Link href="/report" className="btn btn--ghost">看报告</Link>
            <Link href="/" className="btn btn--quiet">返回主页</Link>
          </div>
        </div>
      )}
    </div>
  );
}
