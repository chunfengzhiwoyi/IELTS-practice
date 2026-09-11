/**
 * 学习领域类型（小程序端复刻）
 */
export type ItemType = "WORD" | "PHRASE" | "CHUNK";
export type LearningStatus = "NEW" | "EXPOSED" | "RECALLED_WITH_HELP" | "RECALLED_INDEPENDENTLY";
export type TaskType = "MEANING_RECALL" | "PERSONAL_SENTENCE";
export type EventCorrectness = "FAIL" | "HINTED" | "INDEPENDENT" | "SKIPPED";

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
  ielts?: {
    skills?: Array<"speaking" | "writing" | "reading" | "listening">;
    contexts?: Array<"speaking-part1" | "speaking-part2" | "speaking-part3" | "writing-task1" | "writing-task2">;
    topics?: string[];
    lexicalFunctions?: string[];
    register?: "formal" | "neutral" | "informal";
    descriptorFocus?: string[];
  };
  generationMeta?: {
    knowledgeLayerVersion: string;
    knowledgeObjectIds: string[];
    promptVersion: string;
  };
}

export interface LearningItem {
  id: string;
  itemType: ItemType;
  canonicalForm: string;
  normalizedTerm: string;
  contentJson: SeedLearningItem;
  topicTags: string[];
  createdAt: string;
}

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
  /** 本次交互耗时（毫秒），向后兼容，缺省 0 */
  durationMs?: number;
}
