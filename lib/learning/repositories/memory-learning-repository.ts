/**
 * MemoryLearningRepository
 * ------------------------------------------------------------
 * 进程内内存实现；DATA_PROVIDER=memory 时使用。
 * 数据在进程重启后丢失（P1 已知 gap）。
 * 完全实现 LearningRepository 接口，便于 Supabase 实现平替。
 */
import type {
  LearningEvent,
  LearningItem,
  UserItemState,
  EventCorrectness,
  LearningStatus,
  TaskType,
} from "@/lib/learning/types";
import type {
  CreateLearningEventInput,
  LearningRepository,
  UpsertUserItemStateInput,
} from "@/lib/learning/repository";

export class MemoryLearningRepository implements LearningRepository {
  private items = new Map<string, LearningItem>(); // keyed by id
  private normalizedIndex = new Map<string, string>(); // normalizedTerm → id
  private states = new Map<string, UserItemState>(); // `${userId}:${itemId}`
  private events: LearningEvent[] = [];
  private clientEventIds = new Set<string>(); // dedup

  async findItemByNormalizedTerm(normalizedTerm: string): Promise<LearningItem | null> {
    const id = this.normalizedIndex.get(normalizedTerm.toLowerCase());
    if (!id) return null;
    return this.items.get(id) ?? null;
  }

  async createOrGetItem(item: LearningItem): Promise<LearningItem> {
    const existing = await this.findItemByNormalizedTerm(item.normalizedTerm);
    if (existing) return existing;
    this.items.set(item.id, item);
    this.normalizedIndex.set(item.normalizedTerm.toLowerCase(), item.id);
    return item;
  }

  async getUserItemState(userId: string, itemId: string): Promise<UserItemState | null> {
    return this.states.get(`${userId}:${itemId}`) ?? null;
  }

  async upsertUserItemState(input: UpsertUserItemStateInput): Promise<UserItemState> {
    const key = `${input.userId}:${input.itemId}`;
    const state: UserItemState = {
      userId: input.userId,
      itemId: input.itemId,
      status: input.status as LearningStatus,
      recognitionLevel: input.recognitionLevel,
      recallLevel: input.recallLevel,
      applicationLevel: input.applicationLevel,
      consecutiveCorrect: input.consecutiveCorrect,
      currentIntervalDays: input.currentIntervalDays,
      nextReviewAt: input.nextReviewAt,
      updatedAt: new Date().toISOString(),
    };
    this.states.set(key, state);
    return state;
  }

  async createLearningEvent(input: CreateLearningEventInput): Promise<LearningEvent> {
    // 幂等：clientEventId 重复时返回已有
    if (this.clientEventIds.has(input.clientEventId)) {
      const existing = this.events.find((e) => e.clientEventId === input.clientEventId);
      if (existing) return existing;
    }

    const event: LearningEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      itemId: input.itemId,
      eventType: input.eventType,
      taskType: input.taskType as TaskType,
      answer: input.answer,
      correctness: input.correctness as EventCorrectness,
      hintLevel: input.hintLevel,
      resultJson: input.resultJson,
      clientEventId: input.clientEventId,
      traceId: input.traceId,
      createdAt: new Date().toISOString(),
    };
    this.events.push(event);
    this.clientEventIds.add(input.clientEventId);
    return event;
  }

  async getRecentLearningEvents(
    userId: string,
    itemId: string,
    limit = 10,
  ): Promise<LearningEvent[]> {
    return this.events
      .filter((e) => e.userId === userId && e.itemId === itemId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  // --- P4: 报告聚合 ---
  async getAllUserItemStates(userId: string): Promise<UserItemState[]> {
    const results: UserItemState[] = [];
    for (const [key, state] of this.states.entries()) {
      if (key.startsWith(`${userId}:`)) {
        results.push(state);
      }
    }
    return results;
  }

  async getUserEventsInRange(userId: string, since: string, until: string): Promise<LearningEvent[]> {
    return this.events.filter(
      (e) => e.userId === userId && e.createdAt >= since && e.createdAt <= until,
    );
  }

  // --- 测试辅助 ---
  _reset(): void {
    this.items.clear();
    this.normalizedIndex.clear();
    this.states.clear();
    this.events = [];
    this.clientEventIds.clear();
  }

  _getAllStates(): UserItemState[] {
    return [...this.states.values()];
  }

  _getAllEvents(): LearningEvent[] {
    return [...this.events];
  }

  async getDueReviewItems(
    userId: string,
    now: string,
    limit: number,
  ): Promise<Array<{ item: LearningItem; state: UserItemState }>> {
    const results: Array<{ item: LearningItem; state: UserItemState }> = [];
    for (const [key, state] of this.states.entries()) {
      if (!key.startsWith(`${userId}:`)) continue;
      if (state.nextReviewAt <= now) {
        const item = this.items.get(state.itemId);
        if (item) {
          results.push({ item, state });
        }
      }
    }
    // Sort by nextReviewAt ascending (most overdue first)
    results.sort((a, b) => a.state.nextReviewAt.localeCompare(b.state.nextReviewAt));
    return results.slice(0, limit);
  }

  async getItemById(itemId: string): Promise<LearningItem | null> {
    return this.items.get(itemId) ?? null;
  }
}
