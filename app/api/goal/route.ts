/**
 * /api/goal — Goal Profile 档案（PRODUCT-LOOP-02B）
 * ------------------------------------------------------------
 * GET  → { profile, persisted, storage, durable, provider }
 * PUT  → 校验并 upsert，返回 { profile, persisted: true, ... }
 * V1 持久化恒为 Memory（ENV-SUPABASE-01 BLOCKED，不新增 migration）。
 * 响应显式携带 storage="memory" / durable=false：
 * 客户端不得误以为跨设备持久化；绝不 silent fail。
 */
import "server-only";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getGoalRepository } from "@/lib/goal/repository";
import { DEFAULT_GOAL_PROFILE, normalizeGoalProfile } from "@/lib/goal/types";
import type { GoalProfile } from "@/lib/goal/types";
import { toAppError } from "@/lib/observability/errors";
import { traceIdFromHeaders } from "@/lib/observability/trace";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const goalProfileSchema = z.object({
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  targetBand: z.number().min(0).max(9),
  currentBand: z.number().min(0).max(9),
  dailyMinutes: z.number().min(1).max(600),
  weeklyWordTarget: z.number().min(0).max(2000),
  setAt: z.string().nullable(),
  plannedWeeks: z.number().nullable(),
});

function storageInfo() {
  return {
    storage: "memory" as const,
    durable: false,
    provider: getServerEnv().DATA_PROVIDER,
  };
}

export async function GET(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const user = await requireUser(traceId);
    const repo = getGoalRepository();
    const stored = await repo.getGoalProfile(user.id);
    const profile = stored ?? DEFAULT_GOAL_PROFILE;
    return NextResponse.json(
      { profile, persisted: stored !== null, ...storageInfo() },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}

export async function PUT(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  try {
    const user = await requireUser(traceId);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "x-trace-id": traceId } });
    }
    const parsed = goalProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_GOAL_PROFILE", issues: parsed.error.issues.map((i) => i.path.join(".")) },
        { status: 400, headers: { "x-trace-id": traceId } },
      );
    }
    const repo = getGoalRepository();
    const profile = normalizeGoalProfile(parsed.data as Partial<GoalProfile>);
    const saved = await repo.upsertGoalProfile(user.id, profile);
    return NextResponse.json(
      { profile: saved, persisted: true, ...storageInfo() },
      { status: 200, headers: { "x-trace-id": traceId } },
    );
  } catch (err) {
    const appErr = toAppError(err, traceId);
    const status = appErr.kind === "AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: appErr.toPayload() }, { status, headers: { "x-trace-id": traceId } });
  }
}
