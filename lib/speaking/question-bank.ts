/**
 * 口语题库加载
 */
import fs from "node:fs";
import path from "node:path";

import type { SpeakingPart, SpeakingQuestion } from "@/lib/speaking/types";

let catalog: SpeakingQuestion[] | null = null;

function loadQuestions(): SpeakingQuestion[] {
  if (catalog) return catalog;
  const filePath = path.resolve(process.cwd(), "data/seed/speaking-questions.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  catalog = JSON.parse(raw) as SpeakingQuestion[];
  return catalog;
}

export function getAllQuestions(): SpeakingQuestion[] {
  return loadQuestions();
}

export function getQuestionById(id: string): SpeakingQuestion | null {
  return loadQuestions().find((q) => q.questionId === id) ?? null;
}

export function getQuestionsByPart(part: SpeakingPart): SpeakingQuestion[] {
  return loadQuestions().filter((q) => q.part === part);
}

/** 随机选一题（指定 part + 可选 topic） */
export function pickQuestion(part?: SpeakingPart, topic?: string): SpeakingQuestion {
  let pool = loadQuestions();
  if (part) pool = pool.filter((q) => q.part === part);
  if (topic) {
    const topicLower = topic.toLowerCase();
    const filtered = pool.filter((q) => q.topic.toLowerCase().includes(topicLower));
    if (filtered.length > 0) pool = filtered;
  }
  // Deterministic: pick first available (no Math.random for predictability in demo)
  return pool[0]!;
}
