/**
 * MOBILE-04D-FIX — STT Provider（DashScope PRIMARY / OpenAI Whisper FALLBACK）测试
 * ------------------------------------------------------------
 * 覆盖：
 *  - DashScope config present → 200 + 归一化 transcript（output.text / output.output.sentence.text 两种官方响应形态）
 *  - DashScope config absent（缺 DASHSCOPE_API_KEY / BASE_URL / ASR_MODEL）→ 503 CONFIG_ERROR，不调 provider
 *  - m4a → Base64 Data URI 直发 provider（请求体校验）
 *  - provider 401 / 429 / 5xx → 502 MODEL_ERROR（产品级，不泄漏 provider 细节）
 *  - invalid response / empty transcript → 502 MODEL_ERROR
 *  - secret 不落响应 / trace / 请求日志
 *  - OpenAI provider 回归：STT_PROVIDER=openai 与未设置（默认）→ whisper 路径
 *  - DEEPSEEK-only → 503 CONFIG_ERROR，不调 provider
 *  - auth 回归：匿名 → 401
 *  - m4a 容器时长解析（mvhd）单元测试
 */
process.env.DATA_PROVIDER = "memory";
process.env.AUTH_MODE = "demo";
delete process.env.STT_PROVIDER;
delete process.env.WHISPER_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.WHISPER_BASE_URL;
delete process.env.DASHSCOPE_API_KEY;
delete process.env.DASHSCOPE_BASE_URL;
delete process.env.DASHSCOPE_ASR_MODEL;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => mocks.requireUser(),
}));

vi.mock("server-only", () => ({}));

import { POST as transcribePost } from "@/app/api/speaking/transcribe/route";
import { parseM4aDurationMs } from "@/lib/stt/m4a-duration";
import { resolveSttProvider } from "@/lib/stt/provider";
import { traceStore } from "@/lib/observability/trace-store";
import { setTraceEnabled } from "@/lib/observability/trace-context";
import { AppError } from "@/lib/observability/errors";

const U1 = { id: "u-owner-1", email: "owner@example.com" };

const DASHSCOPE_KEY = "sk-dashscope-test-04d";
const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com";
const DASHSCOPE_MODEL = "qwen-audio-3.0-asr-flash";

/** 同步 ASR 官方响应形态 1：output.text */
const DASHSCOPE_OK_V1 = JSON.stringify({
  request_id: "req_1",
  output: { output: { sentence: { text: "This is a short speaking test." } }, text: "This is a short speaking test." },
});

/** 同步 ASR 官方响应形态 2：output.output.sentence.text（无顶层 text） */
const DASHSCOPE_OK_V2 = JSON.stringify({
  request_id: "req_2",
  output: { output: { sentence: { text: "I like reading books every day." } } },
});

function makeFormRequest(name = "recording.m4a", type = "audio/mp4", bytes?: Uint8Array): Request {
  const formData = new FormData();
  formData.append("audio", new File([Uint8Array.from(bytes ?? [1, 2, 3])], name, { type }));
  return new Request("http://localhost/api/speaking/transcribe", {
    method: "POST",
    headers: { "x-trace-id": "trc_04df_transcribe" },
    body: formData,
  });
}

const jsonReq = (body: unknown, path: string): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function setDashScopeEnv() {
  process.env.STT_PROVIDER = "dashscope";
  process.env.DASHSCOPE_API_KEY = DASHSCOPE_KEY;
  process.env.DASHSCOPE_BASE_URL = DASHSCOPE_BASE;
  process.env.DASHSCOPE_ASR_MODEL = DASHSCOPE_MODEL;
}

function clearSttEnv() {
  delete process.env.STT_PROVIDER;
  delete process.env.WHISPER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.WHISPER_BASE_URL;
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.DASHSCOPE_BASE_URL;
  delete process.env.DASHSCOPE_ASR_MODEL;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSttEnv();
  traceStore.reset();
  setTraceEnabled(true);
  mocks.requireUser.mockResolvedValue(U1);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashScope provider（qwen-audio-3.0-asr-flash）", () => {
  it("config present → 200 + 归一化 transcript（output.text 形态），请求体含 Base64 Data URI", async () => {
    setDashScopeEnv();
    const fetchMock = vi.fn().mockResolvedValue(new Response(DASHSCOPE_OK_V1, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcript).toBe("This is a short speaking test.");
    // 任意 fixture bytes 非合法 MP4 容器时 duration=0（诚实缺失）；结构必须为 number
    expect(typeof body.duration).toBe("number");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // 官方 DashScope ASR 契约：不用 OpenAI /audio/transcriptions
    expect(url).toBe("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${DASHSCOPE_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-DashScope-SSE"]).toBe("disable");

    const sent = JSON.parse(init.body as string) as {
      model: string;
      input: { messages: Array<{ content: Array<{ input_audio: { data: string } }> }> };
      parameters: { format: string };
    };
    expect(sent.model).toBe(DASHSCOPE_MODEL);
    const dataUri = sent.input.messages[0]!.content[0]!.input_audio.data;
    expect(dataUri).toMatch(/^data:audio\/mp4;base64,/);
    // m4a 字节 [1,2,3] 的 base64 应出现在 Data URI 中
    expect(dataUri).toContain(Buffer.from([1, 2, 3]).toString("base64"));
    expect(sent.parameters.format).toBe("m4a");
  });

  it("config present → 200（output.output.sentence.text 形态）", async () => {
    setDashScopeEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(DASHSCOPE_OK_V2, { status: 200 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcript).toBe("I like reading books every day.");
  });

  it("缺 DASHSCOPE_API_KEY → 503 CONFIG_ERROR，不调用 provider", async () => {
    process.env.STT_PROVIDER = "dashscope";
    process.env.DASHSCOPE_BASE_URL = DASHSCOPE_BASE;
    process.env.DASHSCOPE_ASR_MODEL = DASHSCOPE_MODEL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.kind).toBe("CONFIG_ERROR");
    expect(body.error.message).toContain("DASHSCOPE_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("缺 DASHSCOPE_BASE_URL → 503 CONFIG_ERROR", async () => {
    process.env.STT_PROVIDER = "dashscope";
    process.env.DASHSCOPE_API_KEY = DASHSCOPE_KEY;
    process.env.DASHSCOPE_ASR_MODEL = DASHSCOPE_MODEL;
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.kind).toBe("CONFIG_ERROR");
    expect(body.error.message).toContain("DASHSCOPE_BASE_URL");
  });

  it("缺 DASHSCOPE_ASR_MODEL → 503 CONFIG_ERROR", async () => {
    process.env.STT_PROVIDER = "dashscope";
    process.env.DASHSCOPE_API_KEY = DASHSCOPE_KEY;
    process.env.DASHSCOPE_BASE_URL = DASHSCOPE_BASE;
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.kind).toBe("CONFIG_ERROR");
    expect(body.error.message).toContain("DASHSCOPE_ASR_MODEL");
  });

  it("provider 401 → 502 MODEL_ERROR，错误不泄漏 provider 细节", async () => {
    setDashScopeEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{\"error\":{\"code\":\"InvalidApiKey\"}}", { status: 401 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.kind).toBe("MODEL_ERROR");
    expect(body.error.message).toBe("语音识别失败 (401)");
    expect(JSON.stringify(body)).not.toContain(DASHSCOPE_KEY);
    expect(JSON.stringify(body)).not.toContain("InvalidApiKey");
  });

  it("provider 429 → 502 MODEL_ERROR", async () => {
    setDashScopeEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("throttled", { status: 429 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(502);
    expect((await res.json()).error.kind).toBe("MODEL_ERROR");
  });

  it("provider 5xx → 502 MODEL_ERROR", async () => {
    setDashScopeEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream boom", { status: 500 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.kind).toBe("MODEL_ERROR");
    expect(JSON.stringify(body)).not.toContain("upstream boom");
  });

  it("invalid response（无 text）→ 502 MODEL_ERROR，不伪造空 transcript", async () => {
    setDashScopeEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ request_id: "r1" }), { status: 200 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(502);
    expect((await res.json()).error.kind).toBe("MODEL_ERROR");
  });

  it("响应仅含 output.output（无顶层 text）且 sentence 存在 → 200（兼容官方双形态）", async () => {
    setDashScopeEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(DASHSCOPE_OK_V2, { status: 200 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
  });

  it("secret 不落响应 / trace（Authorization 头只在 provider 请求中，日志/响应/追踪不含 key）", async () => {
    setDashScopeEnv();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(DASHSCOPE_OK_V1, { status: 200 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
    const bodyText = JSON.stringify(await res.json());
    expect(bodyText).not.toContain(DASHSCOPE_KEY);
    // trace payload 也绝不能含 key
    const t = traceStore.getTrace("trc_04df_transcribe");
    expect(t).toBeDefined();
    for (const e of t!.events) {
      expect(JSON.stringify(e.payload)).not.toContain(DASHSCOPE_KEY);
    }
  });
});

describe("OpenAI Whisper fallback（STT_PROVIDER=openai / 默认）", () => {
  const WHISPER_OK_BODY = JSON.stringify({
    text: "I like reading books every day.",
    duration: 2.4,
    words: [{ word: "I", start: 0, end: 0.2 }],
  });

  it("STT_PROVIDER=openai + WHISPER_API_KEY → 200，走 /audio/transcriptions", async () => {
    process.env.STT_PROVIDER = "openai";
    process.env.WHISPER_API_KEY = "sk-whisper-04df";
    const fetchMock = vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-whisper-04df");
  });

  it("未设置 STT_PROVIDER（默认）→ 默认 openai/whisper 路径", async () => {
    process.env.WHISPER_API_KEY = "sk-whisper-default-04df";
    const fetchMock = vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/audio/transcriptions");
  });

  it("仅 OPENAI_API_KEY → 200（兼容路径仍有效）", async () => {
    process.env.OPENAI_API_KEY = "sk-openai-04df";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(WHISPER_OK_BODY, { status: 200 })));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(200);
  });

  it("仅 DEEPSEEK_API_KEY → 503 CONFIG_ERROR，不调用 provider（DEEPSEEK 禁止作 STT key）", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-deepseek-chat-04df";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).error.kind).toBe("CONFIG_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("缺 key → 503 CONFIG_ERROR（默认路径）", async () => {
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).error.kind).toBe("CONFIG_ERROR");
  });
});

describe("Auth / 其它回归", () => {
  it("匿名 → 401 AUTH_REQUIRED", async () => {
    mocks.requireUser.mockRejectedValue(new AppError("AUTH_REQUIRED", "请先登录"));
    const res = await transcribePost(makeFormRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).error.kind).toBe("AUTH_REQUIRED");
  });
});

describe("resolveSttProvider 配置校验", () => {
  it("dashscope 全配置 → ok", () => {
    const r = resolveSttProvider({ STT_PROVIDER: "dashscope", DASHSCOPE_API_KEY: "k", DASHSCOPE_BASE_URL: "https://x", DASHSCOPE_ASR_MODEL: "m" });
    expect(r.ok).toBe(true);
  });
  it("dashscope 缺任一 → CONFIG_ERROR", () => {
    expect(resolveSttProvider({ STT_PROVIDER: "dashscope", DASHSCOPE_API_KEY: "k" }).ok).toBe(false);
    expect(resolveSttProvider({ STT_PROVIDER: "dashscope", DASHSCOPE_BASE_URL: "https://x" }).ok).toBe(false);
  });
  it("openai：WHISPER 或 OPENAI key → ok；无 → CONFIG_ERROR（DEEPSEEK 不在 STT 配置契约内）", () => {
    expect(resolveSttProvider({ WHISPER_API_KEY: "k" }).ok).toBe(true);
    expect(resolveSttProvider({ OPENAI_API_KEY: "k" }).ok).toBe(true);
    expect(resolveSttProvider({}).ok).toBe(false);
  });
});

describe("parseM4aDurationMs（MP4/M4A 容器 mvhd 解析）", () => {
  /** 构造最小 MP4 骨架：ftyp + mdat + moov(mvhd v0, timescale, duration)；每个 box 均带 8 字节 header */
  function buildMinimalMp4(durationMs: number, timescale = 1000): Buffer {
    const box = (type: string, body: Buffer): Buffer => {
      const h = Buffer.alloc(8);
      h.writeUInt32BE(8 + body.length, 0);
      h.write(type, 4, "latin1");
      return Buffer.concat([h, body]);
    };

    const mvhdBody = Buffer.alloc(20);
    mvhdBody.writeUInt8(0, 0); // version 0
    mvhdBody.writeUInt32BE(0, 4); // creation
    mvhdBody.writeUInt32BE(0, 8); // modification
    mvhdBody.writeUInt32BE(timescale, 12);
    mvhdBody.writeUInt32BE(durationMs, 16);

    const ftyp = box("ftyp", Buffer.from("ftyp"));
    const mdat = box("mdat", Buffer.from([0xff, 0xff, 0xff]));
    const moov = box("moov", box("mvhd", mvhdBody));
    return Buffer.concat([ftyp, mdat, moov]);
  }

  it("解析 version 0 mvhd → 毫秒时长", () => {
    expect(parseM4aDurationMs(buildMinimalMp4(2500))).toBe(2500);
  });

  it("不同 timescale 正确换算", () => {
    // 90000 timescale, 450000 ticks → 5000ms
    expect(parseM4aDurationMs(buildMinimalMp4(450000, 90000))).toBe(5000);
  });

  it("非 MP4 / 空 buffer → 0（不伪造）", () => {
    expect(parseM4aDurationMs(Buffer.alloc(0))).toBe(0);
    expect(parseM4aDurationMs(Buffer.from("not an mp4 file at all"))).toBe(0);
    expect(parseM4aDurationMs(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]))).toBe(0);
  });
});
