/**
 * 404 页面
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-ink-meta">404</h1>
        <p className="mt-4 text-lg text-ink-soft">页面不存在</p>
        <Link
          href="/"
          className="mt-6 inline-block btn btn--primary"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
