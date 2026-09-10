import type { BadCase, FailureLayer, FailureSummary, LifecycleDetail, ModuleDetail, TraceDetail } from "@/lib/dashboard/types";
import { MetricValue } from "./MetricValue";

export type OverlayContent =
  | { type: "lifecycle"; detail: LifecycleDetail }
  | { type: "module"; detail: ModuleDetail }
  | { type: "bad_cases"; layer: FailureLayer; cases: BadCase[] }
  | { type: "trace"; layer: FailureLayer; trace: TraceDetail }
  | { type: "all_failures"; failures: FailureSummary[] }
  | { type: "eval" };

export function OverlayHost({
  content,
  onClose,
  onTrace,
  onBack,
  onPickLayer,
}: {
  content: OverlayContent | null;
  onClose: () => void;
  onTrace: (id: string, layer: FailureLayer) => void;
  onBack: (layer: FailureLayer) => void;
  onPickLayer: (layer: FailureLayer) => void;
}) {
  if (!content) return null;
  let title = "详情";
  let subtitle = "保持看板上下文";
  let body: React.ReactNode = null;

  if (content.type === "lifecycle") {
    title = content.detail.title;
    body = (
      <>
        {content.detail.metrics.map((m) => (
          <div className="lxdb-dcard" key={m.label}>
            <b>{m.label}</b>
            <p>
              <MetricValue metric={m.value} />
            </p>
          </div>
        ))}
        {content.detail.notes.map((n) => (
          <div className="lxdb-dcard" key={n}>
            <p>{n}</p>
          </div>
        ))}
      </>
    );
  }

  if (content.type === "module") {
    title = content.detail.title;
    body = (
      <>
        <div className="lxdb-dcard">
          <b>{content.detail.metricLabel}</b>
          <p>{content.detail.definition}</p>
        </div>
        {content.detail.notes.map((n) => (
          <div className="lxdb-dcard" key={n}>
            <p>{n}</p>
          </div>
        ))}
      </>
    );
  }

  if (content.type === "bad_cases") {
    title = "问题样例";
    subtitle = `运行时稳定性 · 问题样例`;
    body = (
      <>
        {content.cases.map((c) => (
          <div className="lxdb-dcard" key={c.id}>
            <b>{c.title}</b>
            <p>{c.resolution}</p>
            <button className="lxdb-back" onClick={() => onTrace(c.traceId, content.layer)}>
              查看链路详情 →
            </button>
          </div>
        ))}
        {content.cases.length === 0 && (
          <div className="lxdb-dcard">
            <p>当前层暂无问题样例。</p>
          </div>
        )}
      </>
    );
  }

  if (content.type === "all_failures") {
    title = "全部失败层";
    subtitle = "按当前统计窗口问题数降序";
    body = (
      <>
        <div className="lxdb-dcard">
          <p>展示全部原始 Failure Layer（UNKNOWN 独立为“待归因”）。点击任意层查看其问题样例。</p>
        </div>
        {content.failures.map((f) => (
          <button className="lxdb-failure" key={f.layer} onClick={() => onPickLayer(f.layer)}>
            <span>{f.label}</span>
            <div className="lxdb-track">
              <div className="lxdb-bar" style={{ width: `${Math.min(100, (f.count.status === "ready" ? f.count.value : 0) * 10)}%` }} />
            </div>
            <b>
              <MetricValue metric={f.count} />
            </b>
          </button>
        ))}
      </>
    );
  }

  if (content.type === "trace") {
    title = "链路详情";
    subtitle = `当前异常层：${content.layer}`;
    body = (
      <>
        <button className="lxdb-back" onClick={() => onBack(content.layer)}>
          ← 返回问题样例
        </button>
        {content.trace.stages.map((s) => (
          <div className="lxdb-tstep" key={s.name}>
            <span className={`lxdb-tdot ${s.status === "fail" ? "lxdb-fail" : ""}`}>{s.status === "fail" ? "×" : "✓"}</span>
            <span>{s.name}</span>
          </div>
        ))}
      </>
    );
  }

  if (content.type === "eval") {
    title = "离线评测分项";
    subtitle = "发布前质量评测";
    body = (
      <>
        {["状态一致性", "知识检索质量", "答案判定准确率", "口语反馈质量", "意图识别准确率"].map((x) => (
          <div className="lxdb-dcard" key={x}>
            <b>{x}</b>
            <p>由最新冻结评测结果提供；首页不堆叠全部分项。</p>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <div className="lxdb-scrim" onClick={onClose} />
      <aside className="lxdb-drawer" role="dialog" aria-modal="true">
        <div className="lxdb-drawhead">
          <div>
            <h3 className="lxdb-drawtitle">{title}</h3>
            <div className="lxdb-drawsub">{subtitle}</div>
          </div>
          <button className="lxdb-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="lxdb-detail">{body}</div>
      </aside>
    </>
  );
}
