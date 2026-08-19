/**
 * 用户自带模型 / ima 配置解析
 * ------------------------------------------------------------
 * 从 user_secrets（服务端信封加密）读取当前登录用户填写的
 * 模型配置与 ima 配置，解密后供 LLM 调用链 / 检索使用。
 *
 * 仅服务端使用（解密需要 KEK）。任何报错都安全降级为 null，
 * 调用方回落到环境变量 / mock Provider。
 */
import "server-only";

import type { LlmProtocol } from "@/lib/llm/catalog";
import { getCurrentUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/db/server";
import { decryptSecret, type CipherBundle } from "@/lib/crypto/envelope";
import { resolveProviders } from "@/lib/llm/provider-registry";
import { createUserModelProvider } from "@/lib/llm/providers/user-model-provider";
import type { CallStructuredOptions } from "@/lib/llm/structured-output";

export interface ModelConfig {
  baseUrl: string;
  modelName: string;
  apiKey: string;
  /** 协议类型；旧数据缺省按 openai 兼容处理（向后兼容） */
  protocol?: LlmProtocol;
}

export interface ImaConfig {
  clientId: string;
  apiKey: string;
  knowledgeBaseId?: string;
}

/** 读取并解密用户的模型配置（无则返回 null）。 */
export async function getUserModelConfig(): Promise<ModelConfig | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("user_secrets")
      .select("model_config_cipher")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data?.model_config_cipher) return null;
    return decryptSecret<ModelConfig>(data.model_config_cipher as unknown as CipherBundle);
  } catch {
    return null;
  }
}

/** 读取并解密用户的 ima 配置（无则返回 null）。 */
export async function getUserImaConfig(): Promise<ImaConfig | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("user_secrets")
      .select("ima_config_cipher")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data?.ima_config_cipher) return null;
    return decryptSecret<ImaConfig>(data.ima_config_cipher as unknown as CipherBundle);
  } catch {
    return null;
  }
}

/**
 * 若用户配置了自有模型，返回 overrideProviders：
 *   primary = 用户的 OpenAI 兼容 Provider
 *   fallback = 环境变量解析出的 fallback（可能为 null）
 * 否则返回 null（调用方走默认 env / mock 解析）。
 */
export async function getUserOverrideProviders(): Promise<
  CallStructuredOptions["overrideProviders"] | null
> {
  const cfg = await getUserModelConfig();
  if (!cfg) return null;
  const env = resolveProviders();
  return {
    primary: createUserModelProvider(cfg),
    fallback: env.fallback,
    fallbackEnabled: Boolean(env.fallback),
  };
}
