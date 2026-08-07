/**
 * 报告数据聚合器
 * ------------------------------------------------------------
 * 从 LearningRepository 和 SpeakingRepository 读取真实数据，
 * 生成可追溯的报告结构。交接单 §3.4：所有结论必须能反向追溯到真实事件。
 */
import type { LearningRepository } from "@/lib/learning/repository";
import type { LearningEvent, UserItemState } from "@/lib/learning/types";
import type { SpeakingRepository } from "@/lib/speaking/repository";
import type { SpeakingSession } from "@/lib/speaking/types";
import type {
  MemorySummary,
  ReportPeriod,
  ReviewStats,
  SpeakingObservation,
} from "@/lib/report/types";

export interface AggregateInput {
  userId: string;
  period: ReportPeriod;
  now?: Date;
}

export interface AggregatedData {
  memory: MemorySummary;
  review: ReviewStats;
  speakingObservations: SpeakingObservation[];
  events: LearningEvent[];
  states: UserItemState[];
  sessions: SpeakingSession[];
}

function periodToMs(period: ReportPeriod): number {
  return period === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}

export async function aggregateReportData(
  learningRepo: LearningRepository,
  speakingRepo: SpeakingRepository,
  input: AggregateInput,
): Promise<AggregatedData> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - periodToMs(input.period)).toISOString();
  const until = now.toISOString();

  // Fetch all data
  const [states, events, sessions] = await Promise.all([
    learningRepo.getAllUserItemStates(input.userId),
    learningRepo.getUserEventsInRange(input.userId, since, until),
    speakingRepo.getRecentSessions(input.userId, 50),
  ]);

  // Filter sessions to period
  const periodSessions = sessions.filter((s) => s.createdAt >= since && s.createdAt <= until);

  // Memory summary
  const memory = buildMemorySummary(states, events, now);

  // Review stats
  const review = buildReviewStats(events);

  // Speaking observations
  const speakingObservations = buildSpeakingObservations(periodSessions);

  return {
    memory,
    review,
    speakingObservations,
    events,
    states,
    sessions: periodSessions,
  };
}

function buildMemorySummary(
  states: UserItemState[],
  events: LearningEvent[],
  now: Date,
): MemorySummary {
  const totalItems = states.length;
  const newItems = events.filter((e) => e.eventType === "NEW").length;
  const reviewedCount = events.filter((e) => e.eventType === "REVIEW").length;

  // Due within 24h
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const dueSoon = states.filter((s) => s.nextReviewAt <= in24h).length;

  const statusDistribution = {
    NEW: 0,
    EXPOSED: 0,
    RECALLED_WITH_HELP: 0,
    RECALLED_INDEPENDENTLY: 0,
  };
  for (const s of states) {
    if (s.status in statusDistribution) {
      statusDistribution[s.status as keyof typeof statusDistribution]++;
    }
  }

  return { totalItems, newItems, reviewedCount, dueSoon, statusDistribution };
}

function buildReviewStats(events: LearningEvent[]): ReviewStats {
  const reviewEvents = events.filter((e) => e.eventType === "REVIEW");
  const totalReviews = reviewEvents.length;
  let correctIndependent = 0;
  let correctWithHint = 0;
  let incorrect = 0;
  let skipped = 0;

  for (const e of reviewEvents) {
    switch (e.correctness) {
      case "INDEPENDENT":
        correctIndependent++;
        break;
      case "HINTED":
        correctWithHint++;
        break;
      case "FAIL":
        incorrect++;
        break;
      case "SKIPPED":
        skipped++;
        break;
    }
  }

  const correctRate =
    totalReviews > 0 ? (correctIndependent + correctWithHint) / totalReviews : 0;

  return { totalReviews, correctIndependent, correctWithHint, incorrect, skipped, correctRate };
}

function buildSpeakingObservations(sessions: SpeakingSession[]): SpeakingObservation[] {
  // Count dimensions across all sessions' first analyses
  const dimMap = new Map<
    string,
    { count: number; latestDesc: string; latestSessionId: string }
  >();

  for (const s of sessions) {
    const analysis = s.firstAnalysis;
    if (!analysis) continue;

    const dim = analysis.mainIssue.dimension;
    const existing = dimMap.get(dim);
    if (existing) {
      existing.count++;
      existing.latestDesc = analysis.mainIssue.description;
      existing.latestSessionId = s.id;
    } else {
      dimMap.set(dim, {
        count: 1,
        latestDesc: analysis.mainIssue.description,
        latestSessionId: s.id,
      });
    }
  }

  const observations: SpeakingObservation[] = [];
  for (const [dimension, data] of dimMap) {
    observations.push({
      dimension,
      occurrenceCount: data.count,
      isPattern: data.count >= 2,
      latestDescription: data.latestDesc,
      latestSessionId: data.latestSessionId,
    });
  }

  // Sort by occurrence descending
  observations.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  return observations;
}
