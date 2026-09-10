import type { LifecycleData, LifecycleStageId, RetentionCell } from "@/lib/dashboard/types";
import { DashboardIcon } from "./DashboardIcon";
import { MetricValue } from "./MetricValue";

/**
 * P2.1.1：唯一 stage→icon 映射常量。React 不按位置选 icon，五个 stage 与 FINAL_MASTER 一一对应。
 */
export const LIFECYCLE_STAGE_ICON: Record<LifecycleStageId, "first_use" | "activate" | "return" | "retention" | "habit"> = {
  first_use: "first_use",
  activation: "activate",
  return: "return",
  d7_retention: "retention",
  habit: "habit",
};
const heights = [112, 102, 87, 80, 72];

function heatClass(value: number): string {
  if (value >= 65) return "lxdb-heat6";
  if (value >= 60) return "lxdb-heat5";
  if (value >= 47) return "lxdb-heat4";
  if (value >= 40) return "lxdb-heat3";
  return "lxdb-heat2";
}

function Cell({ cell }: { cell: RetentionCell }) {
  if (cell.status === "ready")
    return (
      <div className={`lxdb-mcell ${heatClass(cell.value)}`}>
        {cell.value}%
      </div>
    );
  if (cell.status === "immature") return <div className="lxdb-mcell lxdb-immature">未成熟</div>;
  return <div className="lxdb-mcell lxdb-immature">数据不足</div>;
}

export function LifecycleSection({
  data,
  onOpen,
}: {
  data: LifecycleData;
  onOpen: (id: LifecycleStageId) => void;
}) {
  return (
    <section className="lxdb-section">
      <div className="lxdb-sechead">
        <div>
          <div className="lxdb-num">02</div>
          <h2 className="lxdb-h2">用户学习生命周期</h2>
          <div className="lxdb-desc">不看单次任务完成，而看用户是否从首次使用走向持续学习。</div>
        </div>
        <div className="lxdb-pill">仅统计成熟用户组</div>
      </div>
      <div className="lxdb-lifegrid">
        <div className="lxdb-lcmain">
          <div className="lxdb-stages">
            {data.stages.map((s, i) => (
              <button className="lxdb-stage" key={s.id} onClick={() => onOpen(s.id)}>
                <div className="lxdb-stagehead">
                  <div className="lxdb-sname">{s.label}</div>
                  <div className="lxdb-sicon">
                    <DashboardIcon kind={LIFECYCLE_STAGE_ICON[s.id]} />
                  </div>
                </div>
                <div className="lxdb-conv">
                  {s.rate
                    ? `${s.rateLabel} ${s.rate.status === "ready" ? s.rate.value : "—"}%`
                    : s.rateLabel}
                </div>
                <div className="lxdb-stagevis">
                  <div className="lxdb-shape" style={{ height: heights[i] }} />
                </div>
                <div className="lxdb-stageval">
                  <div className="lxdb-fnum">
                    <MetricValue metric={s.count} />
                  </div>
                  <div className="lxdb-fsub">{s.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="lxdb-mattitle">用户组留存矩阵</div>
          <div className="lxdb-matrix">
            <div className="lxdb-mcell lxdb-head">激活周</div>
            <div className="lxdb-mcell lxdb-head">人数</div>
            <div className="lxdb-mcell lxdb-head">次日</div>
            <div className="lxdb-mcell lxdb-head">第3日</div>
            <div className="lxdb-mcell lxdb-head">第7日</div>
            <div className="lxdb-mcell lxdb-head">稳定学习</div>
            {data.cohorts.flatMap((row) => [
              <div className="lxdb-mcell" key={row.cohortLabel + "l"}>
                {row.cohortLabel}
              </div>,
              <div className="lxdb-mcell" key={row.cohortLabel + "n"}>
                {row.activatedN}
              </div>,
              ...([row.d1, row.d3, row.d7, row.habit] as const).map((c, j) => <Cell cell={c} key={row.cohortLabel + j} />),
            ])}
          </div>
        </div>
        <aside className="lxdb-bneck">
          <div className="lxdb-bkicker">关键流失环节</div>
          <div className="lxdb-btitle">{data.insight.title}</div>
          <div className="lxdb-brate">
            <MetricValue metric={data.insight.value} suffix="%" />
          </div>
          <div className="lxdb-btext">{data.insight.explanation}</div>
        </aside>
      </div>
    </section>
  );
}
