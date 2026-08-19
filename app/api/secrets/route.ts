/**
 * 密钥保险库端点（服务端信封加密）
 * ------------------------------------------------------------
 * POST：接收用户明文 API Key / ima 凭证 → 服务端加密 → 存 user_secrets（密文）。
 *       绝不回传明文，绝不落库明文。
 * GET ：返回解密后的明文（仅本端 HTTPS 使用；这是用户自己的 Key，用于本地调用 LLM）。
 *
 * 鉴权：getCurrentUser（demo 模式返回固定 demo 用户；supabase 模式走 JWT）。
 * DB 操作使用 service_role 客户端（绕过 RLS；RLS 已拒绝客户端直读 user_secrets）。
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { encryptSecret, decryptSecret, type CipherBundle } from "@/lib/crypto/envelope";
import { z } from "zod";

export const runtime = "nodejs";

const modelConfigSchema = z.object({
  baseUrl: z.string().min(1),
  modelName: z.string().min(1),
  apiKey: z.string().min(1),
  protocol: z.enum(["openai", "anthropic", "gemini"]).optional(),
});
const imaConfigSchema = z.object({
  clientId: z.string().min(1),
  apiKey: z.string().min(1),
  knowledgeBaseId: z.string().optional(),
});
const postSchema = z.object({
  modelConfig: modelConfigSchema.optional(),
  imaConfig: imaConfigSchema.optional(),
});

function requireSupabase() {
  const env = getServerEnv();
  if (!env.supabase) {
    throw new Error("密钥保险库仅在 AUTH_MODE=supabase 或 DATA_PROVIDER=supabase 时可用");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
    requireSupabase();

    const body = postSchema.parse(await request.json());
    const updates: Record<string, unknown> = {};

    if (body.modelConfig) {
      updates.model_config_cipher = encryptSecret(body.modelConfig);
    }
    if (body.imaConfig) {
      updates.ima_config_cipher = encryptSecret(body.imaConfig);
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "无可写入的密钥" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("user_secrets")
      .upsert({ user_id: user.id, ...updates, updated_at: new Date().toISOString() });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    // 注意：不回传明文
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    const status = msg.includes("请先登录") ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
    requireSupabase();

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("user_secrets")
      .select("model_config_cipher, ima_config_cipher")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: true, modelConfig: null, imaConfig: null });
    }

    const modelConfig = data.model_config_cipher
      ? decryptSecret(data.model_config_cipher as unknown as CipherBundle)
      : null;
    const imaConfig = data.ima_config_cipher
      ? decryptSecret(data.ima_config_cipher as unknown as CipherBundle)
      : null;
    return NextResponse.json({ ok: true, modelConfig, imaConfig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    const status = msg.includes("请先登录") ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
