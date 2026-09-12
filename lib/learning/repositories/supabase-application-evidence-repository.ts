/**
 * SupabaseApplicationEvidenceRepository
 * ------------------------------------------------------------
 * ApplicationEvidenceRepository 的 Supabase 实现（DATA_PROVIDER=supabase）。
 * 表：public.application_evidence（migration 0010_application_evidence.sql）
 * 幂等：unique(user_id, item_id, session_id) → upsert onConflict 覆盖为同一条。
 * RLS：跟随现有 user_id 模式（user 只能读写自己的 evidence）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplicationEvidenceRecord,
  ApplicationEvidenceRepository,
} from "@/lib/learning/application-evidence";

/** row → domain 映射（导出以便无库环境的 mapping parity 测试） */
export function mapApplicationEvidenceRowToDomain(row: {
  id: string;
  user_id: string;
  item_id: string;
  session_id: string;
  question_id: string | null;
  part: string | null;
  topic: string | null;
  assessment: string;
  quote: string | null;
  reason: string;
  validator_notes: string[] | null;
  upgrade_candidate: boolean;
  recovered_via_retry: boolean;
  recorded_at: string;
  pipeline_version: string;
  provider: string | null;
  model: string | null;
}): ApplicationEvidenceRecord {
  return {
    evidenceId: row.id,
    userId: row.user_id,
    itemId: row.item_id,
    sessionId: row.session_id,
    questionId: row.question_id ?? "",
    part: (row.part as ApplicationEvidenceRecord["part"]) ?? "P1",
    topic: row.topic ?? "",
    assessment: row.assessment as ApplicationEvidenceRecord["assessment"],
    quote: row.quote,
    reason: row.reason,
    validatorNotes: row.validator_notes ?? [],
    upgradeCandidate: row.upgrade_candidate,
    recoveredViaRetry: row.recovered_via_retry,
    recordedAt: row.recorded_at,
    pipelineVersion: row.pipeline_version,
    provider: row.provider,
    model: row.model,
  };
}

/** domain → row 映射（导出以便测试） */
export function mapApplicationEvidenceToRow(record: ApplicationEvidenceRecord): {
  user_id: string;
  item_id: string;
  session_id: string;
  question_id: string | null;
  part: string;
  topic: string;
  assessment: string;
  quote: string | null;
  reason: string;
  validator_notes: string[];
  upgrade_candidate: boolean;
  recovered_via_retry: boolean;
  recorded_at: string;
  pipeline_version: string;
  provider: string | null;
  model: string | null;
} {
  return {
    user_id: record.userId,
    item_id: record.itemId,
    session_id: record.sessionId,
    question_id: record.questionId || null,
    part: record.part,
    topic: record.topic,
    assessment: record.assessment,
    quote: record.quote,
    reason: record.reason,
    validator_notes: record.validatorNotes,
    upgrade_candidate: record.upgradeCandidate,
    recovered_via_retry: record.recoveredViaRetry,
    recorded_at: record.recordedAt,
    pipeline_version: record.pipelineVersion,
    provider: record.provider,
    model: record.model,
  };
}

export class SupabaseApplicationEvidenceRepository
  implements ApplicationEvidenceRepository
{
  private async sb(): Promise<SupabaseClient> {
    const { createServerClient } = await import("@/lib/db/server");
    return (await createServerClient()) as unknown as SupabaseClient;
  }

  async upsertApplicationEvidence(
    record: ApplicationEvidenceRecord,
  ): Promise<ApplicationEvidenceRecord> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("application_evidence")
      .upsert(mapApplicationEvidenceToRow(record), {
        onConflict: "user_id,item_id,session_id",
      })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to upsert application evidence: ${error.message}`);
    return mapApplicationEvidenceRowToDomain(data);
  }

  async getApplicationEvidence(
    userId: string,
    itemId: string,
    sessionId: string,
  ): Promise<ApplicationEvidenceRecord | null> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("application_evidence")
      .select("*")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`Failed to get application evidence: ${error.message}`);
    return data ? mapApplicationEvidenceRowToDomain(data) : null;
  }

  async listApplicationEvidence(
    userId: string,
    itemId: string,
  ): Promise<ApplicationEvidenceRecord[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("application_evidence")
      .select("*")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .order("recorded_at", { ascending: true });
    if (error) throw new Error(`Failed to list application evidence: ${error.message}`);
    return (data ?? []).map((r) => mapApplicationEvidenceRowToDomain(r));
  }
}
