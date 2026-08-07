/**
 * Supabase 服务端客户端
 * ------------------------------------------------------------
 * 交接单 §9.2：
 *   - service role key 只在服务端使用
 *   - 前端不得持有 service role key
 *
 * 提供两种客户端：
 *   1. createServerClient()      基于登录 Cookie，走 RLS。用于 Route Handler / Server Action
 *   2. createServiceRoleClient() 绕过 RLS，仅用于系统级维护任务（迁移、后台清理）
 */
import { cookies } from "next/headers";
import {
  createServerClient as createSSRServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types";

/**
 * 基于登录 Cookie 的服务端客户端。所有查询遵守 RLS。
 * 必须在 Server Component / Route Handler / Server Action 中调用。
 */
export async function createServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createSSRServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
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
    },
  );
}

/**
 * Service Role 客户端 —— 绕过 RLS。
 * 仅用于系统级操作（迁移、种子数据、后台任务）；
 * 严禁传入用户输入直接执行查询。
 */
export function createServiceRoleClient() {
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
