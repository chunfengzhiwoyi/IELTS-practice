export interface NextStepInput {
  dueNow: number;
  topIssueCount: number;
  speakingCompleted: number;
  totalItems: number;
}

export interface NextStep {
  title: string;
  body: string;
}

/** 编辑式「下一步」建议（克制、无百分比、无火焰） */
export function buildNextStep(input: NextStepInput): NextStep {
  const { dueNow, topIssueCount, speakingCompleted, totalItems } = input;
  if (dueNow > 0) {
    return {
      title: "先清掉今天的复习",
      body: `有 ${dueNow} 个词到了复习时点。一次只做一组，约 ${Math.ceil(dueNow * 0.5)} 分钟。`,
    };
  }
  if (totalItems === 0) {
    return { title: "从第一个词开始", body: "今天先收一个表达，主动回想比多看更有效。" };
  }
  if (speakingCompleted === 0) {
    return { title: "练一段口语", body: "本周还没开口。挑一道题，写一段，看一份克制分析。" };
  }
  if (topIssueCount > 0) {
    return { title: "针对一个薄弱点", body: "最近口语反复出现同一类问题，下次作答时有意识地带出来。" };
  }
  return { title: "保持节奏", body: "今天没有紧急任务，按自己的步调学一个新表达即可。" };
}
