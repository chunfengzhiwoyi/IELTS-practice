/**
 * AUTH-SEC-01 — Remote Auth Surface Read-Only Snapshot
 * ------------------------------------------------------------
 * 部署前 BEFORE 基线证据（AUTH-SEC-00 已核验事实 + REST 只读验证）。
 * 只读：SELECT（limit=0，不读任何业务行）+ HTTP 状态码探测。
 * 禁止：DDL / DML / 写操作。
 *
 * 输出结构（按报告字段）：
 *   wechat_login_states: { rls, acl, anon_http, service_http }
 *   user_secrets:        { rls, acl, anon_http, service_http }
 *   functions:           { handle_new_auth_user, clean_expired_wechat_states, set_updated_at }
 */
import process from "node:process";
import path from "node:path";

try {
  process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
} catch {
  // 文件缺失时回退到已有环境变量
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 未配置，无法快照");
  process.exit(2);
}

/** 只读探测：limit=0 不返回任何业务行，仅证明权限/HTTP 状态 */
async function probe(table, key, label) {
  const url = `${URL}/rest/v1/${table}?select=*&limit=0`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    const body = await res.text();
    return { http: res.status, bodyPrefix: body.slice(0, 60), role: label };
  } catch (err) {
    return { http: "NETWORK_ERROR", error: String(err).slice(0, 120), role: label };
  }
}

const snapshot = {
  taken_at: new Date().toISOString(),
  project: "nizjfakkmziwanxdcdxd",
  // 下列字段来自 AUTH-SEC-00 人工核验事实（Supabase Dashboard/psql）
  wechat_login_states: {
    rls: "OFF",
    acl: "anon=ALL, authenticated=ALL, service_role=ALL (explicit)",
    session_json_contains_full_supabase_session: "YES (confirm/route.ts 写入 session 全量对象)",
  },
  user_secrets: {
    rls: "ON",
    acl: "service_role=ALL (explicit); anon/authenticated=RLS-deny(no policy)",
  },
  functions: {
    handle_new_auth_user: { prosecdef: true, search_path: "public (mutable per Advisor)" },
    clean_expired_wechat_states: { search_path: "mutable (Advisor)" },
    set_updated_at: { search_path: "mutable (Advisor)" },
  },
};

const [wAnon, wSvc] = await Promise.all([
  probe("wechat_login_states", ANON, "anon"),
  probe("wechat_login_states", SERVICE, "service_role"),
]);
const [sAnon, sSvc] = await Promise.all([
  probe("user_secrets", ANON, "anon"),
  probe("user_secrets", SERVICE, "service_role"),
]);

snapshot.wechat_login_states.anon_http = wAnon;
snapshot.wechat_login_states.service_http = wSvc;
snapshot.user_secrets.anon_http = sAnon;
snapshot.user_secrets.service_http = sSvc;

console.log(JSON.stringify(snapshot, null, 2));
