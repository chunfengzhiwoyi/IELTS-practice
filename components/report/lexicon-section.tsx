import Link from "next/link";
import type { LexiconEntry } from "@/lib/client/demo-service";

export function LexiconSection({
  totalItems,
  recent,
  attention,
}: {
  totalItems: number;
  recent: LexiconEntry[];
  attention: LexiconEntry[];
}) {
  const shown = recent.slice(0, 24);
  const rest = recent.slice(24);

  return (
    <section>
      <h3 className="section-label">
        <span>本期词库</span>
        <span
          style={{
            marginLeft: "auto",
            color: "var(--ink-meta)",
            fontFamily: "var(--font-ui)",
            fontSize: "0.8125rem",
            letterSpacing: "0.04em",
          }}
        >
          共 {totalItems} 条
        </span>
      </h3>

      {recent.length === 0 ? (
        <p className="lexicon__note">这一周还没有新收的词。去「学习」收下第一个。</p>
      ) : (
        <>
          <div className="lexicon">
            {shown.map((e, i) => (
              <Link
                key={e.itemId}
                href={`/review?item=${e.itemId}`}
                className="lexicon__term"
                style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
              >
                {e.term}
              </Link>
            ))}
          </div>
          {rest.length > 0 && (
            <details className="lexicon-preview">
              <summary>还有 {rest.length} 个</summary>
              <div className="lexicon">
                {rest.map((e, i) => (
                  <Link
                    key={e.itemId}
                    href={`/review?item=${e.itemId}`}
                    className="lexicon__term"
                    style={{ animationDelay: `${Math.min((24 + i) * 40, 400)}ms` }}
                  >
                    {e.term}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {attention.length > 0 && (
        <div className="ability-shelf" style={{ marginTop: 28 }}>
          {attention.map((e, i) => (
            <div className="entry" key={e.itemId}>
              <span className="folio">{i + 1}</span>
              <div className="entry__body">
                <h3>{e.term}</h3>
                <p>{e.reason}</p>
              </div>
              <Link href={`/review?item=${e.itemId}`} className="entry__more">
                复习 →
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
