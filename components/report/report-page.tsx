"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { generateClientReport, type ClientReport } from "@/lib/client/demo-service";

type PageState = { kind: "LOADING" } | { kind: "READY"; report: ClientReport } | { kind: "ERROR"; message: string };

export function ReportPage() {
  const [state, setState] = useState<PageState>({ kind: "LOADING" });

  useEffect(() => {
    try {
      const report = generateClientReport();
      setState({ kind: "READY", report });
    } catch (err) {
      setState({ kind: "ERROR", message: err instanceof Error ? err.message : "生成失败" });
    }
  }, []);

  if (state.kind === "LOADING") return <div className="py-8 text-center text-sm text-slate-500">生成报告中…</div>;
  if (state.kind === "ERROR") return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">{state.message}</div>;

  const { report } = state;

  if (report.totalItems === 0 && report.speakingCount === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="text-4xl">📊</div>
        <h2 className="mt-4 text-lg font-semibold text-slate-800">暂无学习数据</h2>
        <p className="mt-2 text-sm text-slate-600">开始学习新词或练习口语后，报告将自动生成。</p>
        <Link href="/learn" className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">开始学习</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Memory */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">记忆状态</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="总词条" value={report.totalItems} />
          <Stat label="新学" value={report.newItems} />
          <Stat label="复习次数" value={report.reviewedCount} />
          <Stat label="即将到期" value={report.dueSoon} color="text-amber-700" />
        </div>
      </section>

      {/* Review */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">复习统计</h3>
        {report.reviewTotal === 0 ? (
          <p className="mt-2 text-sm text-slate-500">暂无复习记录。</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="总复习" value={report.reviewTotal} />
            <Stat label="独立正确" value={report.correctIndependent} color="text-emerald-700" />
            <Stat label="提示正确" value={report.correctWithHint} color="text-amber-700" />
            <Stat label="未通过" value={report.incorrect} color="text-rose-700" />
            <Stat label="正确率" value={`${Math.round(report.correctRate * 100)}%`} />
          </div>
        )}
      </section>

      {/* Speaking */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">口语观察</h3>
        {report.speakingCount === 0 ? (
          <p className="mt-2 text-sm text-slate-500">暂无口语练习记录。</p>
        ) : (
          <div className="mt-2 text-sm text-slate-700">
            <p>共完成 {report.speakingCount} 次口语练习</p>
            {report.speakingTopIssue && <p className="mt-1">最常出现问题：{report.speakingTopIssue}</p>}
          </div>
        )}
      </section>

      {/* Recommendations */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">推荐任务</h3>
        <div className="mt-3 space-y-2">
          {report.recommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-3 rounded-md bg-slate-50 px-3 py-2">
              <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${rec.priority === "HIGH" ? "bg-rose-100 text-rose-700" : rec.priority === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                {rec.priority}
              </span>
              <div className="flex-1">
                <span className="text-sm text-slate-800">{rec.text}</span>
                <div className="mt-1">
                  <Link href={rec.link} className="text-xs text-brand-600 hover:underline">去做 →</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${color ?? "text-slate-800"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
