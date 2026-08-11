import Link from "next/link";
import { ReportPage } from "@/components/report/report-page";

export default function ReportRoute() {
  return (
    <main className="subpage">
      <header className="subhead">
        <div className="subhead__bar">
          <Link href="/" className="btn btn--quiet btn--quiet--back btn--sm">← 主页</Link>
        </div>
        <div className="subhead__grid">
          <span className="folio">04</span>
          <div>
            <h1>学习报告</h1>
            <p className="lead">根据你最近的学习记录生成。</p>
          </div>
        </div>
      </header>
      <ReportPage />
    </main>
  );
}
