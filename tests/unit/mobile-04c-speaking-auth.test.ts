/**
 * MOBILE-04C — Speaking 后端鉴权与契约测试
 * ------------------------------------------------------------
 * 覆盖：
 *  - transcribe unauthenticated → 401 AUTH_REQUIRED（Phase 2：TRANSCRIBE_AUTH_REQUIRED=YES）
 *  - transcribe authenticated → provider 路径（WHISPER_API_KEY / OPENAI_API_KEY 兼容）
 *  - STT credential 契约：DEEPSEEK chat key 不得被当作 Whisper key（503 CONFIG_ERROR）
 *  - analyze / complete wrong-user session → 403 FORBIDDEN（Phase 3 owner 检查）
 */
process.env.DATA_PROVIDER = "memory";
process.env.AUTH_MODE = "demo";
delete process.env.WHISPER_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.WHISPER_BASE_URL;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
  requireUser: () => mocks.requireUser(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/repository-factory", () => ({
  getSpeakingRepository: () => ({
    getSession: () => mocks.getSession(),
  }),
}));

import { POST as transcribePost } from "@/app/api/speaking/transcribe/route";
import { POST as analyzePost } from "@/app/api/speaking/analyze/route";
import { POST as completePost } from "@/app/api/speaking/complete/route";
import { AppError } from "@/lib/observability/errors";

const U1 = { id: "u-owner-1", email: "owner@example.com" };
const U2 = { id: "u-other-1", email: "other@example.com" };

const WHISPER_OK_BODY = JSON.stringify({
  text: "I like reading books every day.",
  duration: 2.4,
  words: [{ word: "I", start: 0, end: 0.2 }],
});

function makeFormRequest(): Request {
  const formData = new FormData();
  formData.append("audio", new File([new Uint8Array([1, 2, 3])], "recording.m4a", { type: "audio/mp4" }));
  return new Request("http://localhost/api/speaking/transcribe", {
    method: "POST",
    headers: { "x-trace-id": "trc_04c_transcribe" },
    body: formData,
  });
}

const jsonReq = (body: unknown, path: string): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const OWNED_SESSION = {
  id: "spk-0001",
  userId: U1.id,
  questionId: "sp-p1-001",
  part: "P1",
  firstAnswer: null,
  secondAnswer: null,
  suggestedExpressions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(U1);
  // STT key 契约：每个用例独立，防止上例 key 泄漏到本用例
  delete process.env.WHISPER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/speaking/transcribe（MOBILE-04C 鉴权）", () => {
  it("unauthenticated → 401 AUTH_REQUIRED（匿名请求被拒）", async () => {
    mocks.requireUser.mockRejectedValue(new AppError("AUTH_REQUIRED", "请先登录"));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.kind).toBe("AUTH_REQUIRED");
  });

  it("authenticated + WHISPER_API_KEY → 200 + transcript（使用专用 STT key）", async () => {
    process.env.WHISPER_API_KEY = "sk-whisper-04c";
    const fetchMock = vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcript).toBe("I like reading books every day.");
    expect(body.duration).toBe(2.4);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-whisper-04c");
  });

  it("仅 OPENAI_API_KEY → 200（兼容路径仍有效）", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-04c";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
  });

  it("仅 DEEPSEEK_API_KEY（chat key）→ 503 CONFIG_ERROR，且不调用 provider", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-chat-key-04c";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.kind).toBe("CONFIG_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Speaking session 归属（MOBILE-04C Phase 3 owner 检查）", () => {
  it("analyze: 他人 session → 403 FORBIDDEN", async () => {
    mocks.getSession.mockResolvedValue({ ...OWNED_SESSION, userId: U2.id });
    const res = await analyzePost(
      jsonReq({ sessionId: "spk-0001", answer: "I like reading books.", isSecondAnswer: false }, "/api/speaking/analyze"),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.kind).toBe("FORBIDDEN");
  });

  it("complete: 他人 session → 403 FORBIDDEN", async () => {
    mocks.getSession.mockResolvedValue({ ...OWNED_SESSION, userId: U2.id });
    const res = await completePost(jsonReq({ sessionId: "spk-0001" }, "/api/speaking/complete"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.kind).toBe("FORBIDDEN");
  });
});
