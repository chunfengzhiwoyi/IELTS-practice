/**
 * GET /api/debug/traces/fixtures
 * ------------------------------------------------------------
 * M2 Phase 3A: 确保 5 个 Trace Capability Fixture 已写入 Memory Trace Store，
 * 并返回 fixture 元信息（trace_id / 场景 / 描述），供 Console 快捷加载。
 * 幂等：已存在的 fixture 跳过，不重复写入。
 * 内部 debug 端点，不做鉴权（demo 项目）；生产环境应限制访问。
 */
import { NextResponse } from "next/server";

import { ensureDebugFixtures } from "@/lib/debug/console/fixtures";

export const runtime = "nodejs";

export async function GET() {
  const fixtures = await ensureDebugFixtures();
  return NextResponse.json(
    { fixtures, count: fixtures.length },
    { status: 200 },
  );
}
