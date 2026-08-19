"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReviewPage } from "./review-page";

/**
 * 静态导出下 searchParams 不可在 Server Component 使用，
 * 改由客户端读取 URL query 并注入 ReviewPage（需 Suspense 边界）。
 */
function ReviewClientInner() {
  const sp = useSearchParams();
  const itemId = sp.get("itemId") ?? undefined;
  return <ReviewPage initialItemId={itemId} />;
}

export function ReviewClient() {
  return (
    <Suspense fallback={null}>
      <ReviewClientInner />
    </Suspense>
  );
}
