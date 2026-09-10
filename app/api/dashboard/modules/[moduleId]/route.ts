import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RealDashboardRepository } from "@/lib/dashboard/real-repository";
import { parseRangeParam } from "../../route";
import type { ModuleId } from "@/lib/dashboard/types";
import { requireDashboardAccess as requireUser } from "@/lib/auth/dashboard-access";
import { AppError } from "@/lib/observability/errors";

const MODULES: ModuleId[] = ["learn", "review", "speaking", "report"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await ctx.params;
  if (!MODULES.includes(moduleId as ModuleId)) {
    return NextResponse.json({ error: "unknown_module" }, { status: 404 });
  }
  try {
    await requireUser();
    const repo = new RealDashboardRepository();
    const detail = await repo.getModuleDetail(moduleId as ModuleId, parseRangeParam(req));
    return NextResponse.json(detail);
  } catch (e) {
    if (e instanceof AppError && e.kind === "AUTH_REQUIRED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (e instanceof AppError && e.kind === "FORBIDDEN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "module_unavailable", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
