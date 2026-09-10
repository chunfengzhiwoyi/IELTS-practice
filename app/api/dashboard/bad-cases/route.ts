import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RealDashboardRepository } from "@/lib/dashboard/real-repository";
import { parseRangeParam } from "../route";
import { requireDashboardAccess as requireUser } from "@/lib/auth/dashboard-access";
import { AppError } from "@/lib/observability/errors";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const repo = new RealDashboardRepository();
    const cases = await repo.getBadCases(req.nextUrl.searchParams.get("layer") as never, parseRangeParam(req));
    return NextResponse.json(cases);
  } catch (e) {
    if (e instanceof AppError && e.kind === "AUTH_REQUIRED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (e instanceof AppError && e.kind === "FORBIDDEN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "bad_cases_unavailable", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
