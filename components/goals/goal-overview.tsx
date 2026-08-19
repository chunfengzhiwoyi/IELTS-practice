"use client";

import Link from "next/link";
import { getGoalProfile, getStudyHistory } from "@/lib/goal";
import { generateStudyPlan, type StudyPlan } from "@/lib/goal/plan";

const FEAS_LABEL: Record<StudyPlan["feasibility"], string> = {
  comfortable: "从容",
  tight: "偏紧",
  atRisk: "有风险",
};

/**
 * 报告页顶部的「备考目标」概览卡：有考试日期时展示倒计时 + 阶段进度 + 可行性，
 * 否则引导去 /goals 设定。整卡可点，进入目标页。
 */
export function GoalOverview() {
  const p = getGoalProfile();
  const hasGoal = !!p.examDate;

  const plan = hasGoal
    ? generateStudyPlan({
        examDate: p.examDate,
        targetBand: p.targetBand,
        currentBand: p.currentBand,
        dailyMinutes: p.dailyMinutes,
        history: getStudyHistory(4),
      })
    : null;
  const weeksUntil = plan ? plan.weeksRemaining : null;

  let curPhase = 0;
  let elapsedWeeks = 0;
  if (plan && weeksUntil !== null) {
    const planned = p.plannedWeeks ?? plan.weeksRemaining;
    if (p.setAt) {
      elapsedWeeks = Math.max(
        0,
        Math.round((Date.now() - new Date(p.setAt).getTime()) / (7 * 86400000)),
      );
    }
    elapsedWeeks = Math.min(elapsedWeeks, planned);
    let acc = 0;
    const phases = plan.phases;
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (!ph) break;
      const frac = ph.weeks / plan.weeksRemaining; // 阶段占比，稳定
      const bound = acc + frac * planned;
      if (elapsedWeeks < bound) {
        curPhase = i;
        break;
      }
      acc = bound;
    }
  }

  if (!hasGoal || !plan) {
    return (
      <Link href="/goals" className="goal-overview goal-overview--empty">
        <span className="goal-overview__kicker">备考目标</span>
        <span className="goal-overview__cta">尚未设定 · 去设定 ›</span>
      </Link>
    );
  }

  return (
    <Link href="/goals" className="goal-overview">
      <div className="goal-overview__head">
        <span className="goal-overview__kicker">备考目标</span>
        <span className="goal-overview__edit">查看 / 调整 ›</span>
      </div>
      <p className="goal-overview__t">
        距考试 <span className="b">{weeksUntil}</span> 周 · 每周 {p.weeklyWordTarget} 词
      </p>
      {p.setAt && elapsedWeeks > 0 && (
        <p className="goal-overview__sub">已坚持 {elapsedWeeks} 周</p>
      )}
      <span className={"goal-overview__pct goal-overview__pct--" + plan.feasibility}>
        {FEAS_LABEL[plan.feasibility]}
      </span>
      <div className="goal-overview__phases">
        {plan.phases.map((ph, i) => (
          <span
            key={ph.name}
            className={"goal-overview__phase" + (i === curPhase ? " goal-overview__phase--on" : "")}
          >
            {ph.name}
          </span>
        ))}
      </div>
    </Link>
  );
}
