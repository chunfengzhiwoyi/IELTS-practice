/**
 * GET /api/health/llm
 * ------------------------------------------------------------
 * 轻量检查当前可用 LLM provider 是否可达：
 *   - mock: 永远 ok
 *   - deepseek/bailian: 校验 env 配置 + 对 baseUrl 做短超时探测
 *   - 登录用户自有模型: 若已配置，额外探测其 baseUrl 可达性
 * 口径：服务器默认 provider 或 用户私有模型 任一可达，即视为在线（ok=true）。
 * 不调用真实 LLM，避免费用与延迟。
 * 返回 { ok, provider, scope }，scope ∈ server | user | none。
 */
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { getUserModelConfig } from "@/lib/llm/user-config";

export const runtime = "nodejs";

interface ProviderProbe {
  ok: boolean;
  provider: string;
}

export async function GET() {
  const traceId = crypto.randomUUID();
  try {
    const env = getServerEnv();
    const primary = env.LLM_PRIMARY_PROVIDER;

    // 1) 服务端默认 provider 可达性
    const serverProbe = await probeServerProvider(primary, env);

    // 2) 登录用户自有模型可达性（任一可达即在线）
    let userProbe: ProviderProbe | null = null;
    try {
      const cfg = await getUserModelConfig();
      if (cfg) {
        const reachable = await pingUrl(cfg.baseUrl, 3500);
        userProbe = { ok: reachable, provider: `user:${cfg.modelName}` };
      }
    } catch {
      userProbe = null;
    }

    const ok = serverProbe.ok || (userProbe?.ok ?? false);
    const provider = ok
      ? serverProbe.ok
        ? serverProbe.provider
        : (userProbe?.provider ?? serverProbe.provider)
      : serverProbe.provider || userProbe?.provider || "none";
    const scope: "server" | "user" | "none" = serverProbe.ok
      ? "server"
      : userProbe?.ok
        ? "user"
        : "none";

    return NextResponse.json(
      { ok, provider, scope },
      { headers: { "x-trace-id": traceId } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, provider: "unknown", scope: "none" },
      { status: 503, headers: { "x-trace-id": traceId } },
    );
  }
}

async function probeServerProvider(
  primary: string,
  _env: ReturnType<typeof getServerEnv>,
): Promise<ProviderProbe> {
  if (primary === "mock") {
    return { ok: true, provider: "mock" };
  }
  if (primary === "deepseek") {
    const baseUrl = process.env.DEEPSEEK_BASE_URL;
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!baseUrl || !apiKey) return { ok: false, provider: "deepseek" };
    const reachable = await pingUrl(baseUrl, 4000);
    return { ok: reachable, provider: "deepseek" };
  }
  if (primary === "bailian") {
    const baseUrl = process.env.BAILIAN_BASE_URL;
    const apiKey = process.env.BAILIAN_API_KEY;
    if (!baseUrl || !apiKey) return { ok: false, provider: "bailian" };
    const reachable = await pingUrl(baseUrl, 4000);
    return { ok: reachable, provider: "bailian" };
  }
  return { ok: false, provider: primary };
}

async function pingUrl(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // 对 API baseUrl 发起 HEAD；大部分网关会返回 200/404/405，只要能到达即视为在线
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}
