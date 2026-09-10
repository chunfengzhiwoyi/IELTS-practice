import type { SystemKnowledgeData } from "@/lib/dashboard/types";

export function SystemKnowledgeSection({ data }: { data: SystemKnowledgeData }) {
  return (
    <section className="lxdb-section">
      <div className="lxdb-sechead">
        <div>
          <div className="lxdb-num">05</div>
          <h2 className="lxdb-h2">系统与知识</h2>
          <div className="lxdb-desc">只展示支撑产品运行的能力状态，不把工程状态包装成业务指标。</div>
        </div>
        <div className="lxdb-pill">能力状态</div>
      </div>
      <div className="lxdb-sysgrid">
        {data.capabilities.map((c) => (
          <article className="lxdb-rcard" key={c.id}>
            <div className="lxdb-rlabel">{c.label}</div>
            <div className={`lxdb-rvalue ${c.status === "partial" || c.status === "not_instrumented" ? "lxdb-warn" : ""}`}>
              {c.statusLabel}
            </div>
            <div className="lxdb-rnote">{c.detail}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
