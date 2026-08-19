import type { LedePart } from "@/lib/client/report-narrative";

export function ReportLede({
  parts,
  marginalia,
}: {
  parts: LedePart[];
  marginalia: { range: string; newItems: number; reviews: number; activeDays: number };
}) {
  return (
    <section className="lede">
      <div className="lede__main">
        <p className="pullquote">
          {parts.map((p, i) =>
            p.em ? (
              <em key={i}>{p.t}</em>
            ) : (
              <span key={i}>{p.t}</span>
            ),
          )}
        </p>
      </div>
      <dl className="marginalia">
        <div className="marginalia__row">
          <dt className="marginalia__k">本期</dt>
          <dd className="marginalia__v">{marginalia.range}</dd>
        </div>
        <div className="marginalia__row">
          <dt className="marginalia__k">新收</dt>
          <dd className="marginalia__v">{marginalia.newItems}</dd>
        </div>
        <div className="marginalia__row">
          <dt className="marginalia__k">复习</dt>
          <dd className="marginalia__v">
            {marginalia.reviews}
            <em>次</em>
          </dd>
        </div>
        <div className="marginalia__row">
          <dt className="marginalia__k">活跃</dt>
          <dd className="marginalia__v">
            {marginalia.activeDays}
            <em>天</em>
          </dd>
        </div>
      </dl>
    </section>
  );
}
