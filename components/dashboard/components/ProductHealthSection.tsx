import type { ProductHealthData } from "@/lib/dashboard/types";
import { DashboardIcon } from "./DashboardIcon";
import { MetricValue, Trend } from "./MetricValue";

export function ProductHealthSection({ data }: { data: ProductHealthData }) {
  return (
    <section className="lxdb-section">
      <div className="lxdb-sechead">
        <div>
          <div className="lxdb-num">01</div>
          <h2 className="lxdb-h2">产品健康</h2>
          <div className="lxdb-desc">产品有没有真正产生核心价值，并把首次使用转化为持续学习？</div>
        </div>
        <div className="lxdb-pill">主值与趋势同口径</div>
      </div>
      <div className="lxdb-health">
        {data.metrics.map((m, i) => (
          <article className={`lxdb-metric ${i === 0 ? "lxdb-hero" : ""}`} key={m.id}>
            <div className="lxdb-mhead">
              <div className={`lxdb-iconbox ${i >= 2 ? "lxdb-teal" : ""}`}>
                <DashboardIcon kind={m.iconKey} />
              </div>
              <div className="lxdb-mlabel">{m.label}</div>
            </div>
            <div>
              <span className="lxdb-val">
                <MetricValue metric={m.value} suffix={m.id.includes("rate") ? "%" : ""} />
              </span>
              {m.value.status === "ready" && m.value.delta != null && (
                <span className="lxdb-delta">
                  ↑{m.value.delta}
                  {m.value.deltaUnit === "pp" ? " 个百分点" : "%"}
                </span>
              )}
            </div>
            <div className="lxdb-cap">{m.trend?.label ?? m.description}</div>
            <Trend series={m.trend} color={["#5962da", "#3289e8", "#20a77a", "#20a77a"][i]} />
          </article>
        ))}
      </div>
    </section>
  );
}
