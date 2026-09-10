import type { DashboardRange } from "@/lib/dashboard/types";

export function DashboardHeader({
  range,
  onRangeChange,
  status,
}: {
  range: DashboardRange;
  onRangeChange: (r: DashboardRange) => void;
  status: string;
}) {
  const syncing = status !== "页面数据已就绪";
  return (
    <header className="lxdb-topbar">
      <div>
        <div className="lxdb-brand">灵犀 IELTS</div>
        <h1 className="lxdb-title">产品数据看板</h1>
        <div className="lxdb-sub">观察核心价值、持续学习、学习效果与 AI 运行质量</div>
      </div>
      <div className="lxdb-topright">
        <div className="lxdb-proto">原型示意数据 · 非生产指标</div>
        <div className="lxdb-controls">
          <div className="lxdb-seg">
            {(["7d", "30d", "all"] as DashboardRange[]).map((r) => (
              <button key={r} className={range === r ? "lxdb-active" : ""} onClick={() => onRangeChange(r)}>
                {r === "7d" ? "最近7天" : r === "30d" ? "最近30天" : "全部"}
              </button>
            ))}
          </div>
          <div className={syncing ? "lxdb-status lxdb-syncing" : "lxdb-status"}>
            <i />
            <span>{status}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
