/**
 * 推荐下一任务
 * ------------------------------------------------------------
 * 基于聚合数据生成可行动的推荐。
 * 交接单 §7.4 / §3.4：结论必须基于真实事件，不编造。
 */
import type { AggregatedData } from "@/lib/report/aggregator";
import type { RecommendedTask } from "@/lib/report/types";

export function generateRecommendations(data: AggregatedData, now?: Date): RecommendedTask[] {
  const tasks: RecommendedTask[] = [];
  const currentTime = (now ?? new Date()).toISOString();

  // 1. 有到期复习 → 高优先
  const dueStates = data.states.filter(
    (s) => s.nextReviewAt <= currentTime,
  );
  if (dueStates.length > 0) {
    tasks.push({
      taskType: "REVIEW",
      reason: `有 ${dueStates.length} 个词条到期需要复习`,
      priority: "HIGH",
    });
  }

  // 2. 即将到期（24h 内）但未到期 → 中优先
  const soonDue = data.memory.dueSoon - dueStates.length;
  if (soonDue > 0) {
    tasks.push({
      taskType: "REVIEW",
      reason: `${soonDue} 个词条将在 24 小时内到期`,
      priority: "MEDIUM",
    });
  }

  // 3. 复习正确率低 → 建议加强复习
  if (data.review.totalReviews >= 3 && data.review.correctRate < 0.6) {
    tasks.push({
      taskType: "REVIEW",
      reason: `复习正确率 ${Math.round(data.review.correctRate * 100)}%，建议多练习已学词条`,
      priority: "HIGH",
    });
  }

  // 4. 口语重复问题 → 建议针对性练习
  const patterns = data.speakingObservations.filter((o) => o.isPattern);
  if (patterns.length > 0) {
    const top = patterns[0]!;
    tasks.push({
      taskType: "SPEAKING",
      reason: `口语「${top.dimension}」维度重复出现问题（${top.occurrenceCount} 次），建议针对性练习`,
      priority: "MEDIUM",
    });
  }

  // 5. 词汇量不足 → 学新词
  if (data.memory.totalItems < 10) {
    tasks.push({
      taskType: "LEARN_NEW",
      reason: `当前词库仅 ${data.memory.totalItems} 个词条，建议继续学习新词扩充词汇量`,
      priority: "MEDIUM",
    });
  }

  // 6. 如果没有任何推荐 → 鼓励继续
  if (tasks.length === 0) {
    tasks.push({
      taskType: "LEARN_NEW",
      reason: "当前状态良好，继续学习新词扩展词汇量",
      priority: "LOW",
    });
  }

  // Sort by priority
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return tasks;
}
