/**
 * SpeakingRepository 接口 + Memory 实现
 * ------------------------------------------------------------
 * 保存口语会话（首答、分析、重答）。
 */
import type { SpeakingAnalysisResult, SpeakingSession, SpeakingSessionStatus } from "@/lib/speaking/types";

export interface SpeakingRepository {
  createSession(session: SpeakingSession): Promise<SpeakingSession>;
  getSession(sessionId: string): Promise<SpeakingSession | null>;
  updateFirstAnswer(sessionId: string, answer: string, analysis: SpeakingAnalysisResult): Promise<SpeakingSession>;
  updateSecondAnswer(sessionId: string, answer: string, analysis: SpeakingAnalysisResult): Promise<SpeakingSession>;
  completeSession(sessionId: string): Promise<SpeakingSession>;
  getRecentSessions(userId: string, limit?: number): Promise<SpeakingSession[]>;
}

export class MemorySpeakingRepository implements SpeakingRepository {
  private sessions = new Map<string, SpeakingSession>();

  async createSession(session: SpeakingSession): Promise<SpeakingSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: string): Promise<SpeakingSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async updateFirstAnswer(
    sessionId: string,
    answer: string,
    analysis: SpeakingAnalysisResult,
  ): Promise<SpeakingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const updated: SpeakingSession = {
      ...session,
      firstAnswer: answer,
      firstAnalysis: analysis,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async updateSecondAnswer(
    sessionId: string,
    answer: string,
    analysis: SpeakingAnalysisResult,
  ): Promise<SpeakingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const updated: SpeakingSession = {
      ...session,
      secondAnswer: answer,
      secondAnalysis: analysis,
      status: "COMPLETED" as SpeakingSessionStatus,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async completeSession(sessionId: string): Promise<SpeakingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    const updated: SpeakingSession = {
      ...session,
      status: "COMPLETED" as SpeakingSessionStatus,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async getRecentSessions(userId: string, limit = 10): Promise<SpeakingSession[]> {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  _reset(): void {
    this.sessions.clear();
  }
}
