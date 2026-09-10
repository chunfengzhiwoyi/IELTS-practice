/**
 * Independent oracle（P5）— 独立于 production aggregate 的朴素重算。
 * 故意不 import @/lib/dashboard/aggregate，避免自证循环。
 */
export interface OEvent { user_id: string; item_id: string; event_type: "NEW" | "REVIEW"; correctness: string; hint_level: number; created_at: string }
export interface OSession { id: string; user_id: string; first_answer: string | null; second_answer: string | null; main_issue: unknown; created_at: string }
export interface OEval { session_id: string; overall_change: number | null; evaluated_at: string }

const DAY = 86400000;
const day = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

export function oracleActive(events: OEvent[], sessions: OSession[]): Set<string> {
  const s = new Set<string>();
  for (const e of events) if (e.correctness !== "SKIPPED") s.add(e.user_id);
  for (const x of sessions) if (x.first_answer) s.add(x.user_id);
  return s;
}

export function oracleFirstUseAndActivation(events: OEvent[], sessions: OSession[], evals: OEval[]) {
  const evalSessions = new Set(evals.map((e) => e.session_id));
  const firstUse = new Map<string, number>();
  const activation = new Map<string, number>();
  const touch = (map: Map<string, number>, u: string, t: number) => { const c = map.get(u); if (c === undefined || t < c) map.set(u, t); };
  const activity = new Map<string, number[]>();
  for (const e of events) {
    if (e.correctness === "SKIPPED") continue;
    const t = new Date(e.created_at).getTime();
    touch(firstUse, e.user_id, t);
    activity.set(e.user_id, [...(activity.get(e.user_id) ?? []), t]);
    touch(activation, e.user_id, t);
  }
  for (const s of sessions) {
    if (!s.first_answer) continue;
    const t = new Date(s.created_at).getTime();
    touch(firstUse, s.user_id, t);
    activity.set(s.user_id, [...(activity.get(s.user_id) ?? []), t]);
    if (s.second_answer && s.main_issue != null && evalSessions.has(s.id)) touch(activation, s.user_id, t);
  }
  return { firstUse, activation, activity };
}

export function oracleActivationRate(events: OEvent[], sessions: OSession[], evals: OEval[]) {
  const { firstUse, activation } = oracleFirstUseAndActivation(events, sessions, evals);
  let denom = 0, num = 0;
  for (const [u, fu] of firstUse) { denom++; if ((activation.get(u) ?? Infinity) <= fu + DAY) num++; }
  return { denom, num };
}

export function oracleD7(events: OEvent[], sessions: OSession[], evals: OEval[], now: number) {
  const { activation, activity } = oracleFirstUseAndActivation(events, sessions, evals);
  let denom = 0, num = 0;
  for (const [, act] of activation) {
    if (now - act < 7 * DAY) continue;
    denom++;
    const days = new Set((activity.get("") ?? []));
    // recompute per user below
  }
  // proper per-user
  let mature = 0, retained = 0;
  for (const [u, act] of activation) {
    if (now - act < 7 * DAY) continue;
    mature++;
    const set = new Set((activity.get(u) ?? []).filter((t) => t >= act + DAY && t <= act + 8 * DAY).map((t) => day(new Date(t).toISOString())));
    if (set.size > 0) retained++;
  }
  return { mature, retained };
}

export function oracleClosedLoop(events: OEvent[], sessions: OSession[], evals: OEval[]) {
  const { activation } = oracleFirstUseAndActivation(events, sessions, evals);
  return activation.size;
}

export function oracleRecall(events: OEvent[]) {
  const review = events.filter((e) => e.event_type === "REVIEW");
  const den = review.filter((e) => e.correctness !== "SKIPPED");
  const num = review.filter((e) => e.correctness === "INDEPENDENT" && e.hint_level === 0);
  return { den: den.length, num: num.length };
}

export function oracleDelayed(events: OEvent[]) {
  const by = new Map<string, OEvent[]>();
  for (const e of events) {
    const k = e.user_id + "|" + e.item_id;
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  let den = 0, num = 0;
  for (const arr of by.values()) {
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let last: OEvent | undefined;
    for (const e of arr) if (e.event_type === "NEW" && e.correctness === "INDEPENDENT") last = e;
    if (!last) continue;
    const lt = new Date(last.created_at).getTime();
    for (const e of arr) {
      if (e.event_type !== "REVIEW") continue;
      if (new Date(e.created_at).getTime() - lt < 72 * 3600000) continue;
      if (e.correctness === "SKIPPED") continue;
      den++;
      if (e.correctness === "INDEPENDENT" && e.hint_level === 0) num++;
    }
  }
  return { den, num };
}

export function oracleSpeakingImprove(evals: OEval[]) {
  const eligible = evals.filter((e) => typeof e.overall_change === "number");
  const num = eligible.filter((e) => (e.overall_change ?? 0) > 0);
  return { den: eligible.length, num: num.length };
}
