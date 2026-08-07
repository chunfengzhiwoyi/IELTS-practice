/**
 * /speaking 口语训练页面
 */
import Link from "next/link";
import { SpeakingPage } from "@/components/speaking/speaking-page";

export default function SpeakingRoute() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">口语训练</h1>
          <p className="mt-1 text-sm text-slate-600">
            文字版 Part 1/2/3，每轮聚焦一个改善点。
          </p>
        </div>
        <Link href="/" className="text-sm text-brand-600 hover:underline">
          ← 首页
        </Link>
      </div>
      <SpeakingPage />
    </main>
  );
}
