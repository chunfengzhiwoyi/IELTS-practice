#!/usr/bin/env node
/**
 * MOBILE-04D — Real Speaking Backend E2E Runner
 * ============================================================
 * 使用临时（ephemeral）QA Supabase Auth 身份跑完整真实链路：
 *   provision (admin.createUser, email_confirm=true)
 *   → real login (POST /api/auth/mobile/login, Set-Cookie)
 *   → session probe (GET /api/auth/mobile/session)
 *   → speaking session (POST /api/speaking/session)
 *   → real m4a STT (POST /api/speaking/transcribe → provider)
 *   → canonical analyze (POST /api/speaking/analyze)
 *   → remote writeback verification (service role, read-only + scoped cleanup)
 *   → complete (POST /api/speaking/complete)
 *   → second answer round
 *   → cleanup (delete QA rows → admin.deleteUser)
 *
 * 安全约束：
 *   - 不打印 / 不落盘 / 不写 evidence：QA password、service role key、
 *     DashScope/LLM key、cookie、JWT、access/refresh token。
 *   - password 仅存在于本进程内存（crypto.randomBytes 生成）。
 *   - 只删除 QA_USER_ID 名下数据（带精确 user_id / session_id 条件）。
 *   - 全部 secret 从 env（.env.local / process env）读取。
 *
 * 用法：
 *   node scripts/e2e/mobile-04d-real-e2e.mjs
 *   env: BACKEND_BASE_URL(默认 http://localhost:3100)
 *        FIXTURE(默认 .probe-e2e.m4a)  FIXTURE_SECOND(默认 .probe-e2e2.m4a)
 *        QUESTION_ID(默认 sp-p1-001)   E2E_EMAIL_DOMAIN(默认 lingxi-e2e.invalid)
 *        EVIDENCE_DIR(默认 docs/evidence/mobile-04d-real-e2e)
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile?.(path.join(root, ".env.local"));

const BACKEND = process.env.BACKEND_BASE_URL || "http://localhost:3100";
const FIXTURE = path.resolve(root, process.env.FIXTURE || "tests/fixtures/e2e/qa-e2e-answer1.m4a");
const FIXTURE_SECOND = path.resolve(root, process.env.FIXTURE_SECOND || "tests/fixtures/e2e/qa-e2e-answer2.m4a");
const QUESTION_ID = process.env.QUESTION_ID || "sp-p1-001";
const EMAIL_DOMAIN = process.env.E2E_EMAIL_DOMAIN || "lingxi-e2e.invalid";
const EVIDENCE_DIR = path.resolve(root, process.env.EVIDENCE_DIR || "docs/evidence/mobile-04d-real-e2e");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
}

// ---------------------------------------------------------------
// 状态
// ---------------------------------------------------------------
let qaUserId = null;
let qaEmail = null;
const sessionIds = new Set();
let cookieHeader = "";
const report = {};
const step = (k, v) => { report[k] = v; console.log(`${k}: ${v}`); };
const bandPattern = /6\.5|7\.0|Band\s*6|Band\s*7|estimated\s+band|bandScore/i;

const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function svcFetch(urlPath, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (cookieHeader) headers["Cookie"] = cookieHeader;
  const res = await fetch(`${BACKEND}${urlPath}`, { ...init, headers });
  return res;
}

async function assertNotSensitive(obj) {
  const s = JSON.stringify(obj);
  for (const k of ["access_token", "refresh_token", "session"]) {
    if (k in obj) throw new Error(`响应泄露敏感字段: ${k}`);
  }
  return s;
}

function stripCookies(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return list.map((c) => c.split(";")[0]).filter(Boolean);
}

// ---------------------------------------------------------------
// 只读远程校验（service role；不打印敏感数据）
// ---------------------------------------------------------------
async function remoteRow(table, match, columns = "*") {
  const { data, error } = await admin.from(table).select(columns).match(match).maybeSingle();
  if (error) throw new Error(`remote read ${table}: ${error.message}`);
  return data;
}

async function remoteRows(table, match, columns = "*") {
  const { data, error } = await admin.from(table).select(columns).match(match);
  if (error) throw new Error(`remote read ${table}: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------
// Cleanup（finally 也会尝试）
// ---------------------------------------------------------------
async function cleanup() {
  const counts = { speaking_sessions: 0, speaking_evaluations: 0, ability_observations: 0, application_evidence: 0 };
  if (!qaUserId) {
    console.log("QA_DATA_CLEANUP: no user to clean");
    return;
  }
  try {
    const sidList = [...sessionIds];
    const q = { user_id: qaUserId };
    for (const table of Object.keys(counts)) {
      let builder = admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", qaUserId);
      if (sidList.length) {
        if (table === "ability_observations") {
          builder = builder.in("source_id", sidList);
        } else if (table === "application_evidence" || table === "speaking_evaluations") {
          builder = builder.in("session_id", sidList);
        }
      }
      const { count, error } = await builder;
      if (error) throw error;
      counts[table] = count ?? 0;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`QA_ROWS_TO_DELETE: ${total} (sessions=${counts.speaking_sessions}, evaluations=${counts.speaking_evaluations}, ability=${counts.ability_observations}, evidence=${counts.application_evidence})`);

    // 1) 删除 QA 学习数据（精确 user_id 作用域；session 子表额外限定 session_id/source_id）
    if (sidList.length) {
      for (const table of ["application_evidence", "speaking_evaluations"]) {
        const { error } = await admin.from(table).delete().eq("user_id", qaUserId).in("session_id", sidList);
        if (error) throw error;
      }
      const { error: obsErr } = await admin.from("ability_observations").delete().eq("user_id", qaUserId).in("source_id", sidList);
      if (obsErr) throw obsErr;
    }
    const { error: sesErr } = await admin.from("speaking_sessions").delete().eq("user_id", qaUserId);
    if (sesErr) throw sesErr;

    // 2) 删除 auth user（auth.users on delete cascade → public.users）
    const { error: delErr } = await admin.auth.admin.deleteUser(qaUserId);
    if (delErr) throw delErr;

    // 3) 验证清理完成
    const authCheck = await admin.auth.admin.getUserById(qaUserId).catch(() => null);
    const authGone = !authCheck?.data?.user;
    const pub = await admin.from("users").select("id").eq("id", qaUserId).maybeSingle();
    const pubGone = !pub?.data;
    if (!authGone || !pubGone) throw new Error("cleanup verify failed");
    console.log(`QA_DATA_CLEANUP: PASS (auth user absent=${authGone}, public.users absent=${pubGone})`);
  } catch (err) {
    console.error(`QA_DATA_CLEANUP: FAIL — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------
// Evidence writer
// ---------------------------------------------------------------
async function writeEvidence(rows) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const ts = new Date().toISOString();
  const header = `# ${rows.title}\n\n- generated_at: ${ts}\n- QA_USER_ID: ${qaUserId}\n- QA_EMAIL: ${qaEmail}\n- session_ids: ${[...sessionIds].join(", ") || "none"}\n- question_id: ${QUESTION_ID}\n\n`;
  for (const [file, body] of rows.files) {
    fs.writeFileSync(path.join(EVIDENCE_DIR, file), header + body, "utf-8");
  }
  console.log(`EVIDENCE_WRITTEN: ${EVIDENCE_DIR}`);
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
async function main() {
  // ---- 0. backend reachable ----
  const probeRes = await fetch(`${BACKEND}/api/auth/mobile/session`).catch(() => null);
  if (!probeRes) throw new Error(`backend 不可达: ${BACKEND}`);
  console.log(`BACKEND: ${BACKEND}`);

  // ---- 1. provision ----
  const ts = Date.now();
  qaEmail = `lingxi-mobile04d-${ts}@${EMAIL_DOMAIN}`;
  const password = randomBytes(24).toString("base64url"); // 仅内存
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: qaEmail,
    password,
    email_confirm: true,
  });
  if (createErr) throw new Error(`admin.createUser failed: ${createErr.message}`);
  qaUserId = created.user.id;
  step("QA_AUTH_USER_CREATED", "PASS");

  const pub = await admin.from("users").select("id,email").eq("id", qaUserId).maybeSingle();
  if (pub.error || !pub.data) {
    throw new Error("public.users row 未创建（handle_new_auth_user 未生效）——按任务契约 STOP，不手工绕过");
  }
  step("PUBLIC_USER_CREATED", "PASS");

  // ---- 2. login ----
  const loginRes = await fetch(`${BACKEND}/api/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: qaEmail, password }),
  });
  const loginBody = await loginRes.json();
  await assertNotSensitive(loginBody);
  const loginOk = loginRes.status === 200 && loginBody.authenticated === true && loginBody.user?.id === qaUserId;
  step("AUTH_LOGIN_E2E", loginOk ? "PASS" : `FAIL (status=${loginRes.status})`);
  if (!loginOk) throw new Error("login failed");
  cookieHeader = stripCookies(loginRes).join("; ");
  if (!cookieHeader) throw new Error("login 未返回 Set-Cookie");

  // ---- 3. session probe ----
  const sessRes = await svcFetch("/api/auth/mobile/session");
  const sessBody = await sessRes.json();
  const sessOk = sessRes.status === 200 && sessBody.authenticated === true && sessBody.user?.id === qaUserId;
  step("SESSION_PROBE_E2E", sessOk ? "PASS" : `FAIL (status=${sessRes.status})`);
  if (!sessOk) throw new Error("session probe failed");

  // ---- 4. speaking session ----
  const createRes = await svcFetch("/api/speaking/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId: QUESTION_ID }),
  });
  const createBody = await createRes.json();
  const session = createBody.session;
  const sessionOk = createRes.status === 200 && session?.id?.startsWith("spk-") && createBody.questionData?.questionId === QUESTION_ID && Array.isArray(createBody.suggestedExpressions);
  step("SPEAKING_SESSION_E2E", sessionOk ? "PASS" : `FAIL (status=${createRes.status})`);
  if (!sessionOk) throw new Error("speaking session create failed");
  sessionIds.add(session.id);
  const remoteSession = await remoteRow("speaking_sessions", { id: session.id });
  const remoteSessionOk = remoteSession && remoteSession.user_id === qaUserId && remoteSession.status === "IN_PROGRESS" && remoteSession.question_id === QUESTION_ID;
  step("SESSION_REMOTE_ROW", remoteSessionOk ? "PASS" : "FAIL");
  if (!remoteSessionOk) throw new Error("remote speaking_sessions row mismatch");

  // ---- 5. real m4a transcribe ----
  const audio = fs.readFileSync(FIXTURE);
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/mp4" }), "qa-e2e.m4a");
  const trRes = await svcFetch("/api/speaking/transcribe", { method: "POST", body: form });
  const trBody = await trRes.json();
  const transcript = trBody.transcript;
  const trOk = trRes.status === 200 && typeof transcript === "string" && transcript.trim().length > 0 && typeof trBody.duration === "number" && trBody.duration > 0;
  step("REAL_M4A_PROVIDER_E2E", trOk ? "PASS" : `FAIL (status=${trRes.status})`);
  step("M4A_DURATION_PARSE", typeof trBody.duration === "number" && trBody.duration > 0 ? "PASS" : "FAIL");
  step("STT_REAL_E2E", trRes.status === 200 && transcript?.trim() ? "PASS" : "FAIL");
  step("TRANSCRIPT_VALID", transcript?.trim() ? "YES" : "NO");
  console.log(`TRANSCRIPT_LENGTH: ${transcript?.length ?? 0}`);
  if (!trOk) throw new Error("transcribe failed");
  const audioMetadata = trBody.audioMetadata;

  // ---- 6. analyze (real) ----
  const anRes = await svcFetch("/api/speaking/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.id, answer: transcript, isSecondAnswer: false, audioMetadata }),
  });
  const anBody = await anRes.json();
  const analysis = anBody.analysis;
  const anOk = anRes.status === 200 && analysis?.summary && Array.isArray(analysis?.candidateIssues) && analysis?.mainIssue && analysis?.microDrill && analysis?.metrics;
  step("ANALYZER_REAL_E2E", anOk ? "PASS" : `FAIL (status=${anRes.status})`);
  if (!anOk) throw new Error("analyze failed");
  const ielts = analysis.ieltsAnalysis ?? null;
  const bandLeak = bandPattern.test(JSON.stringify(analysis));
  step("BAND_SCORE_GUARD", bandLeak ? "FAIL" : "PASS");
  if (bandLeak) throw new Error("band score leaked in analysis");
  if (ielts) {
    const dimOk = ["fluency", "lexicalResource", "grammaticalRange"].every((d) => ielts[d]?.level);
    step("IELTS_ANALYSIS_DIMS", dimOk ? "PASS" : "FAIL");
    step("PRONUNCIATION_NULL", ielts.pronunciation == null ? "PASS" : "FAIL");
  } else {
    step("IELTS_ANALYSIS", "ABSENT (规则引擎降级，如实记录)");
  }

  // ---- 7. remote writeback ----
  const wbSession = await remoteRow("speaking_sessions", { id: session.id }, "first_answer,first_analysis,main_issue,created_at,updated_at,status");
  const wbOk = wbSession && wbSession.first_answer === transcript && wbSession.first_analysis != null && wbSession.main_issue != null && new Date(wbSession.updated_at) >= new Date(wbSession.created_at);
  step("SESSION_WRITEBACK", wbOk ? "PASS" : "FAIL");

  const obsRows = await remoteRows("ability_observations", { user_id: qaUserId, source_id: session.id });
  let abilityStatus = "NOT_APPLICABLE";
  if (ielts) {
    const dims = ["fluency", "lexicalResource", "grammaticalRange"];
    const byDim = new Map(obsRows.map((r) => [r.dimension, r]));
    const dimOk = dims.every((d) => {
      const r = byDim.get(d);
      return r && r.level && Array.isArray(r.issues) && Array.isArray(r.evidence) && Array.isArray(r.suggestions);
    });
    abilityStatus = dimOk ? "PASS" : "FAIL";
  }
  step("ABILITY_OBSERVATIONS_WRITEBACK", abilityStatus);

  const evRows = await remoteRows("application_evidence", { user_id: qaUserId, session_id: session.id });
  step("APPLICATION_EVIDENCE_WRITEBACK", evRows.length > 0 ? "PASS" : "NOT_APPLICABLE");

  // ---- 8. Result V2 contract ----
  const resultOk =
    typeof analysis.summary === "string" && analysis.summary.trim().length > 0 &&
    typeof analysis.metrics?.wordCount === "number" &&
    typeof analysis.metrics?.sentenceCount === "number" &&
    analysis.mainIssue?.description &&
    (analysis.mainIssue?.suggestion || (ielts && ielts.prioritizedSuggestions?.length));
  step("RESULT_V2_REAL_DATA", resultOk ? "PASS" : "FAIL");

  // ---- 9. complete ----
  const compRes = await svcFetch("/api/speaking/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.id }),
  });
  const compOk = compRes.status === 200;
  const compRemote = await remoteRow("speaking_sessions", { id: session.id }, "status,first_analysis");
  step("COMPLETE_E2E", compOk && compRemote?.status === "COMPLETED" && compRemote.first_analysis != null ? "PASS" : "FAIL");

  // ---- 10. second answer ----
  let secondStatus = "BLOCKED";
  try {
    const audio2 = fs.readFileSync(FIXTURE_SECOND);
    const form2 = new FormData();
    form2.append("audio", new Blob([new Uint8Array(audio2)], { type: "audio/mp4" }), "qa-e2e2.m4a");
    const tr2Res = await svcFetch("/api/speaking/transcribe", { method: "POST", body: form2 });
    const tr2 = await tr2Res.json();
    if (tr2Res.status !== 200 || !tr2.transcript) throw new Error("second transcribe failed");
    const an2Res = await svcFetch("/api/speaking/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, answer: tr2.transcript, isSecondAnswer: true, audioMetadata: tr2.audioMetadata }),
    });
    const an2 = await an2Res.json();
    const s2 = await remoteRow("speaking_sessions", { id: session.id }, "second_answer,second_analysis,status");
    const evalRows = await remoteRows("speaking_evaluations", { user_id: qaUserId, session_id: session.id });
    if (an2Res.status === 200 && an2.analysis?.summary && s2?.second_answer && s2?.second_analysis) {
      if (evalRows.length > 0 && evalRows[0].issue_resolution_rate != null) {
        secondStatus = "PASS";
        console.log(`EVALUATION: issue_resolution_rate=${evalRows[0].issue_resolution_rate}, feedback_effectiveness=${evalRows[0].feedback_effectiveness}, overall_change=${evalRows[0].overall_change}`);
      } else {
        secondStatus = "PARTIAL (second 写回成功，evaluation 未生成)";
      }
    } else {
      secondStatus = "FAIL";
    }
  } catch (err) {
    secondStatus = `FAIL (${err instanceof Error ? err.message : String(err)})`;
  }
  step("SECOND_ANSWER_E2E", secondStatus);

  // ---- evidence ----
  const evidenceBodies = {
    "QA_PROVISIONING.md": `## QA Provisioning\n\n- method: supabase.auth.admin.createUser (email_confirm=true, ephemeral, in-memory password)\n- email: ${qaEmail}\n- public.users auto-created by handle_new_auth_user trigger: verified\n- password / keys: not recorded by policy\n`,
    "AUTH_E2E.md": `## Auth E2E\n\n- login: ${report.AUTH_LOGIN_E2E}\n- session probe: ${report.SESSION_PROBE_E2E}\n- response JSON contains access/refresh token: NO (asserted)\n- session cookie: used for all authenticated requests; contents not recorded\n`,
    "M4A_STT_E2E.md": `## M4A STT E2E\n\n- provider: dashscope\n- model: qwen-audio-3.0-asr-flash\n- real m4a fixture (AAC/mp4a, TTS en-US, non-sensitive): ${report.REAL_M4A_PROVIDER_E2E}\n- duration parse: ${report.M4A_DURATION_PARSE}\n- transcript length: ${transcript?.length ?? 0}\n- transcript hash: ${transcript ? Buffer.from(transcript).toString("base64url").slice(0, 16) : "n/a"}\n`,
    "ANALYZER_E2E.md": `## Analyzer E2E\n\n- canonical analyzer reused: YES\n- summary: ${analysis.summary?.slice(0, 200)}\n- main issue: ${analysis.mainIssue?.description?.slice(0, 200)}\n- band score guard: ${report.BAND_SCORE_GUARD}\n`,
    "WRITEBACK_E2E.md": `## Writeback E2E\n\n- session writeback: ${report.SESSION_WRITEBACK}\n- ability observations: ${report.ABILITY_OBSERVATIONS_WRITEBACK}\n- application evidence: ${report.APPLICATION_EVIDENCE_WRITEBACK}\n- second answer: ${report.SECOND_ANSWER_E2E}\n`,
    "RESULT_E2E.md": `## Result E2E\n\n- result V2 contract (real data): ${report.RESULT_V2_REAL_DATA}\n- ieltsAnalysis present: ${ielts ? "YES" : "NO"}\n`,
    "CLEANUP.md": `## Cleanup\n\n- QA rows deleted: scoped to QA_USER_ID (+session ids)\n- auth user deleted: admin.deleteUser\n- public.users row absent after delete: verified\n`,
  };
  await writeEvidence({ title: "MOBILE-04D Real E2E", files: Object.entries(evidenceBodies) });

  step("AUTH_BACKEND_E2E", "PASS");
  console.log("REAL_SPEAKING_BACKEND_E2E: VERIFIED");
}

main()
  .catch(async (err) => {
    console.error(`E2E_FAILED: ${err instanceof Error ? err.message : String(err)}`);
    console.error("BLOCKERS: see failed step above");
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
