"use client";
/**
 * Browser Demo Service
 * ------------------------------------------------------------
 * 纯客户端的学习数据服务，使用 localStorage 持久化。
 * 替代服务端 MemoryLearningRepository + API routes。
 * 所有逻辑确定性执行，不调 LLM。
 */
import { getItem, setItem } from "@/lib/client/storage";
import { computeStreak, computeReviewAccuracy } from "@/lib/client/progress";
import { localDayKey } from "@/lib/client/day";
import { normalizeTerm, stableItemId } from "@/lib/learning/item-id";
import type {
  SeedLearningItem,
  LearningItem,
  UserItemState,
  LearningEvent,
  LearningStatus,
  EventCorrectness,
  WordCardResponse,
  LearnSubmitResponse,
} from "@/lib/learning/types";
import type { ReviewResult } from "@/lib/review/answer-judge";
import type {
  SpeakingAnalysisResult,
  SpeakingSession,
  SpeakingQuestion,
  SpeakingDimension,
  SpeakingPart,
} from "@/lib/speaking/types";
import { buildNextStep, type NextStep } from "@/lib/client/report-narrative";

// ============================================================
// Seed Data (embedded for client-side use)
// ============================================================

let _seedCache: SeedLearningItem[] | null = null;
let _speakingCache: SpeakingQuestion[] | null = null;

async function loadSeedItems(): Promise<SeedLearningItem[]> {
  if (_seedCache) return _seedCache;
  const resp = await fetch("/data/seed/ielts-learning-items.json");
  _seedCache = await resp.json();
  return _seedCache!;
}

async function loadSpeakingQuestions(): Promise<SpeakingQuestion[]> {
  if (_speakingCache) return _speakingCache;
  const resp = await fetch("/data/seed/speaking-questions.json");
  _speakingCache = await resp.json();
  return _speakingCache!;
}

// ============================================================
// Storage Keys
// ============================================================

function getStates(): Record<string, UserItemState> {
  return getItem<Record<string, UserItemState>>("states") ?? {};
}
function saveStates(states: Record<string, UserItemState>) {
  setItem("states", states);
}
function getEvents(): LearningEvent[] {
  return getItem<LearningEvent[]>("events") ?? [];
}
function saveEvents(events: LearningEvent[]) {
  setItem("events", events);
}
function getSpeakingSessions(): SpeakingSession[] {
  return getItem<SpeakingSession[]>("speaking_sessions") ?? [];
}
function saveSpeakingSessions(sessions: SpeakingSession[]) {
  setItem("speaking_sessions", sessions);
}

// ============================================================
// Item Cache (els_items) — 动态词卡持久化
// ============================================================

function getItemsCache(): Record<string, SeedLearningItem> {
  return getItem<Record<string, SeedLearningItem>>("items") ?? {};
}

export function saveItemToCache(item: SeedLearningItem): void {
  const cache = getItemsCache();
  cache[item.normalizedTerm] = item;
  setItem("items", cache);
}

/**
 * 统一 item 内容查找：seed 优先 → els_items 缓存 fallback。
 * 所有需要根据 itemId 获取词条内容的地方都走这里。
 */
async function findItemContent(itemId: string): Promise<SeedLearningItem | null> {
  // 1. seed 查找
  const seeds = await loadSeedItems();
  const fromSeed = seeds.find((s) => s.itemId === itemId);
  if (fromSeed) return fromSeed;

  // 2. els_items 缓存查找（动态生成的词条）
  const cache = getItemsCache();
  const fromCache = Object.values(cache).find(
    (c) => stableItemId(c.normalizedTerm) === itemId,
  );
  return fromCache ?? null;
}

// ============================================================
// Learn Service
// ============================================================

export async function getWordCard(term: string): Promise<
  | { ok: true; data: WordCardResponse }
  | { ok: false; error: string }
> {
  const normalized = normalizeTerm(term);

  // 1. 先查 seed
  const seeds = await loadSeedItems();
  const seed = seeds.find((s) => s.normalizedTerm === normalized);
  if (seed) {
    const item = seedToItem(seed);
    const states = getStates();
    const state = states[item.id] ?? null;
    return {
      ok: true,
      data: {
        item,
        task: {
          taskType: "MEANING_RECALL",
          prompt: `请回忆「${item.canonicalForm}」的核心含义（中文）。`,
          acceptedAnswerHint: seed.coreMeaning,
        },
        alreadyLearned: state !== null,
        currentState: state,
      },
    };
  }

  // 2. 查 els_items 缓存（之前 LLM 生成过的）
  const cache = getItemsCache();
  const cached = cache[normalized];
  if (cached) {
    const itemId = stableItemId(normalized);
    const item: LearningItem = {
      id: itemId,
      itemType: cached.itemType,
      canonicalForm: cached.term,
      normalizedTerm: cached.normalizedTerm,
      contentJson: cached,
      topicTags: cached.topicTags,
      createdAt: new Date().toISOString(),
    };
    const states = getStates();
    const state = states[itemId] ?? null;
    return {
      ok: true,
      data: {
        item,
        task: {
          taskType: "MEANING_RECALL",
          prompt: `请回忆「${item.canonicalForm}」的核心含义（中文）。`,
          acceptedAnswerHint: cached.coreMeaning,
        },
        alreadyLearned: state !== null,
        currentState: state,
      },
    };
  }

  // 3. 本地都没有 → 返回 not found（前端会调 /api/learn/card 走 LLM）
  return { ok: false, error: `NOT_IN_LOCAL_CACHE` };
}

export async function submitLearnAnswer(params: {
  itemId: string;
  answer: string;
  usedHint: boolean;
}): Promise<LearnSubmitResponse> {
  const { itemId, answer, usedHint } = params;

  // 统一查找 item 内容（seed + els_items 缓存）
  const itemContent = await findItemContent(itemId);
  const term = itemContent?.term ?? itemId;
  const coreMeaning = itemContent?.coreMeaning ?? "";

  // Judge
  const isCorrect = itemContent ? judgeCorrect(answer, itemContent) : false;
  let correctness: EventCorrectness;
  let status: LearningStatus;
  let feedback: string;
  let hoursUntil: number;

  if (!answer.trim()) {
    correctness = "FAIL";
    status = "EXPOSED";
    feedback = "未提供答案，建议再试一次。";
    hoursUntil = 2;
  } else if (isCorrect && usedHint) {
    correctness = "HINTED";
    status = "RECALLED_WITH_HELP";
    feedback = `正确！「${term}」= ${coreMeaning}（使用了提示，下次试着独立回忆）`;
    hoursUntil = 8;
  } else if (isCorrect) {
    correctness = "INDEPENDENT";
    status = "RECALLED_INDEPENDENTLY";
    feedback = `非常好！无提示正确回忆。「${term}」= ${coreMeaning}`;
    hoursUntil = 24;
  } else {
    correctness = "FAIL";
    status = "EXPOSED";
    feedback = `不太对。「${term}」的核心含义是：${coreMeaning}`;
    hoursUntil = 2;
  }

  const nextReviewAt = new Date(Date.now() + hoursUntil * 60 * 60 * 1000).toISOString();

  // Save event
  const event: LearningEvent = {
    id: `evt-${Date.now()}`,
    userId: "demo",
    itemId,
    eventType: "NEW",
    taskType: "MEANING_RECALL",
    answer,
    correctness,
    hintLevel: usedHint ? 1 : 0,
    resultJson: {},
    clientEventId: `${itemId}-${Date.now()}`,
    traceId: `trc-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  const events = getEvents();
  events.push(event);
  saveEvents(events);

  // Save state
  const states = getStates();
  const prev = states[itemId];
  const newState: UserItemState = {
    userId: "demo",
    itemId,
    status,
    recognitionLevel: correctness === "INDEPENDENT" ? 1 : (prev?.recognitionLevel ?? 0),
    recallLevel: correctness === "INDEPENDENT" ? 1 : correctness === "HINTED" ? 1 : 0,
    applicationLevel: 0,
    consecutiveCorrect: correctness === "INDEPENDENT" ? (prev?.consecutiveCorrect ?? 0) + 1 : 0,
    currentIntervalDays: hoursUntil / 24,
    nextReviewAt,
    updatedAt: new Date().toISOString(),
  };
  states[itemId] = newState;
  saveStates(states);

  return { eventId: event.id, correctness, status, feedback, nextReviewAt, state: newState };
}

// ============================================================
// Review Service
// ============================================================

export interface ReviewTask {
  itemId: string;
  term: string;
  prompt: string;
  coreMeaning: string;
  acceptedAnswers: string[];
  answerKeywords: string[];
}

export async function getReviewSession(mode: "DUE" | "MANUAL", itemId?: string): Promise<{
  tasks: ReviewTask[];
  totalDue: number;
}> {
  const states = getStates();
  const now = new Date().toISOString();

  if (mode === "MANUAL" && itemId) {
    const content = await findItemContent(itemId);
    if (!content) return { tasks: [], totalDue: 0 };
    return {
      tasks: [{
        itemId,
        term: content.term,
        prompt: `请回忆「${content.term}」的核心含义（中文）。`,
        coreMeaning: content.coreMeaning,
        acceptedAnswers: content.acceptedAnswers,
        answerKeywords: content.answerKeywords,
      }],
      totalDue: Object.values(states).filter((s) => s.nextReviewAt <= now).length,
    };
  }

  // DUE mode
  const dueItems = Object.values(states)
    .filter((s) => s.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, 10);

  // 统一查找每个 item 的内容（seed + els_items）
  const taskPromises = dueItems.map(async (s) => {
    const content = await findItemContent(s.itemId);
    if (!content) return null;
    return {
      itemId: s.itemId,
      term: content.term,
      prompt: `请回忆「${content.term}」的核心含义（中文）。`,
      coreMeaning: content.coreMeaning,
      acceptedAnswers: content.acceptedAnswers,
      answerKeywords: content.answerKeywords,
    };
  });
  const resolved = await Promise.all(taskPromises);
  const tasks: ReviewTask[] = resolved.filter(Boolean) as ReviewTask[];

  return { tasks, totalDue: dueItems.length };
}

export interface ReviewSubmitResult {
  result: ReviewResult;
  feedback: string;
  status: LearningStatus;
  nextReviewAt: string;
  remaining: number;
}

export async function submitReviewAnswer(params: {
  itemId: string;
  answer: string;
  usedHint: boolean;
  skipped: boolean;
  task: ReviewTask;
}): Promise<ReviewSubmitResult> {
  const { itemId, answer, usedHint, skipped, task } = params;

  let result: ReviewResult;
  if (skipped) {
    result = "SKIPPED";
  } else if (!answer.trim()) {
    result = "INCORRECT";
  } else {
    // 统一查找 item 内容，用于判题
    const content = await findItemContent(itemId);
    const correct = content ? judgeCorrect(answer, content) : judgeByKeywords(answer, task.answerKeywords);
    result = correct ? (usedHint ? "CORRECT_WITH_HINT" : "CORRECT_INDEPENDENT") : "INCORRECT";
  }

  // Schedule
  const hoursMap: Record<ReviewResult, number> = {
    CORRECT_INDEPENDENT: 72,
    CORRECT_WITH_HINT: 24,
    INCORRECT: 4,
    SKIPPED: 2,
  };
  const nextReviewAt = new Date(Date.now() + hoursMap[result] * 60 * 60 * 1000).toISOString();

  // Status
  const statusMap: Record<ReviewResult, LearningStatus> = {
    CORRECT_INDEPENDENT: "RECALLED_INDEPENDENTLY",
    CORRECT_WITH_HINT: "RECALLED_WITH_HELP",
    INCORRECT: "EXPOSED",
    SKIPPED: "EXPOSED",
  };
  const status = statusMap[result];

  // Feedback
  const feedbackMap: Record<ReviewResult, string> = {
    CORRECT_INDEPENDENT: `完美！无提示独立回忆「${task.term}」= ${task.coreMeaning}`,
    CORRECT_WITH_HINT: `正确！借助提示回忆出「${task.term}」= ${task.coreMeaning}。下次试试独立回忆。`,
    INCORRECT: `还需加强。「${task.term}」的含义是：${task.coreMeaning}`,
    SKIPPED: `已跳过。「${task.term}」= ${task.coreMeaning}，稍后再复习。`,
  };

  // Save event
  const events = getEvents();
  events.push({
    id: `evt-${Date.now()}`,
    userId: "demo",
    itemId,
    eventType: "REVIEW",
    taskType: "MEANING_RECALL",
    answer,
    correctness: result === "CORRECT_INDEPENDENT" ? "INDEPENDENT" : result === "CORRECT_WITH_HINT" ? "HINTED" : result === "SKIPPED" ? "SKIPPED" : "FAIL",
    hintLevel: usedHint ? 1 : 0,
    resultJson: { reviewResult: result },
    clientEventId: `rev-${itemId}-${Date.now()}`,
    traceId: `trc-${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  saveEvents(events);

  // Update state
  const states = getStates();
  const prev = states[itemId];
  states[itemId] = {
    userId: "demo",
    itemId,
    status,
    recognitionLevel: prev?.recognitionLevel ?? 1,
    recallLevel: result === "CORRECT_INDEPENDENT" ? Math.min((prev?.recallLevel ?? 0) + 1, 5) : (prev?.recallLevel ?? 0),
    applicationLevel: 0,
    consecutiveCorrect: (result === "CORRECT_INDEPENDENT" || result === "CORRECT_WITH_HINT") ? (prev?.consecutiveCorrect ?? 0) + 1 : 0,
    currentIntervalDays: hoursMap[result] / 24,
    nextReviewAt,
    updatedAt: new Date().toISOString(),
  };
  saveStates(states);

  const remaining = Object.values(states).filter((s) => s.nextReviewAt <= new Date().toISOString()).length;
  return { result, feedback: feedbackMap[result], status, nextReviewAt, remaining };
}

// ============================================================
// Speaking Service
// ============================================================

export async function createSpeakingSession(part: string): Promise<{
  session: SpeakingSession;
  questionData: SpeakingQuestion;
}> {
  const questions = await loadSpeakingQuestions();
  const pool = questions.filter((q) => q.part === part);
  const questionData = pool[Math.floor(Math.random() * pool.length)] ?? questions[0]!;

  const session: SpeakingSession = {
    id: `spk-${Date.now()}`,
    userId: "demo",
    questionId: questionData.questionId,
    part: questionData.part,
    topic: questionData.topic,
    question: questionData.question,
    firstAnswer: null,
    firstAnalysis: null,
    secondAnswer: null,
    secondAnalysis: null,
    status: "IN_PROGRESS",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sessions = getSpeakingSessions();
  sessions.push(session);
  saveSpeakingSessions(sessions);

  return { session, questionData };
}

export async function analyzeSpeakingLocally(
  sessionId: string,
  answer: string,
  isSecondAnswer: boolean,
): Promise<{ analysis: SpeakingAnalysisResult; session: SpeakingSession }> {
  const sessions = getSpeakingSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) throw new Error("Session not found");

  const session = sessions[idx]!;
  const questions = await loadSpeakingQuestions();
  const q = questions.find((qq) => qq.questionId === session.questionId)!;

  // Deterministic analysis (same as rule engine)
  const analysis = analyzeLocally(answer, q);

  if (isSecondAnswer) {
    session.secondAnswer = answer;
    session.secondAnalysis = analysis;
    session.status = "COMPLETED";
  } else {
    session.firstAnswer = answer;
    session.firstAnalysis = analysis;
  }
  session.updatedAt = new Date().toISOString();
  sessions[idx] = session;
  saveSpeakingSessions(sessions);

  return { analysis, session };
}

// ============================================================
// Report Service
// ============================================================

export interface WeekBucket {
  newItems: number; // 去重新收表达
  reviews: number; // 复习事件数
  reviewAccuracy: number | null; // 本窗口会话内准确率（非掌握率）
  activeDays: number; // 本窗口活跃天数
  speakingCompleted: number; // 本窗口完成口语次数
}

export interface SpeakingIssueDigest {
  dimension: SpeakingDimension;
  label: string;
  count: number;
  suggestion: string;
}

export interface SpeakingDigest {
  completedCount: number;
  attemptedCount: number;
  avgWordCount: number;
  maxWordCount: number;
  avgConnectors: number;
  topIssue: SpeakingIssueDigest | null;
  retryImprovement: { sessions: number; avgWordDelta: number } | null;
  partsCovered: SpeakingPart[];
}

export interface LexiconEntry {
  itemId: string;
  term: string;
  coreMeaning: string;
  addedAt: string;
  status: LearningStatus;
  needsAttention: boolean;
  reason?: string;
}

export interface ClientReport {
  totalItems: number;
  newItems: number;
  reviewedCount: number;
  dueSoon: number;
  correctRate: number; // 全历史口径，保留但不渲染
  reviewTotal: number;
  correctIndependent: number;
  correctWithHint: number;
  incorrect: number;
  skipped: number;
  speakingCount: number; // 含未完成，仅用于空态判断
  speakingTopIssue: string | null;
  // 周对比与口语摘要（支撑编辑式报告）
  thisWeek: WeekBucket;
  lastWeek: WeekBucket;
  speaking: SpeakingDigest;
  dueNow: number;
  activeDays: number;
  streak: number;
  newThisWeek: number;
  newLastWeek: number;
  weeklyActivity: Array<{ key: string; label: string; hasActivity: boolean; isToday: boolean }>;
  nextStep: NextStep;
}

export function generateClientReport(): ClientReport {
  const states = getStates();
  const events = getEvents();
  const sessions = getSpeakingSessions();
  const now = new Date().toISOString();
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const stateList = Object.values(states);
  const totalItems = stateList.length;
  const newEvents = events.filter((e) => e.eventType === "NEW");
  const reviewEvents = events.filter((e) => e.eventType === "REVIEW");

  const dueSoon = stateList.filter((s) => s.nextReviewAt <= in24h).length;
  const correctIndependent = reviewEvents.filter((e) => e.correctness === "INDEPENDENT").length;
  const correctWithHint = reviewEvents.filter((e) => e.correctness === "HINTED").length;
  const incorrect = reviewEvents.filter((e) => e.correctness === "FAIL").length;
  const skipped = reviewEvents.filter((e) => e.correctness === "SKIPPED").length;
  const reviewTotal = reviewEvents.length;
  const correctRate = reviewTotal > 0 ? (correctIndependent + correctWithHint) / reviewTotal : 0;

  // Speaking top issue（仅用于口语摘要，不再直接渲染）
  const dimCount: Record<string, number> = {};
  for (const s of sessions) {
    const dim = s.firstAnalysis?.mainIssue?.dimension;
    if (dim) dimCount[dim] = (dimCount[dim] ?? 0) + 1;
  }
  const topDim = Object.entries(dimCount).sort((a, b) => b[1] - a[1])[0];
  const speakingTopIssue = topDim ? `${topDim[0]}（${topDim[1]} 次）` : null;
  const topIssueCount = topDim ? topDim[1] : 0;

  // 周对比与口语摘要
  const { thisWeek, lastWeek } = buildWeekBuckets(events, sessions);
  const speaking = buildSpeakingDigest(sessions);
  const streak = computeStreak(events);
  const nowMs = Date.now();
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = nowMs - 14 * 24 * 60 * 60 * 1000;
  const newThisWeek = new Set(
    newEvents
      .filter((e) => new Date(e.createdAt).getTime() >= weekAgo)
      .map((e) => e.itemId),
  ).size;
  const newLastWeek = new Set(
    newEvents
      .filter(
        (e) =>
          new Date(e.createdAt).getTime() >= twoWeeksAgo &&
          new Date(e.createdAt).getTime() < weekAgo,
      )
      .map((e) => e.itemId),
  ).size;

  const dueNow = stateList.filter((s) => s.nextReviewAt <= now).length;
  const nextStep = buildNextStep({
    dueNow,
    topIssueCount,
    speakingCompleted: speaking.completedCount,
    totalItems,
  });

  return {
    totalItems,
    newItems: newEvents.length,
    reviewedCount: reviewTotal,
    dueSoon,
    correctRate,
    reviewTotal,
    correctIndependent,
    correctWithHint,
    incorrect,
    skipped,
    speakingCount: sessions.length,
    speakingTopIssue,
    thisWeek,
    lastWeek,
    speaking,
    dueNow,
    activeDays: thisWeek.activeDays,
    streak,
    newThisWeek,
    newLastWeek,
    weeklyActivity: buildWeeklyActivity(events),
    nextStep,
  };
}

// ============================================================
// Report data builders (编辑式报告支撑)
// ============================================================

/** 批量解析 itemId → 词条文本（seed 优先 → els_items 缓存）。解析失败不返回。 */
export async function resolveItemTerms(
  itemIds: string[],
): Promise<Map<string, { term: string; coreMeaning: string }>> {
  const result = new Map<string, { term: string; coreMeaning: string }>();
  if (itemIds.length === 0) return result;
  const seeds = await loadSeedItems();
  const seedById = new Map(seeds.map((s) => [s.itemId, s]));
  const cacheArr = Object.values(getItemsCache());
  for (const id of itemIds) {
    const seed = seedById.get(id);
    if (seed) {
      result.set(id, { term: seed.term, coreMeaning: seed.coreMeaning });
      continue;
    }
    const fromCache = cacheArr.find((c) => stableItemId(c.normalizedTerm) === id);
    if (fromCache) result.set(id, { term: fromCache.term, coreMeaning: fromCache.coreMeaning });
  }
  return result;
}

/** 异步构建词库视图：recent=近7天新收，attention=需要回头看的（最多5）。 */
export async function buildLexicon(): Promise<{ recent: LexiconEntry[]; attention: LexiconEntry[] }> {
  const states = getStates();
  const events = getEvents();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const firstNewAt = new Map<string, string>();
  for (const e of events) {
    if (e.eventType !== "NEW") continue;
    if (new Date(e.createdAt).getTime() < weekAgo) continue;
    const cur = firstNewAt.get(e.itemId);
    if (!cur || e.createdAt < cur) firstNewAt.set(e.itemId, e.createdAt);
  }
  const recentIds = [...firstNewAt.keys()];

  const attentionStates = Object.values(states)
    .filter((s) => s.status === "EXPOSED" || s.status === "RECALLED_WITH_HELP")
    .sort((a, b) => (a.nextReviewAt < b.nextReviewAt ? -1 : 1));
  const attentionIds = attentionStates.map((s) => s.itemId);

  const ids = Array.from(new Set([...recentIds, ...attentionIds]));
  const resolved = await resolveItemTerms(ids);

  const recent: LexiconEntry[] = recentIds
    .map((id): LexiconEntry | null => {
      const r = resolved.get(id);
      if (!r) return null;
      const st = states[id];
      return {
        itemId: id,
        term: r.term,
        coreMeaning: r.coreMeaning,
        addedAt: firstNewAt.get(id)!,
        status: st?.status ?? "EXPOSED",
        needsAttention: false,
      };
    })
    .filter((x): x is LexiconEntry => x !== null)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));

  const attention: LexiconEntry[] = attentionStates
    .map((s): LexiconEntry | null => {
      const r = resolved.get(s.itemId);
      if (!r) return null;
      return {
        itemId: s.itemId,
        term: r.term,
        coreMeaning: r.coreMeaning,
        addedAt: s.updatedAt,
        status: s.status,
        needsAttention: true,
        reason: s.status === "EXPOSED" ? "上次还没想起来" : "还需要提示才能想起来",
      };
    })
    .filter((x): x is LexiconEntry => x !== null)
    .slice(0, 5);

  return { recent, attention };
}

const DIM_LABELS: Record<SpeakingDimension, string> = {
  fluency: "回答长度不足",
  vocabulary: "词汇重复",
  coherence: "缺少过渡衔接",
  development: "内容展开不够",
  argumentation: "论证逻辑",
};

/** 滚动 7 天窗口的周对比（本周 / 前七天）。 */
export function buildWeekBuckets(
  events: LearningEvent[],
  sessions: SpeakingSession[],
  now: number = Date.now(),
): { thisWeek: WeekBucket; lastWeek: WeekBucket } {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  const bucket = (fromMs: number, toMs: number): WeekBucket => {
    const ev = events.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= fromMs && t < toMs;
    });
    const newItems = new Set(ev.filter((e) => e.eventType === "NEW").map((e) => e.itemId)).size;
    const reviews = ev.filter((e) => e.eventType === "REVIEW").length;
    const reviewAccuracy = computeReviewAccuracy(ev, fromMs, toMs);
    const activeDays = new Set(ev.map((e) => localDayKey(e.createdAt))).size;
    const speakingCompleted = sessions.filter((s) => {
      if (s.status !== "COMPLETED") return false;
      const t = new Date(s.createdAt).getTime();
      return t >= fromMs && t < toMs;
    }).length;
    return { newItems, reviews, reviewAccuracy, activeDays, speakingCompleted };
  };

  return { thisWeek: bucket(weekAgo, now), lastWeek: bucket(twoWeeksAgo, weekAgo) };
}

/** 口语摘要：真实产出量 + 高频问题 + 首答/重答改善。 */
export function buildSpeakingDigest(sessions: SpeakingSession[]): SpeakingDigest {
  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const completedCount = completed.length;
  if (completedCount === 0) {
    return {
      completedCount,
      attemptedCount: sessions.length,
      avgWordCount: 0,
      maxWordCount: 0,
      avgConnectors: 0,
      topIssue: null,
      retryImprovement: null,
      partsCovered: [],
    };
  }

  const wordCounts = completed.map((s) => s.firstAnalysis?.metrics.wordCount ?? 0);
  const connectorCounts = completed.map((s) => s.firstAnalysis?.metrics.connectorCount ?? 0);
  const avgWordCount = Math.round(wordCounts.reduce((a, b) => a + b, 0) / completedCount);
  const maxWordCount = Math.max(...wordCounts);
  const avgConnectors = Math.round((connectorCounts.reduce((a, b) => a + b, 0) / completedCount) * 10) / 10;

  const dimAgg: Record<string, { count: number; suggestion: string }> = {};
  for (const s of completed) {
    const dim = s.firstAnalysis?.mainIssue?.dimension;
    if (!dim) continue;
    if (!dimAgg[dim]) dimAgg[dim] = { count: 0, suggestion: s.firstAnalysis!.mainIssue!.suggestion };
    dimAgg[dim].count += 1;
  }
  const topEntry = Object.entries(dimAgg).sort((a, b) => b[1].count - a[1].count)[0];
  const topIssue = topEntry
    ? {
        dimension: topEntry[0] as SpeakingDimension,
        label: DIM_LABELS[topEntry[0] as SpeakingDimension],
        count: topEntry[1].count,
        suggestion: topEntry[1].suggestion,
      }
    : null;

  const retries = completed.filter((s) => s.secondAnalysis && s.firstAnalysis);
  let retryImprovement: SpeakingDigest["retryImprovement"] = null;
  if (retries.length > 0) {
    const deltas = retries.map(
      (s) => s.secondAnalysis!.metrics.wordCount - s.firstAnalysis!.metrics.wordCount,
    );
    const avg = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
    retryImprovement = { sessions: retries.length, avgWordDelta: avg };
  }

  const partsCovered = Array.from(new Set(completed.map((s) => s.part)));
  return {
    completedCount,
    attemptedCount: sessions.length,
    avgWordCount,
    maxWordCount,
    avgConnectors,
    topIssue,
    retryImprovement,
    partsCovered,
  };
}

function buildWeeklyActivity(events: LearningEvent[]): Array<{
  key: string;
  label: string;
  hasActivity: boolean;
  isToday: boolean;
}> {
  const today = new Date();
  const activeSet = new Set(events.map((e) => localDayKey(e.createdAt)));
  const cells: Array<{ key: string; label: string; hasActivity: boolean; isToday: boolean }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDayKey(d);
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    cells.push({
      key,
      label: `周${weekday}`,
      hasActivity: activeSet.has(key),
      isToday: i === 0,
    });
  }
  return cells;
}

// ============================================================
// Helpers
// ============================================================

function seedToItem(seed: SeedLearningItem): LearningItem {
  return {
    id: seed.itemId,
    itemType: seed.itemType,
    canonicalForm: seed.term,
    normalizedTerm: seed.normalizedTerm,
    contentJson: seed,
    topicTags: seed.topicTags,
    createdAt: new Date().toISOString(),
  };
}

function judgeCorrect(answer: string, seed: SeedLearningItem): boolean {
  const normalized = answer.trim().toLowerCase().replace(/[；;、，,。.（）()：:""\"\'!！?？\-—\s]+/g, "");
  if (!normalized) return false;
  // Exact match
  if (seed.acceptedAnswers.some((a) => a.toLowerCase().replace(/[；;、，,。.（）()：:""\"\'!！?？\-—\s]+/g, "") === normalized)) return true;
  // Keyword match
  if (seed.answerKeywords.length > 0 && seed.answerKeywords.every((kw) => normalized.includes(kw.toLowerCase().replace(/\s+/g, "")))) return true;
  return false;
}

function judgeByKeywords(answer: string, keywords: string[]): boolean {
  const normalized = answer.trim().toLowerCase();
  return keywords.length > 0 && keywords.every((kw) => normalized.includes(kw.toLowerCase()));
}

function analyzeLocally(answer: string, q: SpeakingQuestion): SpeakingAnalysisResult {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const lowerAnswer = answer.toLowerCase();

  const allConnectors = [...q.goodConnectors, "however", "moreover", "furthermore", "therefore", "firstly", "secondly", "finally", "for example", "for instance"];
  const connectorCount = allConnectors.filter((c) => lowerAnswer.includes(c.toLowerCase())).length;

  // Main issue
  let mainDim: SpeakingAnalysisResult["mainIssue"]["dimension"] = "fluency";
  let mainSev: "minor" | "major" = "minor";
  let mainDesc = "整体表达不错，继续保持！";
  let mainSugg = "尝试在关键观点前加入过渡语。";

  if (wordCount < q.expectedLength.min) {
    mainDim = "fluency"; mainSev = "major";
    mainDesc = `回答过短（${wordCount} 词，建议至少 ${q.expectedLength.min} 词）。`;
    mainSugg = `尝试展开回答：加入原因、例子或个人经历。目标 ${q.expectedLength.ideal} 词左右。`;
  } else if (connectorCount === 0) {
    mainDim = "coherence"; mainSev = "major";
    mainDesc = `未检测到连接词/过渡语，回答可能显得跳跃。`;
    mainSugg = `试着加入过渡词，如：${q.goodConnectors.slice(0, 3).join("、")}。`;
  } else if (sentences.length > 0 && wordCount / sentences.length < 8) {
    mainDim = "development"; mainSev = "minor";
    mainDesc = "句子普遍较短，缺乏复合句式。";
    mainSugg = "尝试用 because / although / which 构建复合句。";
  }

  return {
    candidateIssues: [{ dimension: mainDim, severity: mainSev, description: mainDesc, suggestion: mainSugg }],
    mainIssue: { dimension: mainDim, severity: mainSev, description: mainDesc, suggestion: mainSugg },
    microDrill: {
      prompt: mainDim === "fluency" ? "请补充一个具体例子来支撑你的观点。" : mainDim === "coherence" ? `请用 ${q.goodConnectors[0] ?? "firstly"} 和 ${q.goodConnectors[1] ?? "moreover"} 重新组织回答。` : "请用一个从句改写你回答中的简单句。",
      exampleImprovement: "For example, I remember when... This experience taught me that...",
      targetDimension: mainDim,
    },
    metrics: { wordCount, sentenceCount: sentences.length, connectorCount, uniqueWordRatio: 0, paraphraseScore: 0 },
    summary: mainSev === "major" ? `本次回答 ${wordCount} 词，需改善「${mainDim}」。` : `表达基本到位（${wordCount} 词），可优化「${mainDim}」。`,
  };
}
