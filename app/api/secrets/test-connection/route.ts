/**
 * POST /api/secrets/test-connection
 * ------------------------------------------------------------
 * 用用户填写的自有模型配置真实打一次 LLM，校验 baseUrl / 模型名 / API Key 是否可用。
 * 绝不落库；仅返回连通结果。鉴权：登录用户。
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import {
  createUserModelProvider,
  type UserModelProviderConfig,
} from "@/lib/llm/providers/user-model-provider";
import type { LlmProtocol } from "@/lib/llm/catalog";
import { traceIdFromHeaders } from "@/lib/observability/trace";

export const runtime = "nodejs";

const ModelConfigSchema = z.object({
  baseUrl: z.string().min(1),
  modelName: z.string().min(1),
  apiKey: z.string().min(1),
  protocol: z.enum(["openai", "anthropic", "gemini"]).optional(),
});

export async function POST(request: Request) {
  const traceId = traceIdFromHeaders(request.headers);
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  }
  try {
    const cfg = ModelConfigSchema.parse(await request.json()) as UserModelProviderConfig;
    const provider = createUserModelProvider({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      modelName: cfg.modelName,
      protocol: (cfg.protocol as LlmProtocol | undefined) ?? "openai",
    });
    const resp = await provider.chat({
      tier: "fast",
      messages: [{ role: "user", content: "ping" }],
      jsonMode: false,
      temperature: 0.2,
      traceId,
    });
    const content = (resp.content ?? "").trim();
    if (!content) {
      return NextResponse.json({ ok: false, error: "模型返回为空，请检查配置" });
    }
    return NextResponse.json({ ok: true, model: resp.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "连接失败";
    return NextResponse.json({ ok: false, error: msg });
  }
}
