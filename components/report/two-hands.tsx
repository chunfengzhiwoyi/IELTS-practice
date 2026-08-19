import Link from "next/link";
import type { ClientReport } from "@/lib/client/demo-service";

export function TwoHands({ report }: { report: ClientReport }) {
  const { correctIndependent, correctWithHint, incorrect, reviewTotal, totalItems, speaking } = report;

  const vocabJudgment =
    reviewTotal === 0
      ? "还没有复习记录。"
      : correctIndependent >= correctWithHint + incorrect
        ? "大部分内容你已经能独立想起来了。"
        : "还有一些内容需要巩固。";

  return (
    <section>
      <h3 className="section-label">词汇 · 与 · 口语</h3>

      {/* 词汇与记忆 */}
      <div className="entry">
        <div className="entry__body" style={{ gridColumn: "1 / 3" }}>
          <h3>词汇 · 记忆</h3>
          <p>
            本期复习 {reviewTotal} 次 ——{" "}
            <b className="text-pos">独立想起 {correctIndependent}</b> ·{" "}
            <b className="text-warn">需要提示 {correctWithHint}</b> ·{" "}
            <b className="text-neg">还没想起 {incorrect}</b>。
          </p>
          <p>{vocabJudgment}</p>
        </div>
        <Link href="/review" className="entry__more">
          去复习 →
        </Link>
      </div>

      {/* 口语表达 */}
      <div className="entry">
        <div className="entry__body" style={{ gridColumn: "1 / 3" }}>
          <h3>口语表达</h3>
          {speaking.completedCount > 0 ? (
            <>
              <p>
                本期完成 {speaking.completedCount} 次 · 平均每次 {speaking.avgWordCount} 词 · 最长{" "}
                {speaking.maxWordCount} 词 · 用到 {speaking.avgConnectors} 个连接词。
              </p>
              {speaking.topIssue && (
                <p>
                  「{speaking.topIssue.label}」出现 {speaking.topIssue.count} 次 —— 下次重点：
                  {speaking.topIssue.suggestion}
                </p>
              )}
              {speaking.retryImprovement && (
                <p>重答后平均多说 {speaking.retryImprovement.avgWordDelta} 词。</p>
              )}
            </>
          ) : (
            <p>还没有口语记录。你的词库已经有 {totalItems} 条，其中一部分可以直接用在口语里。</p>
          )}
        </div>
        <Link href="/speaking" className="entry__more">
          去练一题 →
        </Link>
      </div>
    </section>
  );
}
