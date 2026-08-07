"use client";

import { useState } from "react";

import type { LearnSubmitResponse, WordCardResponse } from "@/lib/learning/types";
import { submitLearnAnswer } from "@/lib/client/demo-service";
import { LearningResult } from "@/components/learn/learning-result";
import { RecallTask } from "@/components/learn/recall-task";
import { TermInput } from "@/components/learn/term-input";
import { WordCard } from "@/components/learn/word-card";

type PageState =
  | { kind: "EMPTY" }
  | { kind: "LOADING_CARD" }
  | { kind: "CARD_READY"; card: WordCardResponse; usedHint: boolean }
  | { kind: "SUBMITTING"; card: WordCardResponse }
  | { kind: "RESULT_SUCCESS"; result: LearnSubmitResponse }
  | { kind: "ITEM_NOT_FOUND"; term: string }
  | { kind: "REQUEST_ERROR"; message: string };

export function LearnPage() {
  const [state, setState] = useState<PageState>({ kind: "EMPTY" });

  const handleTermSubmit = async (term: string) => {
    setState({ kind: "LOADING_CARD" });
    try {
      // 调用服务端 API Route（服务端检查 seed，miss 时调 DeepSeek）
      const res = await fetch("/api/learn/card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.error?.kind === "DEMO_ITEM_NOT_FOUND" || res.status === 404) {
          // seed miss 且 LLM 也失败时
          setState({ kind: "ITEM_NOT_FOUND", term });
          return;
        }
        setState({ kind: "REQUEST_ERROR", message: json?.error?.message ?? `错误 ${res.status}` });
        return;
      }
      setState({ kind: "CARD_READY", card: json as WordCardResponse, usedHint: false });
    } catch (err) {
      setState({ kind: "REQUEST_ERROR", message: err instanceof Error ? err.message : "网络错误" });
    }
  };

  const handleHintRevealed = () => {
    if (state.kind === "CARD_READY") {
      setState({ ...state, usedHint: true });
    }
  };

  const handleRecallSubmit = async (answer: string) => {
    if (state.kind !== "CARD_READY") return;
    const { card, usedHint } = state;
    setState({ kind: "SUBMITTING", card });
    try {
      const result = await submitLearnAnswer({
        itemId: card.item.id,
        answer,
        usedHint,
      });
      setState({ kind: "RESULT_SUCCESS", result });
    } catch (err) {
      setState({ kind: "REQUEST_ERROR", message: err instanceof Error ? err.message : "提交失败" });
    }
  };

  const handleContinue = () => {
    setState({ kind: "EMPTY" });
  };

  return (
    <div className="space-y-6">
      <TermInput
        onSubmit={handleTermSubmit}
        disabled={state.kind === "LOADING_CARD" || state.kind === "SUBMITTING"}
      />

      {state.kind === "LOADING_CARD" && (
        <div className="py-8 text-center text-sm text-slate-500">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"></div>
          <p className="mt-2">正在查找词条…不在本地词库时将由 AI 生成词卡（约 5-15 秒）</p>
        </div>
      )}

      {state.kind === "CARD_READY" && (
        <>
          <WordCard content={state.card.item.contentJson} onHintRevealed={handleHintRevealed} />
          {state.card.alreadyLearned && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              你之前已经学过这个词条。再次练习会创建新的学习记录。
            </div>
          )}
          <RecallTask prompt={state.card.task.prompt} onSubmit={handleRecallSubmit} />
        </>
      )}

      {state.kind === "SUBMITTING" && (
        <div className="py-4 text-center text-sm text-slate-500">提交中…</div>
      )}

      {state.kind === "RESULT_SUCCESS" && (
        <LearningResult result={state.result} onContinue={handleContinue} />
      )}

      {state.kind === "ITEM_NOT_FOUND" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">词库中未找到「{state.term}」</p>
          <p className="mt-1 text-xs">Demo 模式仅支持预设词条。试试：sustainable、take something for granted、play a vital role 等。</p>
          <button onClick={handleContinue} className="mt-2 text-xs text-brand-600 underline">换一个词</button>
        </div>
      )}

      {state.kind === "REQUEST_ERROR" && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-medium">请求失败</p>
          <p className="mt-1">{state.message}</p>
          <button onClick={handleContinue} className="mt-2 text-xs text-brand-600 underline">重试</button>
        </div>
      )}
    </div>
  );
}
