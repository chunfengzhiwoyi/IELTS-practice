import Link from "next/link";
import { ReviewClient } from "@/components/review/review-client";

export default function ReviewRoute() {
  return (
    <main className="subpage">
      <header className="subhead">
        <div className="subhead__bar">
          <Link href="/" className="btn btn--quiet btn--quiet--back btn--sm">← 主页</Link>
        </div>
        <div className="subhead__grid">
          <span className="folio">02</span>
          <div>
            <h1>今日复习</h1>
            <p className="lead">聚焦待巩固词条，完成主动回忆。</p>
          </div>
        </div>
      </header>
      <ReviewClient />
    </main>
  );
}
