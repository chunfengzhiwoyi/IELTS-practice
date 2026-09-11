/**
 * 智能备考目标生成（纯函数 · client-only）
 * 依据：考试日期 + 目标分/当前自估分 + 每日可投入时间 + 学习习惯，输出分阶段周计划。
 * 单源逻辑：小程序(@ielts/core) / 安卓(Kotlin 镜像) / Web(lib/goal/plan.ts 镜像) 均对齐本算法。
 */

export type Feasibility = "comfortable" | "tight" | "atRisk";

export interface StudyPlanPhase {
  name: string;
  weeks: number;
  /** 该阶段每周新词数（冲刺阶段递减到 0 = 只复习） */
  weeklyWords: number;
  focus: string;
}

export interface StudyPlanContext {
  /** 考试日期 ISO yyyy-mm-dd；未设定为 null */
  examDate: string | null;
  /** 目标总分（如 6.5） */
  targetBand: number;
  /** 当前自估分（4.0–7.0） */
  currentBand: number;
  /** 每日可投入学习分钟 */
  dailyMinutes: number;
  history: {
    /** 近 N 周平均每周学习秒数 */
    avgWeeklyStudySeconds: number;
    learnedWords: number;
    masteredCount: number;
    streak: number;
  };
}

export interface StudyPlan {
  weeksRemaining: number;
  recommendedWeeklyWords: number;
  /** 实际采用的每日分钟（可能因习惯自适应下调） */
  dailyMinutes: number;
  phases: StudyPlanPhase[];
  feasibility: Feasibility;
  /** 一句人话说明 */
  note: string;
  /** 是否按学习习惯自适应调整过 */
  adaptive: boolean;
}

const MS_WEEK = 7 * 86400000;

export function generateStudyPlan(ctx: StudyPlanContext): StudyPlan {
  const { examDate, targetBand, currentBand, dailyMinutes, history } = ctx;
  const now = Date.now();

  const weeksRemaining = examDate
    ? Math.max(1, Math.ceil((new Date(examDate + "T00:00:00").getTime() - now) / MS_WEEK))
    : 12;

  // 目标词汇缺口：每 0.5 分 ≈ 约 1000 学术词，下限 500
  const targetVocab = Math.max(500, Math.round((targetBand - currentBand) * 1000));
  const rawNeeded = Math.ceil(targetVocab / weeksRemaining);

  // 自适应：历史日均显著低于设定 → 按历史均值下调，更易坚持
  const historyDailyMin = history.avgWeeklyStudySeconds / 60 / 7;
  let adaptive = false;
  let effectiveDaily = dailyMinutes;
  if (historyDailyMin > 0 && historyDailyMin < dailyMinutes * 0.6) {
    effectiveDaily = Math.max(5, Math.round(historyDailyMin));
    adaptive = true;
  }

  // 可行上限：约 1.5 分钟/词（含复习）
  const weeklyCap = Math.floor((effectiveDaily * 7) / 1.5);
  const recommended = Math.min(rawNeeded, weeklyCap);
  const clamped = Math.min(Math.max(recommended, 20), 400);

  // 三阶段：基础(前40%) → 专项(中40%) → 冲刺(后20%，考前停新词)
  const total = weeksRemaining;
  const baseWeeks = Math.max(1, Math.round(total * 0.4));
  const sprintWeeks = Math.max(1, Math.round(total * 0.4));
  const finalWeeks = Math.max(1, total - baseWeeks - sprintWeeks);
  const stopNewWeeks = examDate ? Math.min(2, finalWeeks) : 0;
  const finalNewWeeks = Math.max(0, finalWeeks - stopNewWeeks);
  const finalWeekly = finalNewWeeks > 0 ? Math.round(clamped * 0.6) : 0;

  const phases: StudyPlanPhase[] = [
    {
      name: "基础巩固",
      weeks: baseWeeks,
      weeklyWords: Math.round(clamped * 0.8),
      focus: "建立词汇底子，每天少量但稳定",
    },
    {
      name: "专项突破",
      weeks: sprintWeeks,
      weeklyWords: clamped,
      focus: "按薄弱项加量，冲词汇峰值",
    },
    {
      name: "考前冲刺",
      weeks: finalWeeks,
      weeklyWords: finalWeekly,
      focus: stopNewWeeks > 0 ? "停止加新词，只复习已学，稳住记忆" : "巩固已学，保持手感",
    },
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

  return {
    weeksRemaining,
    recommendedWeeklyWords: clamped,
    dailyMinutes: effectiveDaily,
    phases,
    feasibility,
    note,
    adaptive,
  };
}
