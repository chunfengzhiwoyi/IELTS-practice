"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGoalProfile,
  saveGoalProfile,
  getStudyHistory,
  type GoalProfile,
} from "@/lib/goal";
import {
  generateStudyPlan,
  type StudyPlan,
} from "@/lib/goal/plan";

const BAND_PRESETS = [6.0, 6.5, 7.0, 7.5];
const MIN_PRESETS: { min: number; note: string }[] = [
  { min: 5, note: "纯打卡，太忙也能坚持" },
  { min: 15, note: "通勤一段，推荐起点" },
  { min: 30, note: "日常节奏" },
  { min: 60, note: "留出整块时间" },
];

const FEAS_LABEL: Record<StudyPlan["feasibility"], string> = {
  comfortable: "从容",
  tight: "偏紧",
  atRisk: "有风险",
};

export function GoalPage() {
  const router = useRouter();
  const [examDate, setExamDate] = useState<string | null>(null);
  const [targetBand, setTargetBand] = useState<number>(6.5);
  const [currentBand, setCurrentBand] = useState<number>(5.0);
  const [dailyMinutes, setDailyMinutes] = useState<number>(30);
  const [target, setTarget] = useState<number>(200);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [hist, setHist] = useState({ avgWeeklyStudySeconds: 0, learnedWords: 0, masteredCount: 0, streak: 0 });

  useEffect(() => {
    const p: GoalProfile = getGoalProfile();
    setExamDate(p.examDate);
    setTargetBand(p.targetBand);
    setCurrentBand(p.currentBand);
    setDailyMinutes(p.dailyMinutes);
    setTarget(p.weeklyWordTarget);
    setHist(getStudyHistory(4));
  }, []);

  const learned = hist.learnedWords;
  const masteryPct = learned > 0 ? Math.round((hist.masteredCount / learned) * 100) : 0;
  const weeksUntil = examDate
    ? Math.max(1, Math.ceil((new Date(examDate + "T00:00:00").getTime() - Date.now()) / (7 * 86400000)))
    : null;
  const weeklyCap = Math.floor((dailyMinutes * 7) / 1.5);
  const customFeasible = target <= weeklyCap;

  const generate = () => {
    setPlan(
      generateStudyPlan({
        examDate,
        targetBand,
        currentBand,
        dailyMinutes,
        history: hist,
      }),
    );
  };
  const adopt = () => {
    if (!plan) return;
    setTarget(plan.recommendedWeeklyWords);
    setDailyMinutes(plan.dailyMinutes);
  };
  const save = () => {
    saveGoalProfile({
      examDate,
      targetBand,
      currentBand,
      dailyMinutes,
      weeklyWordTarget: Math.max(1, Math.round(target)),
      // setAt / plannedWeeks 由 saveGoalProfile 自动补全与保留，无需前端传入
      setAt: null,
      plannedWeeks: null,
    });
    router.push("/report");
  };

  return (
    <main className="subpage">
      <header className="subhead">
        <h1 className="subhead__title">备考目标</h1>
        <p className="subhead__desc">按考试日与当前情况，生成可坚持的周计划</p>
      </header>

      {/* 1. 备考背景 */}
      <section className="panel">
        <h2 className="panel__title">备考背景</h2>
        <div className="goal-field">
          <label className="goal-field__k">考试日期</label>
          <input
            type="date"
            className="goal-input"
            value={examDate ?? ""}
            min="2026-01-01"
            max="2032-12-31"
            onChange={(e) => setExamDate(e.target.value || null)}
          />
          {weeksUntil !== null && <span className="goal-inline-note">距今约 {weeksUntil} 周</span>}
        </div>

        <div className="goal-field">
          <label className="goal-field__k">目标总分</label>
          <div className="goal-pills">
            {BAND_PRESETS.map((b) => (
              <button
                key={b}
                className={"goal-pill" + (targetBand === b ? " goal-pill--on" : "")}
                onClick={() => setTargetBand(b)}
              >
                {b.toFixed(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="goal-field">
          <label className="goal-field__k">
            当前自估分 <span className="goal-field__val">{currentBand.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min={4}
            max={7}
            step={0.5}
            value={currentBand}
            onChange={(e) => setCurrentBand(parseFloat(e.target.value))}
            className="goal-range"
          />
          <span className="goal-inline-note">凭感觉选即可，用于估算词汇缺口</span>
        </div>

        <div className="goal-field">
          <label className="goal-field__k">每日可投入时间</label>
          <div className="goal-pills">
            {MIN_PRESETS.map((m) => (
              <button
                key={m.min}
                className={"goal-pill goal-pill--wide" + (dailyMinutes === m.min ? " goal-pill--on" : "")}
                onClick={() => setDailyMinutes(m.min)}
              >
                <span className="goal-pill__t">{m.min} 分钟</span>
                <span className="goal-pill__n">{m.note}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. 当前情况 */}
      <section className="panel">
        <h2 className="panel__title">当前情况</h2>
        <div className="goal-stats">
          <div className="goal-stat">
            <span className="goal-stat__n">{learned}</span>
            <span className="goal-stat__l">已学词数</span>
          </div>
          <div className="goal-stat">
            <span className="goal-stat__n">{masteryPct}%</span>
            <span className="goal-stat__l">掌握率</span>
          </div>
          <div className="goal-stat">
            <span className="goal-stat__n">{hist.streak}</span>
            <span className="goal-stat__l">连续学习(天)</span>
          </div>
        </div>
      </section>

      {/* 3. 智能建议 */}
      <section className="panel">
        <h2 className="panel__title">智能建议</h2>
        <button className="btn btn--primary goal-gen" onClick={generate}>
          生成我的计划
        </button>
        {plan && (
          <div className="goal-plan">
            <div className="goal-plan__head">
              <span className="goal-plan__big">{plan.recommendedWeeklyWords}</span>
              <span className="goal-plan__bigu">词 / 周</span>
              <span className={"goal-plan__feas goal-plan__feas--" + plan.feasibility}>
                {FEAS_LABEL[plan.feasibility]}
              </span>
            </div>
            <p className="goal-plan__sub">
              距考试约 {plan.weeksRemaining} 周 · 建议每日 {plan.dailyMinutes} 分钟
            </p>
            <div className="goal-phase">
              {plan.phases.map((ph) => (
                <div className="goal-phase__seg" key={ph.name} style={{ flexGrow: ph.weeks }}>
                  <span className="goal-phase__bar" />
                  <span className="goal-phase__name">{ph.name}</span>
                  <span className="goal-phase__w">{ph.weeks} 周</span>
                  <span className="goal-phase__c">{ph.weeklyWords > 0 ? `${ph.weeklyWords} 词/周` : "只复习"}</span>
                </div>
              ))}
            </div>
            <p className="note note--bronze">{plan.note}</p>
            {plan.adaptive && <span className="pill pill--accent">已按你的习惯自适应</span>}
            <button className="btn btn--ghost goal-adopt" onClick={adopt}>
              采用此建议
            </button>
          </div>
        )}
      </section>

      {/* 4. 自定义 */}
      <section className="panel">
        <h2 className="panel__title">自定义</h2>
        <div className="goal-step">
          <span className="goal-step__k">每周目标词</span>
          <div className="goal-step__ctrl">
            <button className="goal-step__btn" onClick={() => setTarget(Math.max(1, target - 10))}>−</button>
            <span className="goal-step__v">{target}</span>
            <button className="goal-step__btn" onClick={() => setTarget(target + 10)}>+</button>
          </div>
        </div>
        <div className="goal-step">
          <span className="goal-step__k">每日分钟</span>
          <div className="goal-step__ctrl">
            <button className="goal-step__btn" onClick={() => setDailyMinutes(Math.max(5, dailyMinutes - 5))}>−</button>
            <span className="goal-step__v">{dailyMinutes}</span>
            <button className="goal-step__btn" onClick={() => setDailyMinutes(dailyMinutes + 5)}>+</button>
          </div>
        </div>
        <p className={"goal-custom-note" + (customFeasible ? "" : " goal-custom-note--warn")}>
          {customFeasible
            ? `按当前每日 ${dailyMinutes} 分钟，每周上限约 ${weeklyCap} 词，可行。`
            : `每周 ${target} 词超过当前投入上限（约 ${weeklyCap} 词），建议加时间或调低。`}
        </p>
      </section>

      <button className="btn btn--primary goal-save" onClick={save}>
        保存
      </button>
      <p className="pf-note">灵犀 · IELTS — 个人主体 · 数据先存于本机</p>
    </main>
  );
}
