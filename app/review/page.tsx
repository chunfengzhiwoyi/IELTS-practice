import Link from "next/link";
import { ReviewPage } from "@/components/review/review-page";

interface Props {
  searchParams: Promise<{ itemId?: string }>;
}

export default async function ReviewRoute({ searchParams }: Props) {
  const params = await searchParams;
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
      <ReviewPage initialItemId={params.itemId} />
    </main>
  );
}
