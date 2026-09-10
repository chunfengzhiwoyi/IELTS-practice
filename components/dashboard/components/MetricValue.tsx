import type { Metric, TrendSeries } from "@/lib/dashboard/types";

export function MetricValue({ metric, suffix = "" }: { metric: Metric<number>; suffix?: string }) {
  if (metric.status === "ready" || metric.status === "zero" || metric.status === "stale")
    return (
      <>
        {metric.value}
        {suffix}
      </>
    );
  if (metric.status === "insufficient") return <>数据不足</>;
  if (metric.status === "not_instrumented") return <>尚未采集</>;
  if (metric.status === "not_connected") return <>待接入</>;
  return <>暂时无法加载</>;
}

export function Trend({ series, color }: { series: TrendSeries | null; color?: string }) {
  if (!series) return <div className="lxdb-fmini-empty">暂无线图</div>;
  const values = series.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values
    .map((v, i) => `${2 + i * (101 / (values.length - 1))},${29 - ((v - min) / span) * 23}`)
    .join(" ");
  return (
    <svg className="lxdb-spark" style={color ? { color } : undefined} viewBox="0 0 105 33" aria-label={series.label}>
      <polyline points={points} />
      <circle cx="103" cy={29 - ((values[values.length - 1]! - min) / span) * 23} r="2.6" />
    </svg>
  );
}
