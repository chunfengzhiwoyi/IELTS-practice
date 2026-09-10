import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RealDashboardRepository } from "@/lib/dashboard/real-repository";
import { parseRangeParam } from "../../route";
import type { LifecycleStageId } from "@/lib/dashboard/types";
import { requireDashboardAccess as requireUser } from "@/lib/auth/dashboard-access";
import { AppError } from "@/lib/observability/errors";

const STAGES: LifecycleStageId[] = ["first_use", "activation", "return", "d7_retention", "habit"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await ctx.params;
  if (!STAGES.includes(stageId as LifecycleStageId)) {
    return NextResponse.json({ error: "unknown_stage" }, { status: 404 });
  }
  try {
    await requireUser();
    const repo = new RealDashboardRepository();
    const detail = await repo.getLifecycleDetail(stageId as LifecycleStageId, parseRangeParam(req));
    return NextResponse.json(detail);
  } catch (e) {
    if (e instanceof AppError && e.kind === "AUTH_REQUIRED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (e instanceof AppError && e.kind === "FORBIDDEN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "lifecycle_unavailable", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
