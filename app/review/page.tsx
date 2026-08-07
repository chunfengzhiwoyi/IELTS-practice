import { ReviewPage } from "@/components/review/review-page";

interface Props {
  searchParams: Promise<{ itemId?: string }>;
}

export default async function ReviewPageRoute({ searchParams }: Props) {
  const params = await searchParams;
  const initialItemId = params.itemId ?? undefined;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">今日复习</h1>
      <p className="mt-2 text-sm text-slate-600">
        主动回忆已学词条，巩固记忆。
      </p>
      <div className="mt-6">
        <ReviewPage initialItemId={initialItemId} />
      </div>
    </main>
  );
}
