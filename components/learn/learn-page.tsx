"use client";

import { useState } from "react";

import type { LearnSubmitResponse, WordCardResponse } from "@/lib/learning/types";
import { getWordCard, submitLearnAnswer, saveItemToCache } from "@/lib/client/demo-service";
import { LearningResult } from "@/components/learn/learning-result";
import { RecallTask } from "@/components/learn/recall-task";
import { TermInput } from "@/components/learn/term-input";
import { WordCard } from "@/components/learn/word-card";

type PageState =
  | { kind: "EMPTY" }
  | { kind: "LOADING_CARD" }
  | { kind: "CARD_READY"; card: WordCardResponse; usedHint: boolean }
  | { kind: "SUBMITTING"; card: WordCardResponse }
  | { kind: "RESULT_SUCCESS"; result: LearnSubmitResponse; card: WordCardResponse }
  | { kind: "ITEM_NOT_FOUND"; term: string }
  | { kind: "REQUEST_ERROR"; message: string };

const INPUT_STATES: PageState["kind"][] = [
  "EMPTY",
  "LOADING_CARD",
  "ITEM_NOT_FOUND",
  "REQUEST_ERROR",
];

export function LearnPage() {
  const [state, setState] = useState<PageState>({ kind: "EMPTY" });

  const showInput = INPUT_STATES.includes(state.kind);

  const handleTermSubmit = async (term: string) => {
    setState({ kind: "LOADING_CARD" });
    try {
      // 1. 先尝试本地（seed + els_items 缓存）
      const localResult = await getWordCard(term);
      if (localResult.ok) {
        setState({ kind: "CARD_READY", card: localResult.data, usedHint: false });
        return;
      }

      // 2. 本地没有 → 调服务端 API Route（seed 再检查一次 + LLM 生成）
      const res = await fetch("/api/learn/card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.error?.kind === "DEMO_ITEM_NOT_FOUND" || json?.error?.kind === "MODEL_ERROR" || res.status === 404 || res.status === 502) {
          setState({ kind: "ITEM_NOT_FOUND", term });
          return;
        }
        setState({ kind: "REQUEST_ERROR", message: json?.error?.message ?? `错误 ${res.status}` });
        return;
      }

      const card = json as WordCardResponse;

      // 3. LLM 生成的词卡 → 保存到 localStorage els_items 缓存
      if (card.item.contentJson && !card.item.id.startsWith("seed-")) {
        saveItemToCache(card.item.contentJson);
      }

      setState({ kind: "CARD_READY", card, usedHint: false });
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
      setState({ kind: "RESULT_SUCCESS", result, card });
    } catch (err) {
      setState({ kind: "REQUEST_ERROR", message: err instanceof Error ? err.message : "提交失败" });
    }
  };

  const handleContinue = () => {
    setState({ kind: "EMPTY" });
  };

  return (
    <div className="space-y-6">
      {showInput && (
        <TermInput
          onSubmit={handleTermSubmit}
          disabled={state.kind === "LOADING_CARD"}
        />
      )}

      {state.kind === "LOADING_CARD" && (
        <div className="py-8 text-center text-sm text-ink-meta">
          <div className="rec-dot mx-auto"></div>
          <p className="mt-3">正在查找词条…不在本地词库时将由 AI 生成词卡（约 5-15 秒）</p>
        </div>
      )}

      {state.kind === "CARD_READY" && (
        <>
          <div className="flex items-center justify-between">
            <span className="section-label">新词学习</span>
            <button onClick={handleContinue} className="btn btn--quiet btn--sm">换个词</button>
          </div>
          <WordCard
            content={state.card.item.contentJson}
            revealed={false}
            hintUsed={state.usedHint}
            onHint={handleHintRevealed}
          />
          {state.card.alreadyLearned && (
            <div className="note note--bronze text-sm">
              你之前已经学过这个词条。再次练习会创建新的学习记录。
            </div>
          )}
          <RecallTask prompt={state.card.task.prompt} onSubmit={handleRecallSubmit} />
        </>
      )}

      {state.kind === "SUBMITTING" && (
        <div className="py-4 text-center text-sm text-ink-meta">提交中…</div>
      )}

      {state.kind === "RESULT_SUCCESS" && (
        <>
          <WordCard content={state.card.item.contentJson} revealed />
          <LearningResult result={state.result} onContinue={handleContinue} />
        </>
      )}

      {state.kind === "ITEM_NOT_FOUND" && (
        <div className="note note--bronze">
          <p className="font-medium text-ink">词库中未找到「{state.term}」</p>
          <p className="mt-1 text-sm">Demo 模式仅支持预设词条。试试：sustainable、take something for granted、play a vital role 等。</p>
          <button onClick={handleContinue} className="btn btn--quiet mt-2">换一个词</button>
        </div>
      )}

      {state.kind === "REQUEST_ERROR" && (
        <div className="note note--accent">
          <p className="font-medium text-ink">请求失败</p>
          <p className="mt-1 text-sm">{state.message}</p>
          <button onClick={handleContinue} className="btn btn--quiet mt-2">重试</button>
        </div>
      )}
    </div>
  );
}
