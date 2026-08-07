"use client";

import { useState } from "react";
import type { SeedLearningItem } from "@/lib/learning/types";

interface Props {
  content: SeedLearningItem;
  onHintRevealed: () => void;
}

export function WordCard({ content, onHintRevealed }: Props) {
  const [showMeaning, setShowMeaning] = useState(false);

  const handleReveal = () => {
    setShowMeaning(true);
    onHintRevealed();
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{content.term}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span>{content.phonetic}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{content.partOfSpeech}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{content.itemType}</span>
          </div>
        </div>
      </div>

      {/* 核心含义 - 默认隐藏 */}
      <div className="mt-4">
        {showMeaning ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-medium text-emerald-700">核心含义</div>
            <div className="mt-1 text-sm text-slate-800">{content.coreMeaning}</div>
          </div>
        ) : (
          <button
            onClick={handleReveal}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 transition hover:bg-amber-100"
          >
            点击查看核心含义（记为使用提示）
          </button>
        )}
      </div>

      {/* 其他信息始终可见 */}
      <div className="mt-4 space-y-3 text-sm text-slate-700">
        <div>
          <span className="font-medium text-slate-600">使用场景：</span>
          {content.usageContext}
        </div>
        <div>
          <span className="font-medium text-slate-600">常见搭配：</span>
          {content.collocations.join("、")}
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <div className="text-xs font-medium text-slate-500">例句</div>
          <div className="mt-1">{content.exampleSentence}</div>
          <div className="mt-0.5 text-slate-500">{content.exampleTranslation}</div>
        </div>
        {content.commonMistake && (
          <div className="rounded-md border border-rose-100 bg-rose-50 p-3 text-rose-800">
            <span className="font-medium">易混淆：</span>
            {content.commonMistake}
          </div>
        )}
      </div>
    </div>
  );
}
