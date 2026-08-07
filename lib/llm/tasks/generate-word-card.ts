/**
 * LLM Task: 生成词卡（seed 未命中时使用）
 */
import { z } from "zod";

import { callLlmStructured } from "@/lib/llm/structured-output";
import type { SeedLearningItem } from "@/lib/learning/types";
import { normalizeTerm } from "@/lib/learning/seed-catalog";

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
});

const JSON_EXAMPLE = `{
  "term": "resilient",
  "normalizedTerm": "resilient",
  "itemType": "WORD",
  "phonetic": "/rɪˈzɪl.i.ənt/",
  "partOfSpeech": "adjective",
  "coreMeaning": "有韧性的；恢复力强的",
  "usageContext": "描述人或系统面对困难后的恢复能力",
  "collocations": ["resilient economy", "emotionally resilient", "resilient community"],
  "exampleSentence": "Children are often more resilient than adults think.",
  "exampleTranslation": "孩子往往比成年人想象的更有韧性。",
  "commonMistake": "不要和 resistant（抵抗的）混淆。resilient 强调恢复，resistant 强调抵抗。",
  "topicTags": ["psychology", "ielts-part3"],
  "acceptedAnswers": ["有韧性的", "恢复力强的", "有弹性的"],
  "answerKeywords": ["韧性", "恢复"]
}`;

export async function generateWordCardWithLlm(
  term: string,
  traceId: string,
): Promise<SeedLearningItem> {
  const result = await callLlmStructured({
    tier: "main",
    messages: [
      {
        role: "system",
        content: `你是一个雅思英语学习词卡生成器。用户输入一个英文单词、短语或语块，你需要生成结构化词卡。
要求：
- coreMeaning 用中文
- exampleSentence 用英文，exampleTranslation 用中文
- acceptedAnswers 包含中文含义的多种表述（至少 2 个）
- answerKeywords 包含判断正确性的中文关键词（2-3 个）
- itemType: 单个词用 WORD，固定搭配用 PHRASE，多词语块用 CHUNK
- topicTags 用英文小写

只输出 JSON，不要其他内容。`,
      },
      {
        role: "user",
        content: `请为以下词条生成学习词卡：${term}`,
      },
    ],
    schema: WordCardSchema,
    schemaName: "WordCard",
    jsonExample: JSON_EXAMPLE,
    traceId,
    temperature: 0.3,
  });

  const data = result.data;
  return {
    itemId: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    term: data.term || term,
    normalizedTerm: normalizeTerm(data.normalizedTerm || term),
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
  };
}
