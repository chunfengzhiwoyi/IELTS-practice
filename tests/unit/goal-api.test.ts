/**
 * /api/goal 路由测试（PRODUCT-LOOP-02B §16 goal API tests）
 * GET 返回默认/已存档案 + storage 信息；PUT 校验并 upsert。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PUT } from "@/app/api/goal/route";
import { _resetGoalRepositoryForTests } from "@/lib/goal/repository";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ DATA_PROVIDER: "memory" }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    }),
  },
}));

function req(method: string, body?: unknown): Request {
  return {
    headers: new Headers({ "x-trace-id": "t" }),
    json: async () => body,
    method,
  } as unknown as Request;
}

function bodyOf(res: { body: unknown }): Record<string, unknown> {
  return (res.body ?? {}) as Record<string, unknown>;
}

describe("api/goal", () => {
  beforeEach(() => {
    _resetGoalRepositoryForTests();
  });

  it("GET: 无档案时返回默认轮廓 + persisted=false + 显式 storage 信息", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const data = bodyOf(res) as {
      profile: typeof DEFAULT_GOAL_PROFILE;
      persisted: boolean;
      storage: string;
      durable: boolean;
    };
    expect(data.persisted).toBe(false);
    expect(data.profile).toEqual(DEFAULT_GOAL_PROFILE);
    expect(data.storage).toBe("memory");
    expect(data.durable).toBe(false);
  });

  it("PUT: 合法档案被保存，随后 GET 返回 persisted=true", async () => {
    const profile = { ...DEFAULT_GOAL_PROFILE, examDate: "2026-12-31", weeklyWordTarget: 180 };
    const putRes = await PUT(req("PUT", profile));
    expect(putRes.status).toBe(200);
    expect((bodyOf(putRes) as { persisted: boolean }).persisted).toBe(true);

    const getRes = await GET(req("GET"));
    const data = bodyOf(getRes) as { profile: typeof DEFAULT_GOAL_PROFILE; persisted: boolean };
    expect(data.persisted).toBe(true);
    expect(data.profile.weeklyWordTarget).toBe(180);
    expect(data.profile.examDate).toBe("2026-12-31");
  });

  it("PUT: 非法档案 → 400 + issues", async () => {
    const res = await PUT(req("PUT", { ...DEFAULT_GOAL_PROFILE, dailyMinutes: -5 }));
    expect(res.status).toBe(400);
    const data = bodyOf(res) as { error: string; issues: string[] };
    expect(data.error).toBe("INVALID_GOAL_PROFILE");
    expect(data.issues.length).toBeGreaterThan(0);
  });

  it("PUT: 非法 JSON → 400 INVALID_JSON", async () => {
    const res = await PUT({ headers: new Headers(), json: async () => {
      throw new Error("bad json");
    } } as unknown as Request);
    expect(res.status).toBe(400);
    expect((bodyOf(res) as { error: string }).error).toBe("INVALID_JSON");
  });
});
