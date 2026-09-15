# 06_SUPABASE_AND_MIGRATIONS.md — Supabase 与 Migration 状态

> 本地部分 = repo 实时；远程部分 = **external verified Supabase state（用户通道，VERIFIED_AT=2026-09-15）**，优先级高于旧 AUTH-SEC-03 BLOCKED evidence。

## 0. 状态修订记录（HANDOFF-02）
- **旧状态**：AUTH-SEC-03 = BLOCKED（Agent 无 DDL 通道，等用户 SQL Editor 执行 0012）——历史 evidence 保留于 `docs/evidence/mobile-03d-today-pilot/auth-sec-03-before-state.json`。
- **新状态**：0012 **DEPLOYED_AND_VERIFIED**（2026-09-15 外部通道核验）。
- 标记：`SUPERSEDED_BY_REMOTE_VERIFICATION`。

## 1. 本地 migration 清单（`supabase/migrations/`）

| 文件 | 用途 | 部署状态 |
|---|---|---|
| 0001_init_schema.sql | 初始 7 表 + set_updated_at/handle_new_auth_user + 2 触发器 | 远程已物化（无 history 记录） |
| 0002_rls_policies.sql | 7 表 RLS + owner 策略 | 同上 |
| 0003_user_secrets.sql | 密钥保险库（RLS ON 无 policy） | 同上 |
| 0004_repository_columns.sql | normalized_term/status/task_type/trace_id | 同上 |
| 0005_account_profile.sql | users 扩展列（wechat_openid 等） | 同上 |
| 0006_storage_avatars.sql | 头像 bucket + objects 策略 | 同上 |
| 0007_wechat_login_states.sql | 微信扫码中间态表 + clean 函数（**曾为暴露源，现已封堵**） | 同上 |
| 0008_data_model_consistency.sql | §1 recall check；§2 ability_observations 四列；§3 speaking_evaluations | **远程缺 §1/§2（缺口→AUTH-SCHEMA-04）** |
| 0009 | 空槽（无文件，deferred） | — |
| 0010_application_evidence.sql | application_evidence 表 + RLS | **远程整表缺失（缺口→AUTH-SCHEMA-04）** |
| 0011_canonical_key.sql | canonical_key 列 + 唯一索引 | 远程已物化（RSR-01） |
| 0012_auth_surface_security_hardening.sql | 安全加固 | **DEPLOYED_AND_VERIFIED（2026-09-15）** |

## 2. 远程已核验状态（项目 nizjfakkmziwanxdcdxd）

### 2.1 Migration history（外部核验，VERIFIED_AT=2026-09-15）
```
20260913131204  remote_schema_recovery_01
20260915123227  auth_surface_security_hardening   ← 0012 对应远程 migration
```

### 2.2 0012 部署后安全事实（全部外部核验）
| 对象 | 事实 |
|---|---|
| public.wechat_login_states | RLS = **ON**；anon SELECT/INSERT/UPDATE/DELETE = **FALSE**；authenticated 同 = **FALSE**；service_role = **TRUE** |
| public.user_secrets | RLS = ON；anon/authenticated CRUD = **FALSE**；service_role CRUD = **TRUE** |
| public.handle_new_auth_user | SECURITY DEFINER = TRUE；search_path = **''**；anon EXECUTE = FALSE；authenticated EXECUTE = FALSE；service_role EXECUTE = TRUE |
| public.clean_expired_wechat_states | search_path = **''**；anon EXECUTE = FALSE；authenticated EXECUTE = FALSE；service_role EXECUTE = TRUE |
| public.set_updated_at | search_path = **''**（trigger contract 不变） |

> 即：AUTH-SEC-01 设计的目标权限模型**已在远程完全实现**。session_json 加密/private schema 迁移仍为后续 P1（未做）。

## 3. 结论
- **REMOTE_STATE = 已验证（2026-09-15 外部通道）**；当前 Agent 仍无 CLI token/DATABASE_URL/DDL 权限（如需再探测走只读 REST 或用户通道）。
- **MIGRATION_HISTORY_DRIFT = YES**：远程 history 仍无 canonical 0001–0011（AUTH-SCHEMA-04 处理）。
- **SCHEMA_STATE = REMOTE_BEHIND**：**0008 §1/§2（ability_observations 缺 level/issues/evidence/suggestions 四列）+ 0010（application_evidence 表缺失）** 仍是真实缺口——auth 加固不覆盖 schema 缺口。

## 4. 部署通道（当前已知）
- 既定 DDL 通道 = 用户 Supabase SQL Editor（0012 已由此路径完成部署）。
- npx supabase CLI v2.117.0 可用但未登录/未 link；Agent 无 DATABASE_URL。
- 禁止：db push 重放 0001–0011、migration repair 未先物化缺口、Dashboard 临时修补。

## 5. 后续（AUTH-SCHEMA-04，engineering gate，未执行）
1. 补远程 0008 §1/§2（ability_observations 四列）
2. 补 0010（application_evidence 表 + RLS）
3. 验证 local/remote schema equality
4. migration history reconciliation（修复 0001–0011 记录）
5. 恢复正常 migration workflow
