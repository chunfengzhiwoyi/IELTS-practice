/**
 * MOBILE-04B — Backend Auth Routes 测试
 * ------------------------------------------------------------
 * 覆盖（Contract §20）：
 *  - login success / invalid credentials / malformed payload
 *  - session authenticated / unauthenticated
 *  - logout
 *  - cookie created（login 写 cookie）/ cookie cleared（logout 清 cookie）
 *  - middleware allowlist（放行移动端点 + speaking；不放 /api/* 通配）
 *  - token 不出现于 JSON response
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: {
    getAll: vi.fn<() => { name: string; value: string }[]>(() => []),
    set: vi.fn(),
    delete: vi.fn(),
  },
  createServerClient: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => mocks.cookieStore,
}));

vi.mock("@/lib/db/server", () => ({
  createServerClient: () => mocks.createServerClient(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
  requireUser: vi.fn(),
}));

import { isDashboardOnlyAllowed } from "@/middleware";
import { POST as loginPost } from "@/app/api/auth/mobile/login/route";
import { GET as sessionGet } from "@/app/api/auth/mobile/session/route";
import { POST as logoutPost } from "@/app/api/auth/mobile/logout/route";

const jsonReq = (body: unknown): Request =>
  new Request("http://localhost/api/auth/mobile/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieStore.getAll.mockReturnValue([]);
  mocks.cookieStore.set.mockClear();
  mocks.cookieStore.delete.mockClear();
});

describe("POST /api/auth/mobile/login", () => {
  it("success: 200 + 最小 user 状态，且响应 JSON 不含任何 token", async () => {
    const supabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: "u-real-1", email: "a@example.com" } },
          error: null,
        }),
      },
    };
    mocks.createServerClient.mockReturnValue(supabase);

    const res = await loginPost(jsonReq({ email: "a@example.com", password: "secret123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ authenticated: true, user: { id: "u-real-1", email: "a@example.com" } });

    const raw = JSON.stringify(body);
    expect(raw).not.toContain("access_token");
    expect(raw).not.toContain("refresh_token");
    expect(raw).not.toContain("session");
  });

  it("login 通过 server client 写入 session cookie（cookie created）", async () => {
    // 模拟 @supabase/ssr 的真实契约：auth 操作成功 → setAll → cookieStore.set(sb-*, ...)
    const signInWithPassword = vi.fn().mockImplementation(async () => {
      mocks.cookieStore.set("sb-abc123-auth-token", "session.jwt", { httpOnly: true });
      return { data: { user: { id: "u1", email: "a@example.com" } }, error: null };
    });
    mocks.createServerClient.mockReturnValue({ auth: { signInWithPassword } });
    mocks.cookieStore.set.mockClear();

    const res = await loginPost(jsonReq({ email: "a@example.com", password: "secret123" }));
    expect(res.status).toBe(200);
    expect(mocks.cookieStore.set).toHaveBeenCalled();
    const names = mocks.cookieStore.set.mock.calls.map((c) => c[0] as string);
    expect(names.some((n) => n.startsWith("sb-"))).toBe(true);
  });

  it("invalid credentials: 401 + INVALID_CREDENTIALS（不泄露账号存在性）", async () => {
    const supabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Invalid login credentials" },
        }),
      },
    };
    mocks.createServerClient.mockReturnValue(supabase);

    const res = await loginPost(jsonReq({ email: "a@example.com", password: "wrong-pass" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(JSON.stringify(body)).not.toContain("access_token");
    expect(JSON.stringify(body)).not.toContain("refresh_token");
  });

  it("malformed payload: 非 JSON → 400", async () => {
    const res = await loginPost(
      new Request("http://localhost/api/auth/mobile/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("malformed payload: 缺少 password / 邮箱非法 → 400", async () => {
    const res1 = await loginPost(jsonReq({ email: "a@example.com" }));
    expect(res1.status).toBe(400);

    const res2 = await loginPost(jsonReq({ email: "not-an-email", password: "secret123" }));
    expect(res2.status).toBe(400);
    expect((await res2.json()).error.code).toBe("INVALID_INPUT");
  });
});

describe("GET /api/auth/mobile/session", () => {
  it("authenticated: 200 + 真实 user.id（由 Supabase 服务端验证）", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-real-1", email: "a@example.com" });
    const res = await sessionGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      user: { id: "u-real-1", email: "a@example.com" },
    });
  });

  it("unauthenticated: 401 + authenticated:false", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await sessionGet();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ authenticated: false });
  });
});

describe("POST /api/auth/mobile/logout", () => {
  it("logout: signOut 调用 + sb-* cookie 全部清除 + authenticated:false", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createServerClient.mockReturnValue({ auth: { signOut } });
    mocks.cookieStore.getAll.mockReturnValue([
      { name: "sb-abc123-auth-token", value: "jwt" },
      { name: "sb-abc123-auth-token-code-verifier", value: "verifier" },
      { name: "other-cookie", value: "x" },
    ]);

    const res = await logoutPost();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
    expect(signOut).toHaveBeenCalledTimes(1);
    // 只清 sb-* 前缀，不误删其他 cookie
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("sb-abc123-auth-token");
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("sb-abc123-auth-token-code-verifier");
    expect(mocks.cookieStore.delete).not.toHaveBeenCalledWith("other-cookie");
  });

  it("logout: Supabase signOut 失败仍清 cookie（本地 session material 必须清除）", async () => {
    mocks.createServerClient.mockReturnValue({
      auth: { signOut: vi.fn().mockRejectedValue(new Error("network down")) },
    });
    mocks.cookieStore.getAll.mockReturnValue([{ name: "sb-abc123-auth-token", value: "jwt" }]);

    const res = await logoutPost();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith("sb-abc123-auth-token");
  });
});

describe("middleware allowlist（MOBILE-04B §10）", () => {
  it("放行移动 Auth 三个精确端点", () => {
    expect(isDashboardOnlyAllowed("/api/auth/mobile/login")).toBe(true);
    expect(isDashboardOnlyAllowed("/api/auth/mobile/session")).toBe(true);
    expect(isDashboardOnlyAllowed("/api/auth/mobile/logout")).toBe(true);
  });

  it("放行 Speaking API 前缀", () => {
    expect(isDashboardOnlyAllowed("/api/speaking/session")).toBe(true);
    expect(isDashboardOnlyAllowed("/api/speaking/transcribe")).toBe(true);
    expect(isDashboardOnlyAllowed("/api/speaking/analyze")).toBe(true);
    expect(isDashboardOnlyAllowed("/api/speaking/complete")).toBe(true);
    expect(isDashboardOnlyAllowed("/api/speaking")).toBe(true);
  });

  it("不放行 /api/auth 全量或 /api/* 通配", () => {
    expect(isDashboardOnlyAllowed("/api/auth/mobile/other")).toBe(false);
    expect(isDashboardOnlyAllowed("/api/auth/login")).toBe(false);
    expect(isDashboardOnlyAllowed("/api/foo")).toBe(false);
    expect(isDashboardOnlyAllowed("/api/speaking-evil")).toBe(false);
  });

  it("dashboard-only 其他限制保持不变", () => {
    expect(isDashboardOnlyAllowed("/api/account/profile")).toBe(false);
    expect(isDashboardOnlyAllowed("/api/report2")).toBe(false);
    expect(isDashboardOnlyAllowed("/learn")).toBe(false);
    expect(isDashboardOnlyAllowed("/")).toBe(true);
    expect(isDashboardOnlyAllowed("/dashboard")).toBe(true);
    expect(isDashboardOnlyAllowed("/login")).toBe(true);
    expect(isDashboardOnlyAllowed("/api/dashboard/stats")).toBe(true);
  });
});
