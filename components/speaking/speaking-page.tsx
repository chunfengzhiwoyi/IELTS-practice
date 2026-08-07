"use client";

import { useState } from "react";

import type { SpeakingAnalysisResult, SpeakingPart, SpeakingSession, SpeakingQuestion } from "@/lib/speaking/types";
import { TopicSelector } from "@/components/speaking/topic-selector";
import { AnswerInput } from "@/components/speaking/answer-input";
import { SpeakingFeedback } from "@/components/speaking/speaking-feedback";
import { MicroDrillCard } from "@/components/speaking/micro-drill-card";

type PageState =
  | { kind: "TOPIC_SELECT" }
  | { kind: "LOADING_SESSION" }
  | { kind: "FIRST_ANSWER"; session: SpeakingSession; questionData: SpeakingQuestion }
  | { kind: "ANALYZING" }
  | { kind: "FEEDBACK"; session: SpeakingSession; questionData: SpeakingQuestion; analysis: SpeakingAnalysisResult; isSecond: boolean }
  | { kind: "MICRO_DRILL"; session: SpeakingSession; questionData: SpeakingQuestion; analysis: SpeakingAnalysisResult }
  | { kind: "SECOND_ANSWER"; session: SpeakingSession; questionData: SpeakingQuestion }
  | { kind: "COMPLETED"; firstAnalysis: SpeakingAnalysisResult; secondAnalysis: SpeakingAnalysisResult | null }
  | { kind: "ERROR"; message: string };

export function SpeakingPage() {
  const [state, setState] = useState<PageState>({ kind: "TOPIC_SELECT" });

  const handleStartSession = async (part: SpeakingPart) => {
    setState({ kind: "LOADING_SESSION" });
    try {
      // 调用服务端 API Route 创建会话（服务端存储以便后续 analyze 可查到）
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
      setState({ kind: "FIRST_ANSWER", session: json.session, questionData: json.questionData });
    } catch (err) {
      setState({ kind: "ERROR", message: err instanceof Error ? err.message : "创建失败" });
    }
  };

  const handleSubmitAnswer = async (answer: string, isSecond: boolean) => {
    if (state.kind !== "FIRST_ANSWER" && state.kind !== "SECOND_ANSWER") return;
    const { session, questionData } = state;
    setState({ kind: "ANALYZING" });
    try {
      // 调用服务端 API Route（DeepSeek 深度分析，降级到规则引擎）
      const res = await fetch("/api/speaking/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, answer, isSecondAnswer: isSecond }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({ kind: "ERROR", message: json?.error?.message ?? `分析失败 (${res.status})` });
        return;
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
    if (state.kind === "FEEDBACK" || state.kind === "MICRO_DRILL") {
      const s = state as { session: SpeakingSession; analysis: SpeakingAnalysisResult };
      setState({ kind: "COMPLETED", firstAnalysis: s.session.firstAnalysis ?? s.analysis, secondAnalysis: s.session.secondAnalysis ?? null });
      return;
    }
    setState({ kind: "TOPIC_SELECT" });
  };

  const handleNewSession = () => setState({ kind: "TOPIC_SELECT" });

  if (state.kind === "TOPIC_SELECT") return <TopicSelector onSelect={handleStartSession} />;
  if (state.kind === "LOADING_SESSION" || state.kind === "ANALYZING") return <div className="py-8 text-center text-sm text-slate-500">{state.kind === "LOADING_SESSION" ? "准备题目…" : "分析回答…"}</div>;
  if (state.kind === "ERROR") return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p className="font-medium">出错了</p><p className="mt-1">{state.message}</p>
      <button onClick={handleNewSession} className="mt-2 text-xs text-brand-600 underline">重试</button>
    </div>
  );
  if (state.kind === "FIRST_ANSWER") return <AnswerInput question={state.questionData.question} questionZh={state.questionData.questionZh} part={state.questionData.part} topic={state.questionData.topic} onSubmit={(a) => handleSubmitAnswer(a, false)} label="首答" />;
  if (state.kind === "SECOND_ANSWER") return <AnswerInput question={state.questionData.question} questionZh={state.questionData.questionZh} part={state.questionData.part} topic={state.questionData.topic} onSubmit={(a) => handleSubmitAnswer(a, true)} label="重答（尝试改善主要问题）" />;
  if (state.kind === "FEEDBACK") return <SpeakingFeedback analysis={state.analysis} isSecondAnswer={state.isSecond} onViewDrill={!state.isSecond ? handleViewDrill : undefined} onTryAgain={!state.isSecond ? handleTryAgain : undefined} onFinish={handleFinish} />;
  if (state.kind === "MICRO_DRILL") return <MicroDrillCard drill={state.analysis.microDrill} onTryAgain={handleTryAgain} onFinish={handleFinish} />;
  if (state.kind === "COMPLETED") return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800">本次口语练习完成</h3>
      <p className="text-sm text-slate-600">主要改善点：{state.firstAnalysis.mainIssue.description}</p>
      {state.secondAnalysis && <p className="text-sm text-slate-600">重答后：{state.secondAnalysis.summary}</p>}
      <button onClick={handleNewSession} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">再练一题</button>
    </div>
  );
  return null;
}
