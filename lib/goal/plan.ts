/**
 * 智能备考目标生成（纯函数 · 客户端）
 * 与小程序 @ielts/core/src/plan.ts、安卓 StudyService.generateStudyPlan 单源对齐。
 * 算法一致：考试日期 + 目标分/当前自估分 + 每日时间 + 学习习惯 → 分阶段周计划。
 */

export type Feasibility = "comfortable" | "tight" | "atRisk";

export interface StudyPlanPhase {
  name: string;
  weeks: number;
  weeklyWords: number;
  focus: string;
}

export interface StudyPlanContext {
  examDate: string | null;
  targetBand: number;
  currentBand: number;
  dailyMinutes: number;
  history: {
    avgWeeklyStudySeconds: number;
    learnedWords: number;
    masteredCount: number;
    streak: number;
  };
}

export interface StudyPlan {
  weeksRemaining: number;
  recommendedWeeklyWords: number;
  dailyMinutes: number;
  phases: StudyPlanPhase[];
  feasibility: Feasibility;
  note: string;
  adaptive: boolean;
}

const MS_WEEK = 7 * 86400000;

export function generateStudyPlan(ctx: StudyPlanContext): StudyPlan {
  const { examDate, targetBand, currentBand, dailyMinutes, history } = ctx;
  const now = Date.now();

  const weeksRemaining = examDate
    ? Math.max(1, Math.ceil((new Date(examDate + "T00:00:00").getTime() - now) / MS_WEEK))
    : 12;

  const targetVocab = Math.max(500, Math.round((targetBand - currentBand) * 1000));
  const rawNeeded = Math.ceil(targetVocab / weeksRemaining);

  const historyDailyMin = history.avgWeeklyStudySeconds / 60 / 7;
  let adaptive = false;
  let effectiveDaily = dailyMinutes;
  if (historyDailyMin > 0 && historyDailyMin < dailyMinutes * 0.6) {
    effectiveDaily = Math.max(5, Math.round(historyDailyMin));
    adaptive = true;
  }

  const weeklyCap = Math.floor((effectiveDaily * 7) / 1.5);
  const recommended = Math.min(rawNeeded, weeklyCap);
  const clamped = Math.min(Math.max(recommended, 20), 400);

  const total = weeksRemaining;
  const baseWeeks = Math.max(1, Math.round(total * 0.4));
  const sprintWeeks = Math.max(1, Math.round(total * 0.4));
  const finalWeeks = Math.max(1, total - baseWeeks - sprintWeeks);
  const stopNewWeeks = examDate ? Math.min(2, finalWeeks) : 0;
  const finalNewWeeks = Math.max(0, finalWeeks - stopNewWeeks);
  const finalWeekly = finalNewWeeks > 0 ? Math.round(clamped * 0.6) : 0;

  const phases: StudyPlanPhase[] = [
    { name: "基础巩固", weeks: baseWeeks, weeklyWords: Math.round(clamped * 0.8), focus: "建立词汇底子，每天少量但稳定" },
    { name: "专项突破", weeks: sprintWeeks, weeklyWords: clamped, focus: "按薄弱项加量，冲词汇峰值" },
    { name: "考前冲刺", weeks: finalWeeks, weeklyWords: finalWeekly, focus: stopNewWeeks > 0 ? "停止加新词，只复习已学，稳住记忆" : "巩固已学，保持手感" },
  ];

  let feasibility: Feasibility;
  let note: string;
  if (rawNeeded <= weeklyCap * 0.8) {
    feasibility = "comfortable";
    note = `按你设定的 ${effectiveDaily} 分钟/天，考前能从容覆盖目标词汇。`;
  } else if (rawNeeded <= weeklyCap) {
    feasibility = "tight";
    note = `节奏偏紧，需稳定保持 ${effectiveDaily} 分钟/天才能覆盖目标词汇。`;
  } else {
    const extra = Math.max(5, Math.round((rawNeeded * 1.5) / 7 - effectiveDaily));
    feasibility = "atRisk";
    note = `按当前投入，考前估计只能覆盖约 ${Math.round((weeklyCap / rawNeeded) * 100)}% 的目标词汇。建议每天再加 ${extra} 分钟，或把目标分调低 0.5。`;
  }
  if (adaptive) {
    note = `按你近 4 周习惯（日均约 ${Math.round(historyDailyMin)} 分钟），已把每日时长调到 ${effectiveDaily} 分钟，更容易坚持。${note}`;
  }
  if (!examDate) {
    note = `未设定考试日期，已按默认 ${weeksRemaining} 周给出建议。设定考试日期后计划会更精准。`;
  }

  return { weeksRemaining, recommendedWeeklyWords: clamped, dailyMinutes: effectiveDaily, phases, feasibility, note, adaptive };
}
