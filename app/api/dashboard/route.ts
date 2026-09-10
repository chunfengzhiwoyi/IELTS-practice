import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RealDashboardRepository } from "@/lib/dashboard/real-repository";
import type { DashboardRange } from "@/lib/dashboard/types";
import { requireDashboardAccess as requireUser } from "@/lib/auth/dashboard-access";
import { AppError } from "@/lib/observability/errors";

export function parseRangeParam(req: NextRequest): DashboardRange {
  const v = req.nextUrl.searchParams.get("range") ?? "7d";
  return v === "30d" || v === "all" ? v : "7d";
}

export async function GET(req: NextRequest) {
  try {
    // P7.5A：requireDashboardAccess = requireUser + server-side email allowlist。
    await requireUser();
    const range = parseRangeParam(req);
    const repo = new RealDashboardRepository();
    const data = await repo.getDashboard(range);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof AppError && e.kind === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (e instanceof AppError && e.kind === "FORBIDDEN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "dashboard_unavailable", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
