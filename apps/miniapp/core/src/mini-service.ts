/**
 * 小程序端学习数据服务（纯客户端 · 确定性 · 不调 LLM）
 * 复用 web 端 demo-service 的逻辑，但存储走 StorageAdapter（Taro storage）。
 */
import seedItemsJson from "./seed/ielts-learning-items.json";
import speakingJson from "./seed/speaking-questions.json";
import { store } from "./storage/adapter";
import { computeStreak, computeReviewAccuracy } from "./client/progress";
import { localDayKey } from "./client/day";
import { normalizeTerm, stableItemId } from "./client/item-id";
import { buildNextStep, type NextStep } from "./client/report-narrative";
import type {
  SeedLearningItem,
  LearningItem,
  UserItemState,
  LearningEvent,
  LearningStatus,
  EventCorrectness,
} from "./learning/types";
import type { ReviewResult } from "./review/answer-judge";
import type {
  SpeakingAnalysisResult,
  SpeakingSession,
  SpeakingQuestion,
  SpeakingDimension,
  SpeakingPart,
} from "./speaking/types";

const seedItems = seedItemsJson as SeedLearningItem[];
const speakingQuestions = speakingJson as SpeakingQuestion[];

// ---------------- 存储键（沿用 web 的 els_ 前缀约定） ----------------
const K_STATES = "states";
const K_EVENTS = "events";
const K_SESSIONS = "speaking_sessions";
const K_ITEMS = "items";
const K_PROFILE = "profile";
// 周目标（单位：词）。与本周成就、学习报告共享，本端持久化，云端缝合缝已留。
const K_GOAL = "weeklyGoal";
const K_GOAL_PROFILE = "goalProfile";
const DEFAULT_WEEKLY_GOAL = 200;

/** 备考目标档案（独立 JSON，不污染昵称/头像 ProfileData） */
export interface GoalProfile {
  /** 考试日期 ISO yyyy-mm-dd；未设定为 null */
  examDate: string | null;
  /** 目标总分（如 6.5） */
  targetBand: number;
  /** 当前自估分（4.0–7.0） */
  currentBand: number;
  /** 每日可投入学习分钟 */
  dailyMinutes: number;
  /** 生成或自定义得到的周目标词数；回填 K_GOAL，与本周成就/报告共享 */
  weeklyWordTarget: number;
  /** 首次设定时间 ISO；用于按真实流逝周数推进阶段进度 */
  setAt: string | null;
  /** 设定时的总周数快照（考试日→设定日）；阶段进度分母 */
  plannedWeeks: number | null;
}

export function getGoalProfile(): GoalProfile {
  const p = store.getJSON<Partial<GoalProfile>>(K_GOAL_PROFILE);
  if (p) {
    return {
      examDate: p.examDate ?? null,
      targetBand: p.targetBand ?? 6.5,
      currentBand: p.currentBand ?? 5.0,
      dailyMinutes: p.dailyMinutes ?? 30,
      weeklyWordTarget: p.weeklyWordTarget ?? legacyGoal(),
      setAt: p.setAt ?? null,
      plannedWeeks: p.plannedWeeks ?? null,
    };
  }
  // 迁移：旧版仅存了周目标
  return {
    examDate: null,
    targetBand: 6.5,
    currentBand: 5.0,
    dailyMinutes: 30,
    weeklyWordTarget: legacyGoal(),
    setAt: null,
    plannedWeeks: null,
  };
}
export function saveGoalProfile(p: GoalProfile): void {
  const prev = store.getJSON<Partial<GoalProfile>>(K_GOAL_PROFILE);
  const setAt = p.setAt ?? prev?.setAt ?? new Date().toISOString();
  const plannedWeeks = p.examDate
    ? Math.max(1, Math.ceil((new Date(p.examDate + "T00:00:00").getTime() - Date.now()) / (7 * 86400000)))
    : null;
  store.setJSON(K_GOAL_PROFILE, { ...p, setAt, plannedWeeks });
}
function legacyGoal(): number {
  return store.getJSON<number>(K_GOAL) ?? DEFAULT_WEEKLY_GOAL;
}

export function getWeeklyGoal(): number {
  return getGoalProfile().weeklyWordTarget ?? DEFAULT_WEEKLY_GOAL;
}
export function setWeeklyGoal(n: number): void {
  const v = Math.max(1, Math.round(n) || DEFAULT_WEEKLY_GOAL);
  const p = getGoalProfile();
  p.weeklyWordTarget = v;
  saveGoalProfile(p);
}

// ---------------- 基础读写 ----------------
function getStates(): Record<string, UserItemState> {
  return store.getJSON<Record<string, UserItemState>>(K_STATES) ?? {};
}
function saveStates(s: Record<string, UserItemState>) {
  store.setJSON(K_STATES, s);
}
function getEvents(): LearningEvent[] {
  return store.getJSON<LearningEvent[]>(K_EVENTS) ?? [];
}
function saveEvents(e: LearningEvent[]) {
  store.setJSON(K_EVENTS, e);
}
function getSessions(): SpeakingSession[] {
  return store.getJSON<SpeakingSession[]>(K_SESSIONS) ?? [];
}
function saveSessions(s: SpeakingSession[]) {
  store.setJSON(K_SESSIONS, s);
}
function getItemsCache(): Record<string, SeedLearningItem> {
  return store.getJSON<Record<string, SeedLearningItem>>(K_ITEMS) ?? {};
}

async function findItemContent(itemId: string): Promise<SeedLearningItem | null> {
  const fromSeed = seedItems.find((s) => s.itemId === itemId);
  if (fromSeed) return fromSeed;
  const cache = Object.values(getItemsCache());
  return cache.find((c) => stableItemId(c.normalizedTerm) === itemId) ?? null;
}

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

// ---------------- 今日概览 ----------------
export interface TodaySummary {
  dayNumber: number;
  streak: number;
  due: number;
  newCount: number;
  speakingCount: number;
  minutes: number;
  hasDue: boolean;
  nextStep: NextStep;
}

export function getTodaySummary(): TodaySummary {
  const states = getStates();
  const events = getEvents();
  const nowIso = new Date().toISOString();
  const due = Object.values(states).filter((s) => s.nextReviewAt <= nowIso).length;
  const streak = computeStreak(events);

  const newEvents = events.filter((e) => e.eventType === "NEW");
  let dayNumber = 1;
  if (newEvents.length > 0) {
    const first = newEvents.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    const days = Math.floor((Date.now() - new Date(first.createdAt).getTime()) / 86400000);
    dayNumber = days + 1;
  }
  const newCount = new Set(newEvents.map((e) => e.itemId)).size;
  const sessions = getSessions();
  const speakingCount = sessions.filter((s) => s.status === "COMPLETED").length;

  const nextStep = buildNextStep({
    dueNow: due,
    topIssueCount: 0,
    speakingCompleted: speakingCount,
    totalItems: Object.keys(states).length,
  });

  return {
    dayNumber,
    streak,
    due,
    newCount,
    speakingCount,
    minutes: Math.max(1, Math.ceil(due * 0.5)),
    hasDue: due > 0,
    nextStep,
  };
}

// ---------------- 学习（单卡主动回忆） ----------------
export interface LearnCard {
  itemId: string;
  term: string;
  phonetic: string;
  partOfSpeech: string;
  clue: string; // 提示（线索，非全答案）
  meaning: string;
  exampleSentence: string;
  exampleTranslation: string;
  alreadyLearned: boolean;
  totalInDeck: number;
  indexInDeck: number;
}

export function getLearnDeck(): LearnCard[] {
  const states = getStates();
  const nowIso = new Date().toISOString();
  // 待学：无状态，或状态偏新（未到复习点且非已掌握）
  const deck = seedItems
    .filter((s) => {
      const st = states[s.itemId];
      if (!st) return true;
      if (st.nextReviewAt > nowIso) return false; // 在复习里处理
      return st.status !== "RECALLED_INDEPENDENTLY";
    })
    .slice(0, 12);
  return deck.map((s, i) => ({
    itemId: s.itemId,
    term: s.term,
    phonetic: s.phonetic,
    partOfSpeech: s.partOfSpeech,
    clue: s.collocations?.[0] ?? s.topicTags?.[0] ?? "",
    meaning: s.coreMeaning,
    exampleSentence: s.exampleSentence,
    exampleTranslation: s.exampleTranslation,
    alreadyLearned: !!states[s.itemId],
    totalInDeck: deck.length,
    indexInDeck: i,
  }));
}

function judgeCorrect(answer: string, seed: SeedLearningItem): boolean {
  const normalized = answer
    .trim()
    .toLowerCase()
    .replace(/[；;、，,。.（）()：:""\'!！?？\-—\s]+/g, "");
  if (!normalized) return false;
  if (
    seed.acceptedAnswers.some(
      (a) => a.toLowerCase().replace(/[；;、，,。.（）()：:""\'!！?？\-—\s]+/g, "") === normalized,
    )
  )
    return true;
  if (
    seed.answerKeywords.length > 0 &&
    seed.answerKeywords.every((kw) => normalized.includes(kw.toLowerCase().replace(/\s+/g, "")))
  )
    return true;
  return false;
}

export interface LearnSubmitResult {
  correctness: EventCorrectness;
  status: LearningStatus;
  feedback: string;
  nextReviewAt: string;
  state: UserItemState;
}

export function submitLearnAnswer(params: {
  itemId: string;
  answer: string;
  usedHint: boolean;
  userId: string;
  /** 本次交互耗时（毫秒），用于学习时长统计 */
  durationMs?: number;
}): LearnSubmitResult {
  const { itemId, answer, usedHint, userId } = params;
  const content = (() => {
    const s = seedItems.find((x) => x.itemId === itemId);
    return s ?? null;
  })();
  const term = content?.term ?? itemId;
  const coreMeaning = content?.coreMeaning ?? "";

  const isCorrect = content ? judgeCorrect(answer, content) : false;
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
    feedback = `正确！「${term}」= ${coreMeaning}（用了提示，下次试着独立回忆）`;
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

  const nextReviewAt = new Date(Date.now() + hoursUntil * 3600000).toISOString();

  const event: LearningEvent = {
    id: `evt-${Date.now()}`,
    userId,
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
    durationMs: params.durationMs ?? 0,
  };
  const events = getEvents();
  events.push(event);
  saveEvents(events);

  const states = getStates();
  const prev = states[itemId];
  const newState: UserItemState = {
    userId,
    itemId,
    status,
    recognitionLevel: correctness === "INDEPENDENT" ? 1 : prev?.recognitionLevel ?? 0,
    recallLevel: correctness === "INDEPENDENT" ? 1 : correctness === "HINTED" ? 1 : 0,
    applicationLevel: 0,
    consecutiveCorrect: correctness === "INDEPENDENT" ? (prev?.consecutiveCorrect ?? 0) + 1 : 0,
    currentIntervalDays: hoursUntil / 24,
    nextReviewAt,
    updatedAt: new Date().toISOString(),
  };
  states[itemId] = newState;
  saveStates(states);

  return { correctness, status, feedback, nextReviewAt, state: newState };
}

// ---------------- 复习（间隔重复队列） ----------------
export interface ReviewTask {
  itemId: string;
  term: string;
  prompt: string;
  coreMeaning: string;
  clue: string;
  acceptedAnswers: string[];
  answerKeywords: string[];
}

export function getReviewQueue(): { tasks: ReviewTask[]; totalDue: number } {
  const states = getStates();
  const nowIso = new Date().toISOString();
  const dueItems = Object.values(states)
    .filter((s) => s.nextReviewAt <= nowIso)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, 10);

  const tasks: ReviewTask[] = [];
  for (const s of dueItems) {
    const content = seedItems.find((x) => x.itemId === s.itemId);
    if (!content) continue;
    tasks.push({
      itemId: s.itemId,
      term: content.term,
      prompt: `请回忆「${content.term}」的核心含义（中文）。`,
      coreMeaning: content.coreMeaning,
      clue: content.collocations?.[0] ?? content.topicTags?.[0] ?? "",
      acceptedAnswers: content.acceptedAnswers,
      answerKeywords: content.answerKeywords,
    });
  }
  return { tasks, totalDue: dueItems.length };
}

export interface ReviewSubmitResult {
  result: ReviewResult;
  feedback: string;
  status: LearningStatus;
  nextReviewAt: string;
  remaining: number;
}

export function submitReviewAnswer(params: {
  itemId: string;
  answer: string;
  usedHint: boolean;
  skipped: boolean;
  task: ReviewTask;
  userId: string;
}): ReviewSubmitResult {
  const { itemId, answer, usedHint, skipped, task, userId } = params;
  let result: ReviewResult;
  if (skipped) result = "SKIPPED";
  else if (!answer.trim()) result = "INCORRECT";
  else {
    const content = seedItems.find((x) => x.itemId === itemId);
    const correct = content
      ? judgeCorrect(answer, content)
      : task.answerKeywords.length > 0 &&
        task.answerKeywords.every((kw) => answer.toLowerCase().includes(kw.toLowerCase()));
    result = correct ? (usedHint ? "CORRECT_WITH_HINT" : "CORRECT_INDEPENDENT") : "INCORRECT";
  }

  const hoursMap: Record<ReviewResult, number> = {
    CORRECT_INDEPENDENT: 72,
    CORRECT_WITH_HINT: 24,
    INCORRECT: 4,
    SKIPPED: 2,
  };
  const nextReviewAt = new Date(Date.now() + hoursMap[result] * 3600000).toISOString();

  const statusMap: Record<ReviewResult, LearningStatus> = {
    CORRECT_INDEPENDENT: "RECALLED_INDEPENDENTLY",
    CORRECT_WITH_HINT: "RECALLED_WITH_HELP",
    INCORRECT: "EXPOSED",
    SKIPPED: "EXPOSED",
  };
  const status = statusMap[result];

  const feedbackMap: Record<ReviewResult, string> = {
    CORRECT_INDEPENDENT: `完美！无提示独立回忆「${task.term}」= ${task.coreMeaning}`,
    CORRECT_WITH_HINT: `正确！借助提示回忆出「${task.term}」= ${task.coreMeaning}。下次试试独立回忆。`,
    INCORRECT: `还需加强。「${task.term}」的含义是：${task.coreMeaning}`,
    SKIPPED: `已跳过。「${task.term}」= ${task.coreMeaning}，稍后再复习。`,
  };

  const events = getEvents();
  events.push({
    id: `evt-${Date.now()}`,
    userId,
    itemId,
    eventType: "REVIEW",
    taskType: "MEANING_RECALL",
    answer,
    correctness:
      result === "CORRECT_INDEPENDENT"
        ? "INDEPENDENT"
        : result === "CORRECT_WITH_HINT"
          ? "HINTED"
          : result === "SKIPPED"
            ? "SKIPPED"
            : "FAIL",
    hintLevel: usedHint ? 1 : 0,
    resultJson: { reviewResult: result },
    clientEventId: `rev-${itemId}-${Date.now()}`,
    traceId: `trc-${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  saveEvents(events);

  const states = getStates();
  const prev = states[itemId];
  states[itemId] = {
    userId,
    itemId,
    status,
    recognitionLevel: prev?.recognitionLevel ?? 1,
    recallLevel:
      result === "CORRECT_INDEPENDENT" ? Math.min((prev?.recallLevel ?? 0) + 1, 5) : prev?.recallLevel ?? 0,
    applicationLevel: 0,
    consecutiveCorrect:
      result === "CORRECT_INDEPENDENT" || result === "CORRECT_WITH_HINT"
        ? (prev?.consecutiveCorrect ?? 0) + 1
        : 0,
    currentIntervalDays: hoursMap[result] / 24,
    nextReviewAt,
    updatedAt: new Date().toISOString(),
  };
  saveStates(states);

  const remaining = Object.values(getStates()).filter((s) => s.nextReviewAt <= new Date().toISOString())
    .length;
  return { result, feedback: feedbackMap[result], status, nextReviewAt, remaining };
}

// ---------------- 复习（三档自评分级，移动端单手） ----------------
export type ReviewRating = "SKILLED" | "FUZZY" | "ROUGH";

const RATING_QUALITY: Record<ReviewRating, ReviewResult> = {
  SKILLED: "CORRECT_INDEPENDENT", // 3 天
  FUZZY: "CORRECT_WITH_HINT", // 1 天
  ROUGH: "INCORRECT", // 4 小时
};

/** 自评分级 → 映射 quality → 复用 computeReviewNextAt 的排程 */
export function submitReviewRating(params: {
  itemId: string;
  rating: ReviewRating;
  userId: string;
  task: ReviewTask;
  /** 用户实际是否点开过「查看提示」。优先据此判定是否借助提示，缺省回退到 rating==="FUZZY" */
  usedHint?: boolean;
  /** 本次交互耗时（毫秒），用于学习时长统计 */
  durationMs?: number;
}): ReviewSubmitResult {
  const { itemId, rating, userId, task } = params;
  const baseResult = RATING_QUALITY[rating];
  // 实际点开过提示 → 即便自评“熟练”，也按“借助提示”排程（间隔更短）
  const result =
    params.usedHint && baseResult === "CORRECT_INDEPENDENT"
      ? "CORRECT_WITH_HINT"
      : baseResult;
  const usedHint = params.usedHint ?? rating === "FUZZY";
  const hoursMap: Record<ReviewResult, number> = {
    CORRECT_INDEPENDENT: 72,
    CORRECT_WITH_HINT: 24,
    INCORRECT: 4,
    SKIPPED: 2,
  };
  const nextReviewAt = new Date(Date.now() + hoursMap[result] * 3600000).toISOString();
  const statusMap: Record<ReviewResult, LearningStatus> = {
    CORRECT_INDEPENDENT: "RECALLED_INDEPENDENTLY",
    CORRECT_WITH_HINT: "RECALLED_WITH_HELP",
    INCORRECT: "EXPOSED",
    SKIPPED: "EXPOSED",
  };
  const status = statusMap[result];
  const feedbackMap: Record<ReviewResult, string> = {
    CORRECT_INDEPENDENT: `完美！独立回忆「${task.term}」= ${task.coreMeaning}`,
    CORRECT_WITH_HINT: `正确！「${task.term}」= ${task.coreMeaning}。下次试试独立回忆。`,
    INCORRECT: `还需加强。「${task.term}」的含义是：${task.coreMeaning}`,
    SKIPPED: `已跳过。「${task.term}」= ${task.coreMeaning}`,
  };

  const events = getEvents();
  events.push({
    id: `evt-${Date.now()}`,
    userId,
    itemId,
    eventType: "REVIEW",
    taskType: "MEANING_RECALL",
    answer: "",
    correctness: result === "CORRECT_INDEPENDENT" ? "INDEPENDENT" : result === "CORRECT_WITH_HINT" ? "HINTED" : "FAIL",
    hintLevel: usedHint ? 1 : 0,
    resultJson: { reviewResult: result, rating },
    clientEventId: `rev-${itemId}-${Date.now()}`,
    traceId: `trc-${Date.now()}`,
    createdAt: new Date().toISOString(),
    durationMs: params.durationMs ?? 0,
  });
  saveEvents(events);

  const states = getStates();
  const prev = states[itemId];
  states[itemId] = {
    userId,
    itemId,
    status,
    recognitionLevel: prev?.recognitionLevel ?? 1,
    recallLevel:
      result === "CORRECT_INDEPENDENT" ? Math.min((prev?.recallLevel ?? 0) + 1, 5) : prev?.recallLevel ?? 0,
    applicationLevel: 0,
    consecutiveCorrect:
      result === "CORRECT_INDEPENDENT" || result === "CORRECT_WITH_HINT"
        ? (prev?.consecutiveCorrect ?? 0) + 1
        : 0,
    currentIntervalDays: hoursMap[result] / 24,
    nextReviewAt,
    updatedAt: new Date().toISOString(),
  };
  saveStates(states);

  const remaining = Object.values(getStates()).filter((s) => s.nextReviewAt <= new Date().toISOString()).length;
  return { result, feedback: feedbackMap[result], status, nextReviewAt, remaining };
}

// ---------------- 口语（本地启发式兜底，与后端同构） ----------------
export function createSpeakingSession(part: SpeakingPart, userId: string): {
  session: SpeakingSession;
  questionData: SpeakingQuestion;
} {
  const pool = speakingQuestions.filter((q) => q.part === part);
  const questionData = pool[Math.floor(Math.random() * pool.length)] ?? speakingQuestions[0]!;
  const session: SpeakingSession = {
    id: `spk-${Date.now()}`,
    userId,
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
  const sessions = getSessions();
  sessions.push(session);
  saveSessions(sessions);
  return { session, questionData };
}

function analyzeLocally(answer: string, q: SpeakingQuestion): SpeakingAnalysisResult {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const lower = answer.toLowerCase();
  const allConnectors = [
    ...q.goodConnectors,
    "however",
    "moreover",
    "furthermore",
    "therefore",
    "firstly",
    "secondly",
    "finally",
    "for example",
    "for instance",
  ];
  const connectorCount = allConnectors.filter((c) => lower.includes(c.toLowerCase())).length;

  let mainDim: SpeakingDimension = "fluency";
  let mainSev: "minor" | "major" = "minor";
  let mainDesc = "整体表达不错，继续保持！";
  let mainSugg = "尝试在关键观点前加入过渡语。";

  if (wordCount < q.expectedLength.min) {
    mainDim = "fluency";
    mainSev = "major";
    mainDesc = `回答过短（${wordCount} 词，建议至少 ${q.expectedLength.min} 词）。`;
    mainSugg = `尝试展开回答：加入原因、例子或个人经历。目标 ${q.expectedLength.ideal} 词左右。`;
  } else if (connectorCount === 0) {
    mainDim = "coherence";
    mainSev = "major";
    mainDesc = "未检测到连接词 / 过渡语，回答可能显得跳跃。";
    mainSugg = `试着加入过渡词，如：${q.goodConnectors.slice(0, 3).join("、")}。`;
  } else if (sentences.length > 0 && wordCount / sentences.length < 8) {
    mainDim = "development";
    mainSev = "minor";
    mainDesc = "句子普遍较短，缺乏复合句式。";
    mainSugg = "尝试用 because / although / which 构建复合句。";
  }

  return {
    candidateIssues: [{ dimension: mainDim, severity: mainSev, description: mainDesc, suggestion: mainSugg }],
    mainIssue: { dimension: mainDim, severity: mainSev, description: mainDesc, suggestion: mainSugg },
    microDrill: {
      prompt:
        mainDim === "fluency"
          ? "请补充一个具体例子来支撑你的观点。"
          : mainDim === "coherence"
            ? `请用 ${q.goodConnectors[0] ?? "firstly"} 和 ${q.goodConnectors[1] ?? "moreover"} 重新组织回答。`
            : "请用一个从句改写你回答中的简单句。",
      exampleImprovement: "For example, I remember when... This experience taught me that...",
      targetDimension: mainDim,
    },
    metrics: { wordCount, sentenceCount: sentences.length, connectorCount, uniqueWordRatio: 0, paraphraseScore: 0 },
    summary:
      mainSev === "major"
        ? `本次回答 ${wordCount} 词，需改善「${mainDim}」。`
        : `表达基本到位（${wordCount} 词），可优化「${mainDim}」。`,
  };
}

export function analyzeSpeakingLocally(
  sessionId: string,
  answer: string,
  isSecondAnswer: boolean,
): { analysis: SpeakingAnalysisResult; session: SpeakingSession } {
  const sessions = getSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) throw new Error("Session not found");
  const session = sessions[idx]!;
  const q = speakingQuestions.find((qq) => qq.questionId === session.questionId)!;
  const analysis = analyzeLocally(answer, q);
  const elapsed = Date.now() - new Date(session.createdAt).getTime();
  if (isSecondAnswer) {
    session.secondAnswer = answer;
    session.secondAnalysis = analysis;
    session.status = "COMPLETED";
  } else {
    session.firstAnswer = answer;
    session.firstAnalysis = analysis;
  }
  session.durationMs = elapsed > 0 ? elapsed : 0;
  session.updatedAt = new Date().toISOString();
  sessions[idx] = session;
  saveSessions(sessions);
  return { analysis, session };
}

// ---------------- 我的 / 报告 ----------------
export type MonogramColor = "ink" | "accent" | "bronze";

export interface ProfileData {
  nickname: string;
  avatarUrl: string;
  /** 字母头像（无微信头像时）的底色，让用户可“选择”。向后兼容：旧档案缺省为 ink */
  monogramColor: MonogramColor;
}

export function getProfile(): ProfileData {
  const p = store.getJSON<Partial<ProfileData>>(K_PROFILE) ?? {};
  return {
    nickname: p.nickname ?? "",
    avatarUrl: p.avatarUrl ?? "",
    monogramColor: (p.monogramColor as MonogramColor) ?? "ink",
  };
}
export function saveProfile(p: ProfileData): void {
  store.setJSON(K_PROFILE, p);
}

/** 知识点掌握分布（四态互斥，合计 = totalItems） */
export interface StatusDistribution {
  /** 新学：已曝光但未独立回忆（EXPOSED） */
  new: number;
  /** 学习中：借助提示回忆（RECALLED_WITH_HELP） */
  learning: number;
  /** 复习中：已独立回忆但当前有到期复习（RECALLED_INDEPENDENTLY 且 nextReviewAt<=now） */
  reviewing: number;
  /** 已掌握：已独立回忆且无到期复习 */
  mastered: number;
}

export interface MiniReport {
  totalItems: number;
  dueNow: number;
  streak: number;
  speakingCompleted: number;
  newThisWeek: number;
  /** 本周复习次数（REVIEW 事件） */
  reviewedThisWeek: number;
  /** 累计已独立回忆掌握的词数 */
  masteredCount: number;
  /** 本周活跃天数（周节奏中有活动的天） */
  daysActiveThisWeek: number;
  /** 最近掌握的几个词（用于“最近掌握”列表） */
  recentMastered: Array<{ term: string; meaning: string }>;
  /** 本周每日学习量（柱状图 + 本周每日打卡同源）；count = 当日 NEW+REVIEW 事件数 */
  weeklyActivity: DayActivityItem[];
  /** 本周目标词数（来自本端持久化 K_GOAL；与本周成就共享） */
  weeklyGoal: number;
  /** 上周同期学习总量（用于周环比 ▲%） */
  lastWeekTotal: number;
  /** 本周学习时长（秒）：NEW+REVIEW 事件 + 完成口语会话的 durationMs 之和 */
  studySecondsThisWeek: number;
  /** 上周同期学习时长（秒） */
  studySecondsLastWeek: number;
  /** 知识点掌握分布（四态） */
  statusDistribution: StatusDistribution;
  /** 复习正确率 0–100（REVIEW 事件中非 FAIL/SKIPPED 占比） */
  reviewCorrectRate: number;
  nextStep: NextStep;
}

/** 单日活动：hasActivity 由 count>0 推导 */
export interface DayActivityItem {
  key: string;
  label: string;
  hasActivity: boolean;
  isToday: boolean;
  count: number;
}

export function generateReport(): MiniReport {
  const states = getStates();
  const events = getEvents();
  const nowIso = new Date().toISOString();
  const dueNow = Object.values(states).filter((s) => s.nextReviewAt <= nowIso).length;
  const streak = computeStreak(events);
  const sessions = getSessions();
  const speakingCompleted = sessions.filter((s) => s.status === "COMPLETED").length;

  const newEvents = events.filter((e) => e.eventType === "NEW");
  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = new Set(
    newEvents.filter((e) => new Date(e.createdAt).getTime() >= weekAgo).map((e) => e.itemId),
  ).size;

  const reviewedThisWeek = events.filter(
    (e) => e.eventType === "REVIEW" && new Date(e.createdAt).getTime() >= weekAgo,
  ).length;
  const masteredCount = Object.values(states).filter(
    (s) => s.status === "RECALLED_INDEPENDENTLY",
  ).length;

  // 每日学习量（NEW+REVIEW 事件计数），柱状图与本周打卡同源
  const dayCounts = new Map<string, number>();
  for (const e of events) {
    if (e.eventType === "NEW" || e.eventType === "REVIEW") {
      const k = localDayKey(e.createdAt);
      dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
    }
  }
  const today = new Date();
  const weeklyActivity: DayActivityItem[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDayKey(d);
    const count = dayCounts.get(key) ?? 0;
    weeklyActivity.push({
      key,
      label: `周${["日", "一", "二", "三", "四", "五", "六"][d.getDay()]}`,
      hasActivity: count > 0,
      isToday: i === 0,
      count,
    });
  }
  const daysActiveThisWeek = weeklyActivity.filter((d) => d.hasActivity).length;

  // 上周同期总量（用于周/环比 ▲%）
  const twoWeeksAgo = Date.now() - 14 * 86400000;
  const lastWeekTotal = events.filter(
    (e) =>
      (e.eventType === "NEW" || e.eventType === "REVIEW") &&
      (() => {
        const t = new Date(e.createdAt).getTime();
        return t >= twoWeeksAgo && t < weekAgo;
      })(),
  ).length;
  const weeklyGoal = getWeeklyGoal();

  // 学习时长（秒）：本周 NEW+REVIEW 事件 durationMs + 完成口语会话 durationMs 之和
  const studySecondsThisWeek = Math.round(
    (events
      .filter((e) => (e.eventType === "NEW" || e.eventType === "REVIEW") && new Date(e.createdAt).getTime() >= weekAgo)
      .reduce((sum, e) => sum + (e.durationMs ?? 0), 0) +
      sessions
        .filter((s) => s.status === "COMPLETED" && new Date(s.updatedAt).getTime() >= weekAgo)
        .reduce((sum, s) => sum + (s.durationMs ?? 0), 0)) / 1000,
  );
  const studySecondsLastWeek = Math.round(
    (events
      .filter((e) => {
        const t = new Date(e.createdAt).getTime();
        return (e.eventType === "NEW" || e.eventType === "REVIEW") && t >= twoWeeksAgo && t < weekAgo;
      })
      .reduce((sum, e) => sum + (e.durationMs ?? 0), 0) +
      sessions
        .filter((s) => {
          const t = new Date(s.updatedAt).getTime();
          return t >= twoWeeksAgo && t < weekAgo;
        })
        .reduce((sum, s) => sum + (s.durationMs ?? 0), 0)) / 1000,
  );

  // 知识点掌握分布（四态互斥，合计 = totalItems）
  let sdNew = 0;
  let sdLearning = 0;
  let sdReviewing = 0;
  let sdMastered = 0;
  for (const s of Object.values(states)) {
    if (s.status === "EXPOSED") sdNew++;
    else if (s.status === "RECALLED_WITH_HELP") sdLearning++;
    else if (s.status === "RECALLED_INDEPENDENTLY") {
      if (s.nextReviewAt <= nowIso) sdReviewing++;
      else sdMastered++;
    } else sdNew++; // NEW 或其他归新学
  }
  const statusDistribution: StatusDistribution = {
    new: sdNew,
    learning: sdLearning,
    reviewing: sdReviewing,
    mastered: sdMastered,
  };

  // 复习正确率 0–100（本周 REVIEW 事件中非 FAIL/SKIPPED 占比）
  const reviewEvents = events.filter(
    (e) => e.eventType === "REVIEW" && new Date(e.createdAt).getTime() >= weekAgo,
  );
  const reviewCorrect =
    reviewEvents.filter((e) => e.correctness === "INDEPENDENT" || e.correctness === "HINTED").length;
  const reviewCorrectRate = reviewEvents.length > 0 ? Math.round((reviewCorrect / reviewEvents.length) * 100) : 0;


  const recentMastered = Object.values(states)
    .filter((s) => s.status === "RECALLED_INDEPENDENTLY")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((s) => {
      const seed = seedItems.find((x) => x.itemId === s.itemId);
      return { term: seed?.term ?? s.itemId, meaning: seed?.coreMeaning ?? "" };
    });

  const nextStep = buildNextStep({
    dueNow,
    topIssueCount: 0,
    speakingCompleted,
    totalItems: Object.keys(states).length,
  });

  return {
    totalItems: Object.keys(states).length,
    dueNow,
    streak,
    speakingCompleted,
    newThisWeek,
    reviewedThisWeek,
    masteredCount,
    daysActiveThisWeek,
    recentMastered,
    weeklyActivity,
    weeklyGoal,
    lastWeekTotal,
    studySecondsThisWeek,
    studySecondsLastWeek,
    statusDistribution,
    reviewCorrectRate,
    nextStep,
  };
}

/** 近 N 周学习概况，供「备考目标」页的「当前情况」展示与智能生成使用 */
export function getStudyHistory(weeks = 4): {
  avgWeeklyStudySeconds: number;
  learnedWords: number;
  masteredCount: number;
  streak: number;
} {
  const states = getStates();
  const events = getEvents();
  const sessions = getSessions();
  const totalItems = Object.keys(states).length;
  const masteredCount = Object.values(states).filter(
    (s) => s.status === "RECALLED_INDEPENDENTLY",
  ).length;
  const streak = computeStreak(events);
  const cutoff = Date.now() - weeks * 7 * 86400000;
  const secSum =
    events
      .filter(
        (e) =>
          (e.eventType === "NEW" || e.eventType === "REVIEW") &&
          new Date(e.createdAt).getTime() >= cutoff,
      )
      .reduce((s, e) => s + (e.durationMs ?? 0), 0) +
    sessions
      .filter((s) => s.status === "COMPLETED" && new Date(s.updatedAt).getTime() >= cutoff)
      .reduce((s, x) => s + (x.durationMs ?? 0), 0);
  const avgWeeklyStudySeconds = weeks > 0 ? Math.round(secSum / 1000 / weeks) : 0;
  return { avgWeeklyStudySeconds, learnedWords: totalItems, masteredCount, streak };
}

export function resetAll(): void {
  store.remove(K_STATES);
  store.remove(K_EVENTS);
  store.remove(K_SESSIONS);
  store.remove(K_ITEMS);
  store.remove(K_PROFILE);
}

// 供页面复用的类型
export { seedItems, speakingQuestions, seedToItem };
