/**
 * POST /api/ima/list
 * ------------------------------------------------------------
 * 用用户填写的 ima clientId / apiKey 列出其知识库，供设置页选择 knowledge_base_id。
 * 不落库；保存走 /api/secrets。鉴权：登录用户。
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { listImaKnowledgeBases, type ImaConfig } from "@/lib/knowledge/ima";

export const runtime = "nodejs";

const Schema = z.object({
  clientId: z.string().min(1),
  apiKey: z.string().min(1),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }
  try {
    const cfg = Schema.parse(await request.json()) as ImaConfig;
    const list = await listImaKnowledgeBases(cfg);
    return NextResponse.json({ ok: true, list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "获取失败";
    return NextResponse.json({ ok: false, error: msg });
  }
}
