/**
 * /learn 新词学习页面
 * ------------------------------------------------------------
 * P1 实现：输入单词/语块 → 获取词卡 → 主动回忆 → 反馈 → 保存状态 → 复习时间
 */
import Link from "next/link";
import { LearnPage } from "@/components/learn/learn-page";

export default function LearnRoute() {
  return (
    <main className="subpage">
      <header className="subhead">
        <div className="subhead__bar">
          <Link href="/" className="btn btn--quiet btn--quiet--back btn--sm">← 主页</Link>
        </div>
        <div className="subhead__grid">
          <span className="folio">01</span>
          <div>
            <h1>新词学习</h1>
            <p className="lead">输入一个单词或语块，生成词卡并完成主动回忆任务。</p>
          </div>
        </div>
      </header>
      <LearnPage />
    </main>
  );
}
