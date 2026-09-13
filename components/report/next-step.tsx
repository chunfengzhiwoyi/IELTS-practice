import type { NextStep } from "@/lib/client/report-narrative";

/**
 * LEARNING-REPORT-ONLINEIZATION-01：dashboard-only 部署下学习动作路由已冻结，
 * 只展示推荐结论（title/sub 由真实数据推导），不再渲染指向 /learn /review /speaking 的入口。
 */
export function NextStep({ nextStep }: { nextStep: NextStep }) {
  return (
    <section className="today-zone">
      <span className="section-label" style={{ margin: 0 }}>
        下一步
      </span>
      <h2 className="today-zone__title" style={{ marginTop: 10 }}>
        {nextStep.title}
      </h2>
      <p className="today-zone__sub">{nextStep.sub}</p>
      <p className="today-zone__sub" style={{ marginTop: 8 }}>
        学习功能入口未在当前部署开放（当前仅数据看板与学习报告）。
      </p>
    </section>
  );
}
