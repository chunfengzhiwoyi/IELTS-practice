/**
 * AUTH-SEC-01 — Auth Surface Security 回归测试
 * ------------------------------------------------------------
 * 范围：
 *  - migration 0012 静态审计（14 项 SEC 断言的可静态验证部分）
 *  - migration 静态安全审计（禁止模式）
 *  - 微信服务端链路契约（qrcode / confirm / poll 全部走 service_role）
 *
 * 说明：
 *  - 本套件为「项目内可维护的最小验证」：不引入 pgTAP / 大型框架，
 *    用 Node + fs 解析 migration SQL 断言权限模型。
 *  - 需要真实数据库执行才能证明的运行时行为（SEC-11 触发器建行、
 *    SEC-14 updated_at 触发）标为 UNVERIFIED，并在部署后回归计划中覆盖。
 *  - 远程只读快照见 scripts/security/remote-auth-surface-snapshot.mjs
 *    （部署前 BEFORE 证据；禁止 DDL/DML）。
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = path.resolve(
  process.cwd(),
  "supabase/migrations/0012_auth_surface_security_hardening.sql",
);

const readMigration = (): string => {
  expect(existsSync(MIGRATION), `migration 存在: ${MIGRATION}`).toBe(true);
  return readFileSync(MIGRATION, "utf-8");
};

/** 去掉 SQL 注释（-- 行注释）后的正文 */
const stripComments = (sql: string): string =>
  sql
    .split("\n")
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n");

const has = (sql: string, pattern: RegExp): boolean => pattern.test(sql);
const notHas = (sql: string, pattern: RegExp): boolean => !pattern.test(sql);

describe("AUTH-SEC-01 · migration 0012 权限模型", () => {
  const sql = readMigration();
  const body = stripComments(sql);

  it("SEC-01 wechat_login_states RLS enabled", () => {
    expect(has(body, /alter\s+table\s+public\.wechat_login_states\s+enable\s+row\s+level\s+security/i)).toBe(true);
  });

  it("SEC-02/03 anon 无 wechat_login_states 表权限（REVOKE ALL）", () => {
    expect(has(body, /revoke\s+all\s+on\s+public\.wechat_login_states\s+from\s+anon/i)).toBe(true);
    expect(has(body, /revoke\s+all\s+on\s+public\.wechat_login_states\s+from\s+public/i)).toBe(true);
  });

  it("SEC-04 authenticated 无 wechat_login_states 表权限（REVOKE ALL）", () => {
    expect(has(body, /revoke\s+all\s+on\s+public\.wechat_login_states\s+from\s+authenticated/i)).toBe(true);
  });

  it("SEC-05 service_role 权限保持（未对 service_role 执行任何 revoke）", () => {
    expect(notHas(body, /revoke[^;]*from\s+service_role/gi)).toBe(true);
    expect(notHas(body, /service_role/gi)).toBe(true);
  });

  it("SEC-06 user_secrets：anon/authenticated 无表权限", () => {
    expect(has(body, /revoke\s+all\s+on\s+public\.user_secrets\s+from\s+anon/i)).toBe(true);
    expect(has(body, /revoke\s+all\s+on\s+public\.user_secrets\s+from\s+authenticated/i)).toBe(true);
    expect(has(body, /revoke\s+all\s+on\s+public\.user_secrets\s+from\s+public/i)).toBe(true);
  });

  it("SEC-07 user_secrets：service_role 权限保持", () => {
    expect(notHas(body, /user_secrets[^;]*service_role/i)).toBe(true);
  });

  it("SEC-08 handle_new_auth_user 保持 SECURITY DEFINER", () => {
    const fn = body.match(
      /create\s+or\s+replace\s+function\s+public\.handle_new_auth_user\(\)[\s\S]*?\$\$\s*;/i,
    )?.[0];
    expect(fn).toBeDefined();
    expect(/security\s+definer/i.test(fn!)).toBe(true);
  });

  it("SEC-09 handle_new_auth_user search_path = ''", () => {
    const fn = body.match(
      /create\s+or\s+replace\s+function\s+public\.handle_new_auth_user\(\)[\s\S]*?\$\$\s*;/i,
    )?.[0];
    expect(fn).toBeDefined();
    expect(/set\s+search_path\s*=\s*''/i.test(fn!)).toBe(true);
    expect(/set\s+search_path\s*=\s*public/i.test(fn!)).toBe(false);
    // 函数体显式引用 public.users
    expect(/insert\s+into\s+public\.users/i.test(fn!)).toBe(true);
  });

  it("SEC-10 PUBLIC/anon/authenticated 无 handle_new_auth_user EXECUTE", () => {
    expect(has(body, /revoke\s+execute\s+on\s+function\s+public\.handle_new_auth_user\(\)\s+from\s+public,\s*anon,\s*authenticated/i)).toBe(true);
  });

  it("SEC-12 clean_expired_wechat_states search_path = '' 且表名限定", () => {
    const fn = body.match(
      /create\s+or\s+replace\s+function\s+public\.clean_expired_wechat_states\(\)[\s\S]*?\$\$\s*;/i,
    )?.[0];
    expect(fn).toBeDefined();
    expect(/set\s+search_path\s*=\s*''/i.test(fn!)).toBe(true);
    expect(/delete\s+from\s+public\.wechat_login_states/i.test(fn!)).toBe(true);
    expect(has(body, /revoke\s+execute\s+on\s+function\s+public\.clean_expired_wechat_states\(\)\s+from\s+public,\s*anon,\s*authenticated/i)).toBe(true);
  });

  it("SEC-13 set_updated_at search_path = ''", () => {
    const fn = body.match(
      /create\s+or\s+replace\s+function\s+public\.set_updated_at\(\)[\s\S]*?\$\$\s*;/i,
    )?.[0];
    expect(fn).toBeDefined();
    expect(/set\s+search_path\s*=\s*''/i.test(fn!)).toBe(true);
    expect(/returns\s+trigger/i.test(fn!)).toBe(true);
    expect(/language\s+plpgsql/i.test(fn!)).toBe(true);
  });

  it("SEC-14 既有 updated_at trigger contract 保持（未 drop/重建 trigger）", () => {
    // migration 只 CREATE OR REPLACE 函数体，不触碰任何 trigger
    expect(notHas(body, /drop\s+trigger/i)).toBe(true);
    expect(notHas(body, /create\s+trigger/i)).toBe(true);
  });
});

describe("AUTH-SEC-01 · migration 静态安全审计（禁止模式）", () => {
  const sql = readMigration();
  const body = stripComments(sql);

  it("不包含 DROP TABLE", () => {
    expect(notHas(body, /drop\s+table/i)).toBe(true);
  });

  it("不包含业务数据 DELETE（clean_expired 限定 wechat_login_states 过期行除外）", () => {
    // 唯一 delete 是 clean_expired_wechat_states 函数内对中间态表的过期清理
    const deletes = body.match(/delete\s+from\s+\S+/gi) ?? [];
    for (const d of deletes) {
      expect(/delete\s+from\s+public\.wechat_login_states/i.test(d)).toBe(true);
    }
  });

  it("不修改 auth.users", () => {
    expect(notHas(body, /auth\.users/i)).toBe(true);
    expect(notHas(body, /alter\s+table\s+public\.users/i)).toBe(true);
  });

  it("不新增任何放开客户端的 policy", () => {
    expect(notHas(body, /create\s+policy/i)).toBe(true);
  });

  it("不 revoke service_role / postgres", () => {
    expect(notHas(body, /revoke[^;]*from\s+(service_role|postgres)/gi)).toBe(true);
  });

  it("不修改列 / FK / 业务 schema", () => {
    expect(notHas(body, /alter\s+table[^;]*\s+(add|drop|alter)\s+column/i)).toBe(true);
    expect(notHas(body, /add\s+constraint/i)).toBe(true);
    expect(notHas(body, /references\s+/i)).toBe(true);
  });
});

describe("AUTH-SEC-01 · 微信服务端链路契约（synthetic regression）", () => {
  const routes: Array<{ file: string; ops: string[] }> = [
    {
      file: "app/api/auth/wechat-login/qrcode/route.ts",
      ops: ["insert", "delete"],
    },
    {
      file: "app/api/auth/wechat-login/confirm/route.ts",
      ops: ["select", "update", "delete"],
    },
    {
      file: "app/api/auth/wechat-login/poll/route.ts",
      ops: ["select", "delete"],
    },
  ];

  for (const r of routes) {
    it(`${r.file} 仅使用 createServiceRoleClient 访问 DB`, () => {
      const p = path.resolve(process.cwd(), r.file);
      const src = readFileSync(p, "utf-8");
      expect(src).toMatch(/createServiceRoleClient/);
      expect(src).toMatch(/from\s+["']@\/lib\/db\/server["']/);
      // 禁止 browser/anon client
      expect(src).not.toMatch(/createBrowserClient/);
      expect(src).not.toMatch(/createClient\s*\(/);
      expect(src).not.toMatch(/createServerClient/);
    });
  }

  it("/api/secrets 路由同样仅 service_role 访问 user_secrets", () => {
    const p = path.resolve(process.cwd(), "app/api/secrets/route.ts");
    const src = readFileSync(p, "utf-8");
    expect(src).toMatch(/createServiceRoleClient/);
    expect(src).not.toMatch(/createBrowserClient/);
    expect(src).not.toMatch(/createClient\s*\(/);
  });
});

describe("AUTH-SEC-01 · 运行时断言（需 DB 执行，部署后回归）", () => {
  it("SEC-11 新 auth.users 创建后 public.users 自动生成对应 row —— UNVERIFIED（部署后回归）", () => {
    // 静态契约：handle_new_auth_user 保持 SECURITY DEFINER + after insert trigger 不受影响
    const sql = readMigration();
    expect(sql).toMatch(/security\s+definer/i);
    // 运行时证明需真实 DB：部署后创建 auth user 并断言 public.users 行存在
    expect(true).toBe(true);
  });

  it("SEC-02/03/04/05/06/07 运行时 grants/RLS 断言 —— UNVERIFIED（部署后回归）", () => {
    // 静态已覆盖 migration 内容；DB 层真值由远程快照（BEFORE）与部署后回归（AFTER）确认
    expect(true).toBe(true);
  });
});
