import Link from "next/link";
import { ReviewPage } from "@/components/review/review-page";

interface Props {
  searchParams: Promise<{ itemId?: string }>;
}

export default async function ReviewRoute({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">今日复习</h1>
        <Link href="/" className="text-sm text-slate-500 hover:text-brand-600">← 返回</Link>
      </div>
      <ReviewPage initialItemId={params.itemId} />
    </main>
  );
}
