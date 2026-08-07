/**
 * P1 学习领域类型
 */

export type ItemType = "WORD" | "PHRASE" | "CHUNK";

export type LearningStatus = "NEW" | "EXPOSED" | "RECALLED_WITH_HELP" | "RECALLED_INDEPENDENTLY";

export type TaskType = "MEANING_RECALL" | "PERSONAL_SENTENCE";

export type EventCorrectness = "FAIL" | "HINTED" | "INDEPENDENT" | "SKIPPED";

/** 本地词库条目（data/seed/ielts-learning-items.json） */
export interface SeedLearningItem {
  itemId: string;
  term: string;
  normalizedTerm: string;
  itemType: ItemType;
  phonetic: string;
  partOfSpeech: string;
  coreMeaning: string;
  usageContext: string;
  collocations: string[];
  exampleSentence: string;
  exampleTranslation: string;
  commonMistake: string;
  topicTags: string[];
  acceptedAnswers: string[];
  answerKeywords: string[];
}

/** 数据库 / Memory 中持久化的知识项 */
export interface LearningItem {
  id: string;
  itemType: ItemType;
  canonicalForm: string;
  normalizedTerm: string;
  contentJson: SeedLearningItem;
  topicTags: string[];
  createdAt: string;
}

/** 用户与知识项的关系状态 */
export interface UserItemState {
  userId: string;
  itemId: string;
  status: LearningStatus;
  recognitionLevel: number;
  recallLevel: number;
  applicationLevel: number;
  consecutiveCorrect: number;
  currentIntervalDays: number;
  nextReviewAt: string;
  updatedAt: string;
}

/** 学习事件 */
export interface LearningEvent {
  id: string;
  userId: string;
  itemId: string;
  eventType: "NEW" | "REVIEW";
  taskType: TaskType;
  answer: string | null;
  correctness: EventCorrectness;
  hintLevel: number;
  resultJson: Record<string, unknown>;
  clientEventId: string;
  traceId: string;
  createdAt: string;
}

/** 词卡 API 返回结构 */
export interface WordCardResponse {
  item: LearningItem;
  task: {
    taskType: TaskType;
    prompt: string;
    acceptedAnswerHint: string;
  };
  alreadyLearned: boolean;
  currentState: UserItemState | null;
}

/** 提交学习结果后的返回 */
export interface LearnSubmitResponse {
  eventId: string;
  correctness: EventCorrectness;
  status: LearningStatus;
  feedback: string;
  nextReviewAt: string;
  state: UserItemState;
}
