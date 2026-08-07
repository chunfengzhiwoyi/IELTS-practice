/**
 * Supabase 浏览器客户端
 * ------------------------------------------------------------
 * 仅使用 anon key，遵守 RLS。用于 Client Component。
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase 客户端环境变量缺失");
  }
  return createBrowserClient<Database>(url, anonKey);
}
