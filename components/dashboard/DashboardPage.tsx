"use client";

/**
 * DashboardPage — P2.1 Visual Parity。
 * 所有类名 lxdb- 命名空间，root 为 .lxdb；不再依赖 host 字体/元素继承。
 */
import { useEffect, useRef, useState } from "react";
import type {
  DashboardData,
  DashboardRange,
  FailureLayer,
  ImpactMetricId,
  LifecycleStageId,
  ModuleId,
} from "@/lib/dashboard/types";
import type { DashboardRepository } from "@/lib/dashboard/dashboard.repository";
import { DashboardHeader } from "./components/DashboardHeader";
import { ProductHealthSection } from "./components/ProductHealthSection";
import { LifecycleSection } from "./components/LifecycleSection";
import { LearningImpactSection } from "./components/LearningImpactSection";
import { ProductDiagnosisSection } from "./components/ProductDiagnosisSection";
import { SystemKnowledgeSection } from "./components/SystemKnowledgeSection";
import { OverlayHost, type OverlayContent } from "./components/OverlayHost";
import "./dashboard.css";

export function DashboardPage({ repository }: { repository: DashboardRepository }) {
  const [range, setRange] = useState<DashboardRange>("7d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [phase, setPhase] = useState<"initial_loading" | "refreshing" | "ready">("initial_loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayContent | null>(null);
  const [popover, setPopover] = useState<{ id: ImpactMetricId; left: number; top: number } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    let alive = true;
    setPopover(null);
    setLoadError(null);
    setPhase(first.current ? "initial_loading" : "refreshing");
    repository
      .getDashboard(range)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setPhase("ready");
        first.current = false;
      })
      .catch((e: unknown) => {
        if (!alive) return;
        // DASHBOARD-DEPLOY-FIX-01：兜底错误态，避免 401/5xx 时无限 loading。
        // 401 由服务端 auth guard（app/dashboard/layout.tsx）处理并 redirect /login；
        // 此处仅保证任何失败都有明确反馈。
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg.includes("401") ? "请先登录查看数据看板" : "数据看板加载失败，请稍后重试");
        setPhase("ready");
      });
    return () => {
      alive = false;
    };
  }, [range, repository]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (popover) setPopover(null);
        else setOverlay(null);
      }
    };
    const scroll = () => setPopover(null);
    addEventListener("keydown", esc);
    addEventListener("scroll", scroll, true);
    return () => {
      removeEventListener("keydown", esc);
      removeEventListener("scroll", scroll, true);
    };
  }, [popover]);

  if (!data) {
    return (
      <div className="lxdb">
        {loadError ? (
          <div className="lxdb-error" role="alert">
            <strong>{loadError}</strong>
            <p>
              <a href="/login">前往登录</a>
              <span> · </span>
              <a href="/dashboard">重新加载</a>
            </p>
          </div>
        ) : (
          <div className="lxdb-load">
            <div>灵犀 IELTS</div>
            <strong>产品数据看板</strong>
          </div>
        )}
      </div>
    );
  }

  const openLifecycle = async (id: LifecycleStageId) =>
    setOverlay({ type: "lifecycle", detail: await repository.getLifecycleDetail(id, range) });
  const openModule = async (id: ModuleId) => setOverlay({ type: "module", detail: await repository.getModuleDetail(id, range) });
  const openFailure = async (layer: FailureLayer) =>
    setOverlay({ type: "bad_cases", layer, cases: await repository.getBadCases(layer, range) });
  const openTrace = async (id: string, layer: FailureLayer) =>
    setOverlay({ type: "trace", layer, trace: await repository.getTrace(id) });

  const impactDetail = data.learningImpact.metrics.find((m) => m.id === popover?.id);
  const mainClass =
    phase === "initial_loading" ? "lxdb-main" : phase === "refreshing" ? "lxdb-main lxdb-refreshing" : "lxdb-main";

  return (
    <div className="lxdb">
      <main className={mainClass}>
        <div className="lxdb-shell">
          <DashboardHeader range={range} onRangeChange={setRange} status={phase === "ready" ? "页面数据已就绪" : phase === "refreshing" ? "更新中" : "同步中"} />
          <ProductHealthSection data={data.health} />
          <LifecycleSection data={data.lifecycle} onOpen={openLifecycle} />
          <LearningImpactSection
            data={data.learningImpact}
            onOpen={(id, el) => {
              const r = el.getBoundingClientRect();
              const below = r.bottom + 10;
              const left = Math.max(16, Math.min(window.innerWidth - 326, r.left));
              setPopover({ id, left, top: below + 145 < window.innerHeight ? below : Math.max(16, r.top - 150) });
            }}
          />
          <ProductDiagnosisSection
            data={data.diagnosis}
            onModule={openModule}
            onFailure={openFailure}
            onEvalDetail={() => setOverlay({ type: "eval" })}
            onShowAllLayers={() =>
              setOverlay({ type: "all_failures", failures: [...data.diagnosis.aiQuality.runtime.failures] })
            }
          />
          <SystemKnowledgeSection data={data.system} />
        </div>
        {popover && impactDetail && (
          <div className="lxdb-pop" style={{ left: popover.left, top: popover.top }}>
            <button className="lxdb-popclose" onClick={() => setPopover(null)}>
              ×
            </button>
            <h4>{impactDetail.label}</h4>
            <p>{impactDetail.definition}</p>
            <p>来源：{impactDetail.sourceLabel}</p>
          </div>
        )}
        <OverlayHost
          content={overlay}
          onClose={() => setOverlay(null)}
          onTrace={openTrace}
          onBack={openFailure}
          onPickLayer={openFailure}
        />
      </main>
    </div>
  );
}
