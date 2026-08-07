"use client";
/**
 * Browser Demo Service
 * ------------------------------------------------------------
 * 纯客户端的学习数据服务，使用 localStorage 持久化。
 * 替代服务端 MemoryLearningRepository + API routes。
 * 所有逻辑确定性执行，不调 LLM。
 */
import { getItem, setItem } from "@/lib/client/storage";
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
import type { SpeakingAnalysisResult, SpeakingSession, SpeakingQuestion } from "@/lib/speaking/types";

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
// Learn Service
// ============================================================

export async function getWordCard(term: string): Promise<
  | { ok: true; data: WordCardResponse }
  | { ok: false; error: string }
> {
  const seeds = await loadSeedItems();
  const normalized = term.trim().toLowerCase().replace(/\s+/g, " ");
  const seed = seeds.find((s) => s.normalizedTerm === normalized);

  if (!seed) {
    return { ok: false, error: `词库中未找到「${term}」。Demo 模式仅支持预设词条。` };
  }

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

export async function submitLearnAnswer(params: {
  itemId: string;
  answer: string;
  usedHint: boolean;
}): Promise<LearnSubmitResponse> {
  const { itemId, answer, usedHint } = params;
  const seeds = await loadSeedItems();
  const seed = seeds.find((s) => s.itemId === itemId);
  const term = seed?.term ?? itemId;
  const coreMeaning = seed?.coreMeaning ?? "";

  // Judge
  const isCorrect = seed ? judgeCorrect(answer, seed) : false;
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
  const seeds = await loadSeedItems();
  const states = getStates();
  const now = new Date().toISOString();

  if (mode === "MANUAL" && itemId) {
    const seed = seeds.find((s) => s.itemId === itemId);
    if (!seed) return { tasks: [], totalDue: 0 };
    return {
      tasks: [{
        itemId: seed.itemId,
        term: seed.term,
        prompt: `请回忆「${seed.term}」的核心含义（中文）。`,
        coreMeaning: seed.coreMeaning,
        acceptedAnswers: seed.acceptedAnswers,
        answerKeywords: seed.answerKeywords,
      }],
      totalDue: Object.values(states).filter((s) => s.nextReviewAt <= now).length,
    };
  }

  // DUE mode
  const dueItems = Object.values(states)
    .filter((s) => s.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, 10);

  const tasks: ReviewTask[] = dueItems
    .map((s) => {
      const seed = seeds.find((sd) => sd.itemId === s.itemId);
      if (!seed) return null;
      return {
        itemId: seed.itemId,
        term: seed.term,
        prompt: `请回忆「${seed.term}」的核心含义（中文）。`,
        coreMeaning: seed.coreMeaning,
        acceptedAnswers: seed.acceptedAnswers,
        answerKeywords: seed.answerKeywords,
      };
    })
    .filter(Boolean) as ReviewTask[];

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
    const seeds = await loadSeedItems();
    const seed = seeds.find((s) => s.itemId === itemId);
    const correct = seed ? judgeCorrect(answer, seed) : judgeByKeywords(answer, task.answerKeywords);
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

export interface ClientReport {
  totalItems: number;
  newItems: number;
  reviewedCount: number;
  dueSoon: number;
  correctRate: number;
  reviewTotal: number;
  correctIndependent: number;
  correctWithHint: number;
  incorrect: number;
  skipped: number;
  speakingCount: number;
  speakingTopIssue: string | null;
  recommendations: Array<{ text: string; link: string; priority: string }>;
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

  // Speaking top issue
  const dimCount: Record<string, number> = {};
  for (const s of sessions) {
    const dim = s.firstAnalysis?.mainIssue?.dimension;
    if (dim) dimCount[dim] = (dimCount[dim] ?? 0) + 1;
  }
  const topDim = Object.entries(dimCount).sort((a, b) => b[1] - a[1])[0];
  const speakingTopIssue = topDim ? `${topDim[0]}（${topDim[1]} 次）` : null;

  // Recommendations
  const recommendations: Array<{ text: string; link: string; priority: string }> = [];
  const dueNow = stateList.filter((s) => s.nextReviewAt <= now).length;
  if (dueNow > 0) recommendations.push({ text: `${dueNow} 个词条到期需复习`, link: "/review", priority: "HIGH" });
  if (totalItems < 10) recommendations.push({ text: "词汇量不足 10，继续学习新词", link: "/learn", priority: "MEDIUM" });
  if (topDim && topDim[1] >= 2) recommendations.push({ text: `口语「${topDim[0]}」重复出现问题`, link: "/speaking", priority: "MEDIUM" });
  if (recommendations.length === 0) recommendations.push({ text: "状态良好，继续学习新词", link: "/learn", priority: "LOW" });

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
    recommendations,
  };
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
