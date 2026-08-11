/**
 * LLM Task: 生成词卡（seed 未命中时使用）
 * Knowledge Layer V1：检索相关知识注入 system prompt。
 */
import { z } from "zod";

import { callLlmStructured } from "@/lib/llm/structured-output";
import type { SeedLearningItem } from "@/lib/learning/types";
import { normalizeTerm, stableItemId } from "@/lib/learning/item-id";
import { retrieveKnowledge } from "@/lib/knowledge/retrieval";
import type { ExamContext, IeltsItemMetadata, GenerationMeta } from "@/lib/knowledge/types";

const PROMPT_VERSION = "v1.1-knowledge-layer";

const WordCardSchema = z.object({
  term: z.string(),
  normalizedTerm: z.string(),
  itemType: z.enum(["WORD", "PHRASE", "CHUNK"]),
  phonetic: z.string(),
  partOfSpeech: z.string(),
  coreMeaning: z.string(),
  usageContext: z.string(),
  collocations: z.array(z.string()),
  exampleSentence: z.string(),
  exampleTranslation: z.string(),
  commonMistake: z.string(),
  topicTags: z.array(z.string()),
  acceptedAnswers: z.array(z.string()),
  answerKeywords: z.array(z.string()),
  // IELTS metadata (optional, LLM may or may not produce)
  ielts: z.object({
    skills: z.array(z.string()).optional(),
    contexts: z.array(z.string()).optional(),
    topics: z.array(z.string()).optional(),
    register: z.enum(["formal", "neutral", "informal"]).optional(),
    descriptorFocus: z.array(z.string()).optional(),
  }).optional(),
});

const JSON_EXAMPLE = `{
  "term": "mitigate",
  "normalizedTerm": "mitigate",
  "itemType": "WORD",
  "phonetic": "/ˈmɪt.ɪ.ɡeɪt/",
  "partOfSpeech": "verb",
  "coreMeaning": "减轻；缓和（不良影响）",
  "usageContext": "在 IELTS Writing Task 2 讨论环境问题或社会问题的解决方案时，用于表达'减轻负面影响'",
  "collocations": ["mitigate the effects of", "mitigate climate change", "mitigate risks"],
  "exampleSentence": "Governments should take immediate action to mitigate the effects of climate change.",
  "exampleTranslation": "政府应该立即采取行动来减轻气候变化的影响。",
  "commonMistake": "mitigate 是减轻/缓和，不是消除。不能用 mitigate 替代 eliminate 或 solve。可替换 reduce/lessen/alleviate。",
  "topicTags": ["environment", "society"],
  "acceptedAnswers": ["减轻", "缓和", "减轻；缓和"],
  "answerKeywords": ["减轻", "缓和"],
  "ielts": {
    "skills": ["writing", "speaking"],
    "contexts": ["writing-task2", "speaking-part3"],
    "topics": ["environment", "society"],
    "register": "formal",
    "descriptorFocus": ["lexical-resource"]
  }
}`;

const BASE_SYSTEM_PROMPT = `你是一个 IELTS 英语学习词卡生成器。用户输入一个英文单词、短语或语块，你需要生成结构化词卡。

基本要求：
- coreMeaning 用中文
- exampleSentence 用英文，exampleTranslation 用中文
- acceptedAnswers 包含中文含义的多种表述（至少 2 个）
- answerKeywords 包含判断正确性的中文关键词（2-3 个）
- itemType: 单个词用 WORD，固定搭配用 PHRASE，多词语块用 CHUNK
- topicTags 用英文小写
- usageContext 必须说明该词在 IELTS 考试中的具体使用场景
- collocations 应提供 3-5 个在 IELTS 写作/口语中真实常见的搭配
- commonMistake 应包含可替换的同义表达建议

IELTS metadata（ielts 字段）：
- skills: 适用技能（speaking/writing/reading/listening）
- contexts: 适用语境（speaking-part1/part2/part3, writing-task1/task2）
- topics: 所属话题分类
- register: 语域（formal/neutral/informal）
- descriptorFocus: 关联评分标准（lexical-resource/grammatical-range/coherence-cohesion 等）

只输出 JSON，不要任何其他内容。`;

export interface GenerateWordCardOptions {
  context?: ExamContext;
  /** 设为 true 跳过 knowledge retrieval（对照测试用） */
  skipKnowledge?: boolean;
}

export async function generateWordCardWithLlm(
  term: string,
  traceId: string,
  options?: GenerateWordCardOptions,
): Promise<SeedLearningItem> {
  const normalized = normalizeTerm(term);
  const context = options?.context ?? "general";
  const skipKnowledge = options?.skipKnowledge ?? false;

  // Knowledge Retrieval
  let knowledgeObjectIds: string[] = [];
  let knowledgeContext: string | null = null;

  if (!skipKnowledge) {
    const retrieval = retrieveKnowledge({ term: normalized, currentContext: context });
    knowledgeObjectIds = retrieval.knowledgeObjectIds;
    knowledgeContext = retrieval.promptContext;
  }

  // Build system prompt
  let systemPrompt = BASE_SYSTEM_PROMPT;
  if (knowledgeContext) {
    systemPrompt += `\n\n--- IELTS 教学知识（生成本词卡时请参考） ---\n${knowledgeContext}\n--- 知识结束 ---`;
  }

  const result = await callLlmStructured({
    tier: "main",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请为以下词条生成学习词卡：${term}` },
    ],
    schema: WordCardSchema,
    schemaName: "WordCard",
    jsonExample: JSON_EXAMPLE,
    traceId,
    temperature: 0.3,
  });

  const data = result.data;
  const finalNormalized = normalizeTerm(data.normalizedTerm || term);

  // Build ielts metadata
  const ielts: IeltsItemMetadata | undefined = data.ielts
    ? {
        skills: data.ielts.skills as IeltsItemMetadata["skills"],
        contexts: data.ielts.contexts as IeltsItemMetadata["contexts"],
        topics: data.ielts.topics,
        register: data.ielts.register,
        descriptorFocus: data.ielts.descriptorFocus as IeltsItemMetadata["descriptorFocus"],
      }
    : undefined;

  // Build generation meta
  const generationMeta: GenerationMeta = {
    knowledgeLayerVersion: "v1",
    knowledgeObjectIds,
    promptVersion: PROMPT_VERSION,
  };

  return {
    itemId: stableItemId(finalNormalized),
    term: data.term || term,
    normalizedTerm: finalNormalized,
    itemType: data.itemType,
    phonetic: data.phonetic,
    partOfSpeech: data.partOfSpeech,
    coreMeaning: data.coreMeaning,
    usageContext: data.usageContext,
    collocations: data.collocations,
    exampleSentence: data.exampleSentence,
    exampleTranslation: data.exampleTranslation,
    commonMistake: data.commonMistake,
    topicTags: data.topicTags,
    acceptedAnswers: data.acceptedAnswers,
    answerKeywords: data.answerKeywords,
    ielts,
    generationMeta,
  };
}
