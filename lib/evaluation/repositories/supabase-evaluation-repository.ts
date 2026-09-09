/**
 * SupabaseEvaluationRepository
 * ------------------------------------------------------------
 * EvaluationRepository 的 Supabase 实现。
 * DATA_PROVIDER=supabase 时使用。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpeakingEvaluation } from "@/lib/evaluation/types";
import type { EvaluationRepository } from "@/lib/evaluation/server-repository";

export class SupabaseEvaluationRepository implements EvaluationRepository {
  private async sb(): Promise<SupabaseClient> {
    const { createServerClient } = await import("@/lib/db/server");
    return (await createServerClient()) as unknown as SupabaseClient;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDomain(row: any): SpeakingEvaluation {
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      feedbackAdopted: row.feedback_adopted,
      dimensionChanges: row.dimension_changes ?? { fluency: null, lexicalResource: null, grammaticalRange: null },
      resolvedIssues: row.resolved_issues ?? [],
      unresolvedIssues: row.unresolved_issues ?? [],
      issueResolutionRate: row.issue_resolution_rate,
      feedbackEffectiveness: row.feedback_effectiveness,
      overallChange: row.overall_change,
      evaluatedAt: row.evaluated_at,
    };
  }

  async save(evaluation: SpeakingEvaluation): Promise<SpeakingEvaluation> {
    const sb = await this.sb();

    // Upsert by (user_id, session_id)
    const { data, error } = await sb
      .from("speaking_evaluations")
      .upsert(
        {
          session_id: evaluation.sessionId,
          user_id: evaluation.userId,
          feedback_adopted: evaluation.feedbackAdopted,
          dimension_changes: evaluation.dimensionChanges,
          resolved_issues: evaluation.resolvedIssues,
          unresolved_issues: evaluation.unresolvedIssues,
          issue_resolution_rate: evaluation.issueResolutionRate,
          feedback_effectiveness: evaluation.feedbackEffectiveness,
          overall_change: evaluation.overallChange,
          evaluated_at: evaluation.evaluatedAt,
        },
        { onConflict: "user_id,session_id" },
      )
      .select()
      .single();

    if (error) throw new Error(`Failed to save evaluation: ${error.message}`);
    return this.toDomain(data);
  }

  async getBySession(sessionId: string): Promise<SpeakingEvaluation | null> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_evaluations")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (error) throw new Error(`Failed to get evaluation: ${error.message}`);
    return data ? this.toDomain(data) : null;
  }

  async getAll(userId: string): Promise<SpeakingEvaluation[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_evaluations")
      .select("*")
      .eq("user_id", userId)
      .order("evaluated_at", { ascending: false });

    if (error) throw new Error(`Failed to get evaluations: ${error.message}`);
    return (data ?? []).map((r) => this.toDomain(r));
  }

  async getRecent(userId: string, limit: number): Promise<SpeakingEvaluation[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_evaluations")
      .select("*")
      .eq("user_id", userId)
      .order("evaluated_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get evaluations: ${error.message}`);
    return (data ?? []).map((r) => this.toDomain(r));
  }
}
