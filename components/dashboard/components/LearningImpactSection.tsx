import type { ImpactMetricId, LearningImpactData } from "@/lib/dashboard/types";
import { MetricValue, Trend } from "./MetricValue";

export function LearningImpactSection({
  data,
  onOpen,
}: {
  data: LearningImpactData;
  onOpen: (id: ImpactMetricId, el: HTMLElement) => void;
}) {
  return (
    <section className="lxdb-section">
      <div className="lxdb-sechead">
        <div>
          <div className="lxdb-num">03</div>
          <h2 className="lxdb-h2">学习效果</h2>
          <div className="lxdb-desc">用可验证的学习结果判断“是否学会”，不同证据不直接横向排名。</div>
        </div>
        <div className="lxdb-pill">仅展示可验证指标</div>
      </div>
      <div className="lxdb-strength">
        <span>即时改善</span>
        <div className="lxdb-sline" />
        <span>无提示验证</span>
        <div className="lxdb-sline" />
        <span>跨时间验证</span>
        <div className="lxdb-sline" />
        <span>跨情境验证</span>
      </div>
      <div className="lxdb-impacts">
        {data.metrics.map((m) => (
          <button
            className={`lxdb-impact ${m.value.status === "not_instrumented" ? "lxdb-muted" : ""}`}
            key={m.id}
            onClick={(e) => onOpen(m.id, e.currentTarget)}
          >
            <div className="lxdb-elevel">{m.evidenceLabel}</div>
            <h3 className="lxdb-ih3">{m.label}</h3>
            <div className="lxdb-ival">
              <MetricValue metric={m.value} suffix={m.value.status === "ready" ? "%" : ""} />
            </div>
            <div className="lxdb-sample">
              {m.value.status === "ready" && m.value.sampleSize
                ? `有效样本 ${m.value.sampleSize} · 来源：${m.sourceLabel}`
                : `${m.sourceLabel}`}
            </div>
            <div className="lxdb-idef">{m.definition}</div>
            <span className={`lxdb-badge ${m.value.status === "not_instrumented" ? "lxdb-muted" : ""}`}>
              {m.value.status === "ready" ? "可计算" : m.value.status === "not_instrumented" ? "尚未采集" : "当前不可用"}
            </span>
            <Trend series={m.trend} />
          </button>
        ))}
      </div>
    </section>
  );
}
