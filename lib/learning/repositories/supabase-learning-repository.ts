/**
 * SupabaseLearningRepository
 * ------------------------------------------------------------
 * LearningRepository 的 Supabase 实现；DATA_PROVIDER=supabase 时使用。
 *
 * 设计要点：
 *  1. 用户私有数据（user_item_states / learning_events）一律走 RLS 客户端
 *     createServerClient()，由 §9.2 RLS 策略强制 user_id = auth.uid()，
 *     即使传入错误的 userId 也会被数据库层拦截，无需在仓库内再做鉴权。
 *  2. learning_items 是公共内容池，RLS 仅开放 SELECT；写入（首次落库 /
 *     内容对齐）通过 service role 的 upsert 完成——内容为服务端种子数据，
 *     不含任何用户隐私，使用 service role 安全。
 *  3. 种子用字符串 itemId，而 learning_items.id 为 uuid。因此按
 *     normalized_term 匹配、由 DB 自增 uuid；调用方须使用返回对象的 id
 *     （而非原始种子字符串 id）进行后续关联。
 *  4. 模块顶层仅做类型导入（编译期擦除），createServerClient /
 *     createServiceRoleClient 均在方法内动态 import，避免把 next/headers
 *     等 server-only 模块打进客户端包。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LearningEvent,
  LearningItem,
  UserItemState,
  EventCorrectness,
  ItemType,
  LearningStatus,
  SeedLearningItem,
  TaskType,
} from "@/lib/learning/types";
import type {
  CreateLearningEventInput,
  LearningRepository,
  UpsertUserItemStateInput,
} from "@/lib/learning/repository";
import type { Json } from "@/lib/db/types";

export class SupabaseLearningRepository implements LearningRepository {
  // ---- 客户端（懒加载，保持模块顶层无 server-only 依赖） ----
  // 返回类型收敛为 SupabaseClient（不挂 Database 泛型）：手写的 Database 类型在
  // 本仓库多处链式 from().select().single() 调用下会让 TS 触发实例化深度上限、
  // 把部分表的 Insert/Row 推断成 never。RLS 由数据库层强制执行（与类型无关），
  // 域类型映射在各 toXxx() 里用 as 完成，边界处类型安全仍然成立。
  private async sb(): Promise<SupabaseClient> {
    const { createServerClient } = await import("@/lib/db/server");
    return (await createServerClient()) as unknown as SupabaseClient;
  }

  /** learning_items 公共内容池的写入走 service role（RLS 仅开放 SELECT 给用户） */
  private async admin(): Promise<SupabaseClient> {
    const { createServiceRoleClient } = await import("@/lib/db/server");
    return (await createServiceRoleClient()) as unknown as SupabaseClient;
  }

  // ---- 行 → Domain 映射（客户端未挂 Database 泛型，row 为 any） ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toItem(row: any): LearningItem {
    return {
      id: row.id,
      itemType: row.item_type as ItemType,
      canonicalForm: row.canonical_form,
      normalizedTerm: row.normalized_term ?? row.canonical_form.toLowerCase(),
      contentJson: row.content_json as unknown as SeedLearningItem,
      topicTags: row.topic_tags ?? [],
      createdAt: row.created_at,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toState(row: any): UserItemState {
    return {
      userId: row.user_id,
      itemId: row.item_id,
      status: row.status as LearningStatus,
      recognitionLevel: row.recognition_level,
      recallLevel: row.recall_level,
      applicationLevel: row.application_level,
      consecutiveCorrect: row.consecutive_correct,
      currentIntervalDays: row.current_interval_days,
      nextReviewAt: row.next_review_at,
      updatedAt: row.updated_at,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toEvent(row: any): LearningEvent {
    return {
      id: row.id,
      userId: row.user_id,
      itemId: row.item_id,
      eventType: row.event_type,
      taskType: row.task_type as TaskType,
      answer: row.answer,
      correctness: row.correctness as EventCorrectness,
      hintLevel: row.hint_level,
      resultJson: (row.result_json ?? {}) as Record<string, unknown>,
      clientEventId: row.client_event_id,
      traceId: row.trace_id ?? "",
      createdAt: row.created_at,
    };
  }

  // ---- 接口实现 ----
  async findItemByNormalizedTerm(normalizedTerm: string): Promise<LearningItem | null> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("learning_items")
      .select("*")
      .eq("normalized_term", normalizedTerm)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toItem(data) : null;
  }

  async createOrGetItem(item: LearningItem): Promise<LearningItem> {
    // 公共内容池：service role upsert，按 (item_type, canonical_form) 去重。
    // 既保证幂等，又能在种子形态不一致时把 content_json 对齐为应用侧标准结构。
    const admin = await this.admin();
    const { data, error } = await admin
      .from("learning_items")
      .upsert(
        {
          item_type: item.itemType,
          canonical_form: item.canonicalForm,
          normalized_term: item.normalizedTerm,
          content_json: item.contentJson as unknown as Json,
          topic_tags: item.topicTags,
        },
        { onConflict: "item_type,canonical_form" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return this.toItem(data);
  }

  async getItemById(itemId: string): Promise<LearningItem | null> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("learning_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toItem(data) : null;
  }

  async getUserItemState(userId: string, itemId: string): Promise<UserItemState | null> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("user_item_states")
      .select("*")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toState(data) : null;
  }

  async upsertUserItemState(input: UpsertUserItemStateInput): Promise<UserItemState> {
    const sb = await this.sb();
    // (user_id, item_id) 为 PK：upsert 天然幂等（再次提交覆盖进度）
    const { data, error } = await sb
      .from("user_item_states")
      .upsert(
        {
          user_id: input.userId,
          item_id: input.itemId,
          status: input.status,
          recognition_level: input.recognitionLevel,
          recall_level: input.recallLevel,
          application_level: input.applicationLevel,
          consecutive_correct: input.consecutiveCorrect,
          current_interval_days: input.currentIntervalDays,
          next_review_at: input.nextReviewAt,
        },
        { onConflict: "user_id,item_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return this.toState(data);
  }

  async createLearningEvent(input: CreateLearningEventInput): Promise<LearningEvent> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("learning_events")
      .insert({
        user_id: input.userId,
        item_id: input.itemId,
        event_type: input.eventType,
        task_type: input.taskType,
        answer: input.answer,
        correctness: input.correctness,
        hint_level: input.hintLevel,
        result_json: input.resultJson as Json,
        client_event_id: input.clientEventId,
        trace_id: input.traceId,
      })
      .select("*")
      .single();

    // 幂等：同 (user_id, client_event_id) 唯一约束冲突时，返回既有事件
    if (error) {
      if (error.code === "23505") {
        const { data: existing, error: selErr } = await sb
          .from("learning_events")
          .select("*")
          .eq("user_id", input.userId)
          .eq("client_event_id", input.clientEventId)
          .maybeSingle();
        if (selErr) throw selErr;
        if (existing) return this.toEvent(existing);
      }
      throw error;
    }
    return this.toEvent(data);
  }

  async getRecentLearningEvents(
    userId: string,
    itemId: string,
    limit = 10,
  ): Promise<LearningEvent[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("learning_events")
      .select("*")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => this.toEvent(r));
  }

  async getDueReviewItems(
    userId: string,
    now: string,
    limit: number,
  ): Promise<Array<{ item: LearningItem; state: UserItemState }>> {
    const sb = await this.sb();
    const { data: states, error } = await sb
      .from("user_item_states")
      .select("*")
      .eq("user_id", userId)
      .lte("next_review_at", now)
      .order("next_review_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    if (!states || states.length === 0) return [];

    const itemIds = states.map((s) => s.item_id);
    const { data: items, error: itemErr } = await sb
      .from("learning_items")
      .select("*")
      .in("id", itemIds);
    if (itemErr) throw itemErr;

    const itemMap = new Map((items ?? []).map((i) => [i.id, this.toItem(i)]));
    const result: Array<{ item: LearningItem; state: UserItemState }> = [];
    for (const s of states) {
      const item = itemMap.get(s.item_id);
      if (item) result.push({ item, state: this.toState(s) });
    }
    return result;
  }

  async getAllUserItemStates(userId: string): Promise<UserItemState[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("user_item_states")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((r) => this.toState(r));
  }

  async getUserEventsInRange(
    userId: string,
    since: string,
    until: string,
  ): Promise<LearningEvent[]> {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("learning_events")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", since)
      .lte("created_at", until)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => this.toEvent(r));
  }
}
