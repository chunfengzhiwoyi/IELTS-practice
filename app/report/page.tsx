/**
 * /report 学习报告页面
 */
import Link from "next/link";
import { ReportPage } from "@/components/report/report-page";

export default function ReportRoute() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">学习报告</h1>
          <p className="mt-1 text-sm text-slate-600">
            基于真实学习记录，追踪进展与薄弱点。
          </p>
        </div>
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← 首页
        </Link>
      </div>
      <ReportPage />
    </main>
  );
}
