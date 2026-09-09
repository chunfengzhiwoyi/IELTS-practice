/**
 * SupabaseAbilityRepository
 * ------------------------------------------------------------
 * AbilityObservationRepository 的 Supabase 实现。
 * DATA_PROVIDER=supabase 时使用。
 * 用户私有数据走 RLS 客户端 createServerClient()。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AbilityObservation,
  AbilityLevel,
  EvidenceStatus,
  SpeakingDimensionKey,
  WriteObservationInput,
} from "@/lib/ability/types";
import type { AbilityObservationRepository } from "@/lib/ability/server-repository";
import { computeEvidenceStatus } from "@/lib/ability/evidence-status";

export class SupabaseAbilityRepository implements AbilityObservationRepository {
  private async sb(): Promise<SupabaseClient> {
    const { createServerClient } = await import("@/lib/db/server");
    return (await createServerClient()) as unknown as SupabaseClient;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDomain(row: any): AbilityObservation {
    return {
      id: row.id,
      userId: row.user_id,
      dimension: row.dimension as SpeakingDimensionKey,
      level: row.level as AbilityLevel,
      issues: row.issues ?? [],
      evidence: row.evidence ?? [],
      suggestions: row.suggestions ?? [],
      evidenceStatus: row.evidence_status as EvidenceStatus,
      sourceType: row.source_type,
      sourceId: row.source_id,
      note: row.note ?? null,
      createdAt: row.created_at,
    };
  }

  async writeObservation(input: WriteObservationInput): Promise<AbilityObservation> {
    const sb = await this.sb();

    // 需要先拉取该用户该维度的所有历史观察来计算 evidenceStatus
    const { data: history } = await sb
      .from("ability_observations")
      .select("*")
      .eq("user_id", input.userId)
      .eq("dimension", input.dimension);

    const historyObservations: AbilityObservation[] = (history ?? []).map((r) => this.toDomain(r));
    const evidenceStatus = computeEvidenceStatus(
      input.userId,
      input.dimension,
      input.level as AbilityLevel,
      historyObservations,
    );

    const { data, error } = await sb
      .from("ability_observations")
      .insert({
        user_id: input.userId,
        dimension: input.dimension,
        level: input.level,
        issues: input.issues,
        evidence: input.evidence,
        suggestions: input.suggestions.slice(0, 2),
        evidence_status: evidenceStatus,
        source_type: input.sourceType,
        source_id: input.sourceId,
        note: input.note ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to write ability observation: ${error.message}`);
    return this.toDomain(data);
  }

  async getByDimension(userId: string, dimension: SpeakingDimensionKey): Promise<AbilityObservation[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("ability_observations")
      .select("*")
      .eq("user_id", userId)
      .eq("dimension", dimension)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to get ability observations: ${error.message}`);
    return (data ?? []).map((r) => this.toDomain(r));
  }

  async getAll(userId: string): Promise<AbilityObservation[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("ability_observations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to get ability observations: ${error.message}`);
    return (data ?? []).map((r) => this.toDomain(r));
  }

  async getRecent(userId: string, dimension: SpeakingDimensionKey, limit: number): Promise<AbilityObservation[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("ability_observations")
      .select("*")
      .eq("user_id", userId)
      .eq("dimension", dimension)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get ability observations: ${error.message}`);
    return (data ?? []).map((r) => this.toDomain(r));
  }

  async updateStatus(observationId: string, newStatus: EvidenceStatus): Promise<void> {
    const sb = await this.sb();
    const { error } = await sb
      .from("ability_observations")
      .update({ evidence_status: newStatus })
      .eq("id", observationId);

    if (error) throw new Error(`Failed to update ability observation status: ${error.message}`);
  }
}
