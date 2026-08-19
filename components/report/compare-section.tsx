import type { WeekBucket } from "@/lib/client/demo-service";

type Cell = { key: string; label: string; hasActivity: boolean; isToday: boolean };

interface Row {
  k: string;
  thisV: number | null;
  lastV: number | null;
  unit: string;
  isPct: boolean;
}

function display(v: number | null, unit: string, isPct: boolean): string {
  if (v == null) return "—";
  return isPct ? `${v}${unit}` : `${v}${unit}`;
}

export function CompareSection({
  thisWeek,
  lastWeek,
  weeklyActivity,
}: {
  thisWeek: WeekBucket;
  lastWeek: WeekBucket;
  weeklyActivity: Cell[];
}) {
  const rows: Row[] = [
    { k: "新收表达", thisV: thisWeek.newItems, lastV: lastWeek.newItems, unit: "", isPct: false },
    {
      k: "本期复习正确率",
      thisV: thisWeek.reviewAccuracy,
      lastV: lastWeek.reviewAccuracy,
      unit: "%",
      isPct: true,
    },
    { k: "复习次数", thisV: thisWeek.reviews, lastV: lastWeek.reviews, unit: "", isPct: false },
  ];

  const visible = rows.filter((r) => (r.thisV ?? 0) > 0 || (r.lastV ?? 0) > 0);

  return (
    <section>
      <h3 className="section-label">最近七天 · 与前七天</h3>

      {visible.length === 0 ? (
        <p className="lexicon__note">这一周还没有可对比的数据。学习几天后，这里会显示你的变化。</p>
      ) : (
        <>
          <div className="compare">
            {visible.map((r) => {
              const a = r.thisV ?? 0;
              const b = r.lastV ?? 0;
              let delta: { text: string; up: boolean } | null = null;
              if (a > b) delta = { text: `▲ ${a - b}`, up: true };
              else if (a < b) delta = { text: `▼ ${b - a}`, up: false };
              else delta = { text: "持平", up: false };
              return (
                <div className="compare-row" key={r.k}>
                  <span className="compare-row__k">{r.k}</span>
                  <span className="compare-row__v">{display(r.thisV, r.unit, r.isPct)}</span>
                  <span className="compare-row__arrow">
                    → {display(r.lastV, r.unit, r.isPct)}
                  </span>
                  <span
                    className={`compare-row__delta ${delta.up ? "compare-row__delta--up" : "compare-row__delta--flat"}`}
                  >
                    {delta.text}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="week-rule">
            <div className="week-rule__track">
              {weeklyActivity.map((c, i) =>
                c.hasActivity ? (
                  <span
                    key={c.key}
                    className={`week-rule__tick${c.isToday ? " week-rule__tick--today" : ""}`}
                    style={{
                      left: `${weeklyActivity.length > 1 ? (i / (weeklyActivity.length - 1)) * 100 : 0}%`,
                    }}
                    title={c.label}
                  />
                ) : null,
              )}
            </div>
            <p className="week-rule__cap">本期活跃 {thisWeek.activeDays} 天。</p>
          </div>
        </>
      )}
    </section>
  );
}
