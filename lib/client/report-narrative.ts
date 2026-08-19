/**
 * 报告页叙事纯函数（无 React、无 DOM）。
 * 负责把数据翻译成「导师周信」式的陈述句与下一步建议。
 * 组件负责把 LedePart[] 渲染成带 <em> 的衬线句。
 */

export interface LedePart {
  t: string;
  em?: boolean;
}

export interface LedeInput {
  gapDays: number; // 距上次学习活动隔了几天
  newThisWeek: number; // 本周新收表达（去重）
  newLastWeek: number; // 前七天新收表达
  totalItems: number; // 词库总量
  speakingCompleted: number; // 本周完成口语次数
  accThis: number | null; // 本周复习正确率
  accLast: number | null; // 前七天复习正确率
  topIssueCount: number; // 口语高频问题次数
  topIssueLabel: string; // 口语高频问题中文标签
}

export function buildLede(i: LedeInput): LedePart[] {
  if (i.gapDays >= 3) {
    return [
      { t: "隔了 " },
      { t: String(i.gapDays), em: true },
      { t: " 天，你回来了。先从手边到期的词开始就好。" },
    ];
  }
  if (i.newThisWeek > 0 && i.newThisWeek > i.newLastWeek) {
    return [
      { t: "这一周，你把 " },
      { t: String(i.newThisWeek), em: true },
      { t: " 个表达从「见过」带到了「想得起来」。" },
    ];
  }
  if (i.totalItems >= 10 && i.speakingCompleted === 0) {
    return [
      { t: "你的词库在长，" },
      { t: "但它们还没走进你的口语", em: true },
      { t: "。" },
    ];
  }
  if (
    i.accThis != null &&
    i.accLast != null &&
    i.accThis > i.accLast
  ) {
    return [
      { t: "同样的词，这周你 " },
      { t: "更快想起来了", em: true },
      { t: "。" },
    ];
  }
  if (i.topIssueCount >= 2) {
    return [
      { t: "「" },
      { t: i.topIssueLabel, em: true },
      { t: `」已经出现 ${i.topIssueCount} 次——它值得被单独练一次。` },
    ];
  }
  return [
    { t: "这是第一页。你已经收下了 " },
    { t: String(i.totalItems), em: true },
    { t: " 个表达。" },
  ];
}

export interface MilestoneInput {
  totalItems: number;
  reviewTotal: number;
  streak: number;
  partsCovered: string[];
  hasRecentActivity: boolean;
}

export interface Milestone {
  text: string;
  numeral: string;
  sub: string;
}

/** 仅在近 7 天有学习活动、且跨过某阈值时才返回（一处成就时刻）。 */
export function detectMilestone(i: MilestoneInput): Milestone | null {
  if (!i.hasRecentActivity) return null;

  // 优先级从高到低，只取最高一条
  if (i.totalItems >= 100)
    return { text: "你的词库刚满 ", numeral: "100", sub: " 条。" };
  if (i.reviewTotal >= 100)
    return { text: "累计复习满 ", numeral: "100", sub: " 次。" };
  if (i.partsCovered.length >= 3)
    return { text: "你第一次把三个 Part 都走完了。", numeral: "", sub: "" };
  if (i.totalItems >= 50)
    return { text: "你的词库刚满 ", numeral: "50", sub: " 条。" };
  if (i.streak >= 7)
    return { text: "连续 ", numeral: "7", sub: " 天，你一次没断。" };
  if (i.totalItems >= 25)
    return { text: "你的词库刚满 ", numeral: "25", sub: " 条。" };

  return null;
}

export interface NextStepInput {
  dueNow: number;
  topIssueCount: number;
  speakingCompleted: number;
  totalItems: number;
}

export interface NextStep {
  title: string;
  sub: string;
  href: string;
  cta: string;
  secondary: Array<{ text: string; href: string }>;
}

export function buildNextStep(i: NextStepInput): NextStep {
  const learn: NextStep["secondary"] = [
    { text: "学一个新表达", href: "/learn" },
    { text: "练一题口语", href: "/speaking" },
  ];
  const review: NextStep["secondary"] = [
    { text: "学一个新表达", href: "/learn" },
    { text: "练一题口语", href: "/speaking" },
  ];

  if (i.dueNow > 0) {
    const minutes = Math.max(1, Math.ceil(i.dueNow / 2));
    return {
      title: `先把 ${i.dueNow} 个到期的词过一遍`,
      sub: `大约 ${minutes} 分钟。`,
      href: "/review",
      cta: "开始复习 →",
      secondary: review,
    };
  }

  if (i.topIssueCount >= 2 || (i.speakingCompleted === 0 && i.totalItems >= 10)) {
    return {
      title: "练一次口语",
      sub: "把词库里的表达，真正说出口。",
      href: "/speaking",
      cta: "去练习 →",
      secondary: learn,
    };
  }

  return {
    title: "学一个新表达",
    sub: "扩展词汇量，保持学习节奏。",
    href: "/learn",
    cta: "去学习 →",
    secondary: review,
  };
}
