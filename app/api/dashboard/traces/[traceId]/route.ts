import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RealDashboardRepository } from "@/lib/dashboard/real-repository";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await ctx.params;
  try {
    const repo = new RealDashboardRepository();
    const detail = await repo.getTrace(traceId);
    return NextResponse.json(detail);
  } catch (e) {
    // trace 未持久化：明确 404，不返回 Mock trace。
    return NextResponse.json({ error: "trace_not_persisted", message: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}
