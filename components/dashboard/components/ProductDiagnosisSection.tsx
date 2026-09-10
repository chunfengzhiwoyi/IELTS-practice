import type { FailureLayer, FailureSummary, ModuleId, ProductDiagnosisData } from "@/lib/dashboard/types";
import { useState } from "react";
import { MetricValue } from "./MetricValue";
import { Trend } from "./MetricValue";

const TOP_N = 5;

function countOf(f: FailureSummary): number {
  return f.count.status === "ready" || f.count.status === "zero" || f.count.status === "stale" ? f.count.value : 0;
}

export function ProductDiagnosisSection({
  data,
  onModule,
  onFailure,
  onEvalDetail,
  onShowAllLayers,
}: {
  data: ProductDiagnosisData;
  onModule: (id: ModuleId) => void;
  onFailure: (l: FailureLayer) => void;
  onEvalDetail: () => void;
  onShowAllLayers: () => void;
}) {
  const [tab, setTab] = useState<"offline" | "runtime">("offline");
  const failures = [...data.aiQuality.runtime.failures].sort((a, b) => countOf(b) - countOf(a));
  const top = failures.slice(0, TOP_N);
  const rest = failures.slice(TOP_N);
  const restCount = rest.reduce((sum, f) => sum + countOf(f), 0);

  return (
    <section className="lxdb-section">
      <div className="lxdb-sechead">
        <div>
          <div className="lxdb-num">04</div>
          <h2 className="lxdb-h2">产品诊断</h2>
          <div className="lxdb-desc">先定位哪个产品环节不健康，再判断是用户行为还是 AI 运行问题。</div>
        </div>
      </div>
      <div className="lxdb-diag">
        <div className="lxdb-panel">
          <div className="lxdb-ptitle">功能表现</div>
          <div className="lxdb-psub">每个模块只展示一个有明确分母的核心成功指标</div>
          <div className="lxdb-ftable">
            {data.features.map((f) => (
              <button className="lxdb-frow" key={f.moduleId} onClick={() => onModule(f.moduleId)}>
                <div>
                  <div className="lxdb-fname">{f.moduleLabel}</div>
                  <div className="lxdb-fmetric">{f.metricLabel}</div>
                </div>
                <div className="lxdb-fvalue">
                  <MetricValue metric={f.value} suffix={f.value.status === "ready" && f.trend?.unit === "pct" ? "%" : ""} />
                </div>
                <div className="lxdb-fmini">
                  <Trend series={f.trend} />
                </div>
                <div className="lxdb-fstatus">{f.value.status === "ready" ? "可计算" : "需新增埋点"}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="lxdb-panel">
          <div className="lxdb-ptitle">AI 运行质量</div>
          <div className="lxdb-psub">离线评测与真实请求运行状态分开查看</div>
          <div className="lxdb-tabs">
            <button className={tab === "offline" ? "lxdb-tab lxdb-active" : "lxdb-tab"} onClick={() => setTab("offline")}>
              离线评测
            </button>
            <button className={tab === "runtime" ? "lxdb-tab lxdb-active" : "lxdb-tab"} onClick={() => setTab("runtime")}>
              运行时稳定性
            </button>
          </div>
          {tab === "offline" ? (
            <div className="lxdb-evalbox">
              <div className="lxdb-evalnote">用于发布前质量把关；首页只保留最关键的两个结果。</div>
              <div className="lxdb-evalhero">
                <div className="lxdb-ecard">
                  <div className="lxdb-elabel">评测通过率</div>
                  <div className="lxdb-enum">
                    <MetricValue metric={data.aiQuality.offline.passRate} suffix="%" />
                  </div>
                </div>
                <div className="lxdb-ecard">
                  <div className="lxdb-elabel">关键失败率</div>
                  <div className="lxdb-enum">
                    <MetricValue metric={data.aiQuality.offline.criticalFailureRate} suffix="%" />
                  </div>
                </div>
              </div>
              <button className="lxdb-dlink" onClick={onEvalDetail}>
                查看评测分项 →
              </button>
            </div>
          ) : (
            <div className="lxdb-evalbox">
              <div className="lxdb-rumstate">{data.aiQuality.runtime.persistenceNote}</div>
              {top.map((f) => (
                <button className="lxdb-failure" key={f.layer} onClick={() => onFailure(f.layer)}>
                  <span>{f.label}</span>
                  <div className="lxdb-track">
                    <div className="lxdb-bar" style={{ width: `${Math.min(100, countOf(f) * 10)}%` }} />
                  </div>
                  <b>
                    <MetricValue metric={f.count} />
                  </b>
                </button>
              ))}
              {rest.length > 0 && (
                <button className="lxdb-failure" onClick={onShowAllLayers}>
                  <span>其他 {rest.length} 类</span>
                  <div className="lxdb-track">
                    <div className="lxdb-bar" style={{ width: `${Math.min(100, restCount * 10)}%` }} />
                  </div>
                  <b>{restCount} 个问题</b>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
