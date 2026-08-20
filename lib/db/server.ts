/**
 * Supabase 服务端客户端
 * ------------------------------------------------------------
 * 直接从 process.env 读取，不依赖 getServerEnv().supabase（避免因缺某个变量导致全部不可用）。
 */
import { cookies } from "next/headers";
import {
  createServerClient as createSSRServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

/**
 * 基于登录 Cookie 的服务端客户端。所有查询遵守 RLS。
 */
export async function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("[db] Supabase 未配置：缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  const cookieStore = await cookies();

  return createSSRServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component 中不能 set cookie，忽略
        }
      },
    },
  });
}

/**
 * Service Role 客户端 —— 绕过 RLS。
 * 仅用于系统级操作（profile 更新、admin 操作等）。
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("[db] Supabase 未配置：缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
