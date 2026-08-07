import Link from "next/link";
import { ReportPage } from "@/components/report/report-page";

export default function ReportRoute() {
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">学习报告</h1>
          <p className="mt-1 text-sm text-slate-500">根据你最近的学习记录生成。</p>
        </div>
        <Link href="/" className="text-sm text-slate-500 hover:text-brand-600">← 返回</Link>
      </div>
      <ReportPage />
    </main>
  );
}
