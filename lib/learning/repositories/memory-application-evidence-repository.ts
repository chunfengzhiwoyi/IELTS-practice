/**
 * MemoryApplicationEvidenceRepository
 * ------------------------------------------------------------
 * ApplicationEvidenceRepository 的 Memory 参考实现（DATA_PROVIDER=memory）。
 * 幂等键：(userId, itemId, sessionId) → Map key。
 */
import type {
  ApplicationEvidenceRecord,
  ApplicationEvidenceRepository,
} from "@/lib/learning/application-evidence";

export class MemoryApplicationEvidenceRepository
  implements ApplicationEvidenceRepository
{
  private store = new Map<string, ApplicationEvidenceRecord>();

  private key(userId: string, itemId: string, sessionId: string): string {
    return `${userId}::${itemId}::${sessionId}`;
  }

  async upsertApplicationEvidence(
    record: ApplicationEvidenceRecord,
  ): Promise<ApplicationEvidenceRecord> {
    this.store.set(this.key(record.userId, record.itemId, record.sessionId), record);
    return record;
  }

  async getApplicationEvidence(
    userId: string,
    itemId: string,
    sessionId: string,
  ): Promise<ApplicationEvidenceRecord | null> {
    return this.store.get(this.key(userId, itemId, sessionId)) ?? null;
  }

  async listApplicationEvidence(
    userId: string,
    itemId: string,
  ): Promise<ApplicationEvidenceRecord[]> {
    return [...this.store.values()]
      .filter((r) => r.userId === userId && r.itemId === itemId)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.sessionId.localeCompare(b.sessionId));
  }

  _reset(): void {
    this.store.clear();
  }
}
