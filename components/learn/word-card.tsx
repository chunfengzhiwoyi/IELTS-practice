"use client";

import type { SeedLearningItem } from "@/lib/learning/types";

interface Props {
  content: SeedLearningItem;
  /** 提交后整体揭晓 */
  revealed: boolean;
  /** 回忆阶段是否查看过提示（仅线索，非全答案） */
  hintUsed?: boolean;
  onHint?: () => void;
}

export function WordCard({ content, revealed, hintUsed, onHint }: Props) {
  return (
    <div className="wordcard">
      <div className="wordcard__head">
        <h2 className="wordcard__word">
          {content.term}
          <span className="wordcard__phon">{content.phonetic}</span>
        </h2>
        <div className="wordcard__pills">
          <span className="pill">{content.partOfSpeech}</span>
          <span className="pill">{content.itemType}</span>
        </div>
      </div>

      {!revealed ? (
        <div className="wordcard__recall">
          <p className="wordcard__recall-hint">
            先凭记忆回想它的含义与用法，提交答案后揭晓。
          </p>
          {hintUsed ? (
            <div className="note note--bronze wordcard__clue">
              线索：{content.usageContext.slice(0, 28)}…（已记为使用提示）
            </div>
          ) : (
            onHint && (
              <button type="button" className="btn btn--ghost" onClick={onHint}>
                查看提示（线索）
              </button>
            )
          )}
        </div>
      ) : (
        <div className="wordcard__body">
          <div className="note note--accent">
            <div className="font-ui wordcard__label">核心含义</div>
            <div className="wordcard__meaning">{content.coreMeaning}</div>
          </div>

          <div className="wordcard__row">
            <span className="wordcard__k">使用场景</span>
            <span>{content.usageContext}</span>
          </div>
          <div className="wordcard__row">
            <span className="wordcard__k">常见搭配</span>
            <span>{content.collocations.join("、")}</span>
          </div>

          <div className="note">
            <div className="font-ui wordcard__label">例句</div>
            <div className="wordcard__ex">{content.exampleSentence}</div>
            <div className="wordcard__ex-tr">{content.exampleTranslation}</div>
          </div>

          {content.commonMistake && (
            <div className="note note--bronze">
              <span className="font-ui wordcard__label">易混淆</span>
              <span>{content.commonMistake}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
