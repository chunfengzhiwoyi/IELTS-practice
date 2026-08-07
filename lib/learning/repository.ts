/**
 * LearningRepository 接口
 * ------------------------------------------------------------
 * 业务层、API Route 和 React 组件不得直接操作 Supabase 表。
 * 所有数据访问通过本接口，方便 memory / supabase 实现切换。
 */
import type {
  LearningEvent,
  LearningItem,
  UserItemState,
} from "@/lib/learning/types";

export interface CreateLearningEventInput {
  userId: string;
  itemId: string;
  eventType: "NEW" | "REVIEW";
  taskType: string;
  answer: string | null;
  correctness: string;
  hintLevel: number;
  resultJson: Record<string, unknown>;
  clientEventId: string;
  traceId: string;
}

export interface UpsertUserItemStateInput {
  userId: string;
  itemId: string;
  status: string;
  recognitionLevel: number;
  recallLevel: number;
  applicationLevel: number;
  consecutiveCorrect: number;
  currentIntervalDays: number;
  nextReviewAt: string;
}

export interface LearningRepository {
  /** 按标准化词条查找已有知识项 */
  findItemByNormalizedTerm(normalizedTerm: string): Promise<LearningItem | null>;

  /** 创建或获取知识项（幂等） */
  createOrGetItem(item: LearningItem): Promise<LearningItem>;

  /** 获取用户对某知识项的当前状态 */
  getUserItemState(userId: string, itemId: string): Promise<UserItemState | null>;

  /** 创建或更新用户知识项状态 */
  upsertUserItemState(input: UpsertUserItemStateInput): Promise<UserItemState>;

  /** 创建学习事件（幂等，基于 clientEventId） */
  createLearningEvent(input: CreateLearningEventInput): Promise<LearningEvent>;

  /** 获取用户某知识项最近的学习事件 */
  getRecentLearningEvents(userId: string, itemId: string, limit?: number): Promise<LearningEvent[]>;

  /** 获取用户到期需要复习的项目（nextReviewAt <= now），按 nextReviewAt 升序排列 */
  getDueReviewItems(userId: string, now: string, limit: number): Promise<Array<{ item: LearningItem; state: UserItemState }>>;

  /** 按 ID 获取知识项 */
  getItemById(itemId: string): Promise<LearningItem | null>;

  /** 获取用户所有知识项状态（报告聚合用） */
  getAllUserItemStates(userId: string): Promise<UserItemState[]>;

  /** 获取用户在时间范围内的所有学习事件（报告聚合用） */
  getUserEventsInRange(userId: string, since: string, until: string): Promise<LearningEvent[]>;
}
