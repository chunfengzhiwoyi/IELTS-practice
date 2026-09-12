/**
 * SupabaseSpeakingRepository
 * ------------------------------------------------------------
 * SpeakingRepository 的 Supabase 实现。
 * DATA_PROVIDER=supabase 时使用。
 * speaking_sessions 表存储完整会话（含 first/second answer 和 analysis JSON）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpeakingAnalysisResult, SpeakingSession, SpeakingSessionStatus, SuggestedExpression } from "@/lib/speaking/types";
import type { SpeakingRepository } from "@/lib/speaking/repository";

export class SupabaseSpeakingRepository implements SpeakingRepository {
  private async sb(): Promise<SupabaseClient> {
    const { createServerClient } = await import("@/lib/db/server");
    return (await createServerClient()) as unknown as SupabaseClient;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDomain(row: any): SpeakingSession {
    return {
      id: row.id,
      userId: row.user_id,
      questionId: row.question_id,
      part: row.part,
      topic: row.topic,
      question: row.question,
      firstAnswer: row.first_answer,
      firstAnalysis: row.first_analysis,
      secondAnswer: row.second_answer,
      secondAnalysis: row.second_analysis,
      status: row.status as SpeakingSessionStatus,
      // PRODUCT-LOOP-04B: speaking_sessions 无 suggested_expressions 列（不新增 migration）→ 读回恒为 []。
      // 即 SUPABASE_EVIDENCE_PERSISTENCE = NOT_IMPLEMENTED（Memory 完整持久化；见 04B 文档）。
      suggestedExpressions: (row.suggested_expressions as SuggestedExpression[] | null) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createSession(session: SpeakingSession): Promise<SpeakingSession> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_sessions")
      .insert({
        id: session.id,
        user_id: session.userId,
        question_id: session.questionId,
        part: session.part,
        topic: session.topic,
        question: session.question,
        status: session.status,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create speaking session: ${error.message}`);
    return this.toDomain(data);
  }

  async getSession(sessionId: string): Promise<SpeakingSession | null> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) throw new Error(`Failed to get speaking session: ${error.message}`);
    return data ? this.toDomain(data) : null;
  }

  async updateFirstAnswer(
    sessionId: string,
    answer: string,
    analysis: SpeakingAnalysisResult,
  ): Promise<SpeakingSession> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_sessions")
      .update({
        first_answer: answer,
        first_analysis: analysis as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update first answer: ${error.message}`);
    return this.toDomain(data);
  }

  async updateSecondAnswer(
    sessionId: string,
    answer: string,
    analysis: SpeakingAnalysisResult,
  ): Promise<SpeakingSession> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_sessions")
      .update({
        second_answer: answer,
        second_analysis: analysis as unknown as Record<string, unknown>,
        status: "COMPLETED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update second answer: ${error.message}`);
    return this.toDomain(data);
  }

  async completeSession(sessionId: string): Promise<SpeakingSession> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_sessions")
      .update({
        status: "COMPLETED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to complete speaking session: ${error.message}`);
    return this.toDomain(data);
  }

  async getRecentSessions(userId: string, limit = 10): Promise<SpeakingSession[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("speaking_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get speaking sessions: ${error.message}`);
    return (data ?? []).map((r) => this.toDomain(r));
  }
}
