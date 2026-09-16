// MOBILE-04C Phase 1.1 — read-only remote schema probe (PostgREST, service-role)
// Usage: node --env-file=.env.local scripts/probe-remote-schema.mjs
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) { console.error("missing env"); process.exit(1); }

async function probe(label, path) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    const text = await res.text();
    console.log(`[${label}] status=${res.status} ${text.slice(0, 300)}`);
  } catch (e) {
    console.log(`[${label}] FETCH_ERROR ${e.message}`);
  }
}

const checks = [
  ["application_evidence exists", "/rest/v1/application_evidence?select=*&limit=1"],
  ["ability_observations exists", "/rest/v1/ability_observations?select=id&limit=1"],
  ["ability_obs cols level/issues/evidence/suggestions", "/rest/v1/ability_observations?select=level,issues,evidence,suggestions&limit=1"],
  ["speaking_sessions exists", "/rest/v1/speaking_sessions?select=id&limit=1"],
  ["speaking_sessions repo cols question_id,status,first_analysis,second_analysis,updated_at", "/rest/v1/speaking_sessions?select=question_id,status,first_analysis,second_analysis,updated_at&limit=1"],
  ["speaking_sessions suggested_expressions col", "/rest/v1/speaking_sessions?select=suggested_expressions&limit=1"],
  ["speaking_sessions main_issue col", "/rest/v1/speaking_sessions?select=main_issue&limit=1"],
  ["speaking_sessions.id type probe (eq text value)", "/rest/v1/speaking_sessions?id=eq.spk-probe-000001&select=id&limit=1"],
  ["speaking_evaluations exists", "/rest/v1/speaking_evaluations?select=id&limit=1"],
  ["users exists", "/rest/v1/users?select=id&limit=1"],
  ["user_secrets exists", "/rest/v1/user_secrets?select=id&limit=1"],
  ["wechat_login_states exists", "/rest/v1/wechat_login_states?select=id&limit=1"],
];

for (const [label, path] of checks) {
  await probe(label, path);
}
