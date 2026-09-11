/**
 * Goal 客户端迁移逻辑测试（PRODUCT-LOOP-02B §14 case 9）
 * localStorage 首次迁移 → 服务端成为 authority；API 不可用 → local-cache 回退。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadGoalWithMigration,
  saveGoalAuthoritative,
  type FetchLike,
} from "@/lib/client/goal-client";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goal/types";

const LOCAL_GOAL = {
  examDate: "2026-12-31",
  targetBand: 7.0,
  currentBand: 5.5,
  dailyMinutes: 30,
  weeklyWordTarget: 200,
  setAt: "2026-09-01T00:00:00.000Z",
  plannedWeeks: 17,
};

function installLocalStorage(seed: Record<string, unknown> | null) {
  const store = new Map<string, string>();
  if (seed) {
    for (const [k, v] of Object.entries(seed)) store.set(k, JSON.stringify(v));
  }
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    length: 0,
    key: () => null,
  });
  return store;
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

function envelope(over: { profile?: typeof DEFAULT_GOAL_PROFILE; persisted?: boolean } = {}) {
  return {
    profile: { ...DEFAULT_GOAL_PROFILE, ...(over.profile ?? {}) },
    persisted: over.persisted ?? true,
    storage: "memory",
    durable: false,
  };
}

describe("goal-client migration", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("case 9a: 服务端无档案 + 本地有 → 首次迁移（PUT 携带本地档案，返回 migrated）", async () => {
    installLocalStorage({ "els_weeklyGoal": LOCAL_GOAL });
    const putBody: unknown[] = [];
    const fetchMock: FetchLike = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/goal") && init?.method === "PUT") {
        putBody.push(JSON.parse(String(init.body)));
        return jsonResponse(envelope({ profile: LOCAL_GOAL, persisted: true }));
      }
      return jsonResponse(envelope({ profile: DEFAULT_GOAL_PROFILE, persisted: false }));
    }) as FetchLike;

    const result = await loadGoalWithMigration(fetchMock);
    expect(result.authority).toBe("migrated");
    expect(result.profile).toEqual({ ...DEFAULT_GOAL_PROFILE, ...LOCAL_GOAL });
    expect(putBody).toHaveLength(1);
    expect(putBody[0]).toEqual({ ...DEFAULT_GOAL_PROFILE, ...LOCAL_GOAL });
  });

  it("case 9b: 服务端已有档案 → 不迁移，服务端为权威", async () => {
    installLocalStorage({ "els_weeklyGoal": LOCAL_GOAL });
    const serverProfile = { ...DEFAULT_GOAL_PROFILE, examDate: "2027-03-01", weeklyWordTarget: 150 };
    let putCalled = false;
    const fetchMock: FetchLike = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/goal") && init?.method === "PUT") {
        putCalled = true;
        return jsonResponse(envelope({ profile: serverProfile, persisted: true }));
      }
      return jsonResponse(envelope({ profile: serverProfile, persisted: true }));
    }) as FetchLike;

    const result = await loadGoalWithMigration(fetchMock);
    expect(result.authority).toBe("server");
    expect(putCalled).toBe(false);
    expect(result.profile.weeklyWordTarget).toBe(150);
  });

  it("case 9c: 服务端无 + 本地无 → 返回服务端默认轮廓", async () => {
    installLocalStorage(null);
    let putCalled = false;
    const fetchMock: FetchLike = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") putCalled = true;
      return jsonResponse(envelope({ profile: DEFAULT_GOAL_PROFILE, persisted: false }));
    }) as FetchLike;

    const result = await loadGoalWithMigration(fetchMock);
    expect(result.authority).toBe("server");
    expect(putCalled).toBe(false);
    expect(result.profile).toEqual(DEFAULT_GOAL_PROFILE);
  });

  it("case 9d: API 不可用 → local-cache 回退，不抛错", async () => {
    installLocalStorage({ "els_weeklyGoal": LOCAL_GOAL });
    const fetchMock: FetchLike = (async () => jsonResponse({}, false)) as FetchLike;
    const result = await loadGoalWithMigration(fetchMock);
    expect(result.authority).toBe("local-cache");
    expect(result.profile.weeklyWordTarget).toBe(LOCAL_GOAL.weeklyWordTarget);
  });

  it("case 9e: saveGoalAuthoritative 走 PUT 并写通本地缓存", async () => {
    installLocalStorage(null);
    const saved = { ...DEFAULT_GOAL_PROFILE, examDate: "2026-11-30", weeklyWordTarget: 180 };
    const fetchMock: FetchLike = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      return jsonResponse(envelope({ profile: saved, persisted: true }));
    }) as FetchLike;

    const result = await saveGoalAuthoritative(saved, fetchMock);
    expect(result.authority).toBe("server");
    const cached = JSON.parse((globalThis.localStorage as Storage).getItem("els_weeklyGoal")!);
    expect(cached.weeklyWordTarget).toBe(180);
  });
});
