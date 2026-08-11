/**
 * /speaking 口语训练页面
 */
import Link from "next/link";
import { SpeakingPage } from "@/components/speaking/speaking-page";

export default function SpeakingRoute() {
  return (
    <main className="subpage">
      <header className="subhead">
        <div className="subhead__bar">
          <Link href="/" className="btn btn--quiet btn--quiet--back btn--sm">← 主页</Link>
        </div>
        <div className="subhead__grid">
          <span className="folio">03</span>
          <div>
            <h1>口语训练</h1>
            <p className="lead">文字版 Part 1/2/3，每轮聚焦一个改善点。</p>
          </div>
        </div>
      </header>
      <SpeakingPage />
    </main>
  );
}
