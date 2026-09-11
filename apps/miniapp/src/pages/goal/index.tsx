import { useState } from "react";
import { View, Text, Picker, Slider, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  getGoalProfile,
  saveGoalProfile,
  getStudyHistory,
  generateReport,
  generateStudyPlan,
  type GoalProfile,
  type StudyPlan,
} from "@ielts/core";
import PageBody from "../../components/PageBody";
import { useNavHeight } from "../../hooks/useNavHeight";
import "../../styles/tokens.scss";
import "./index.scss";

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

export default function GoalPage() {
  const nav = useNavHeight();
  const init = getGoalProfile();
  const [examDate, setExamDate] = useState<string | null>(init.examDate);
  const [targetBand, setTargetBand] = useState<number>(init.targetBand);
  const [currentBand, setCurrentBand] = useState<number>(init.currentBand);
  const [dailyMinutes, setDailyMinutes] = useState<number>(init.dailyMinutes);
  const [target, setTarget] = useState<number>(init.weeklyWordTarget);
  const [plan, setPlan] = useState<StudyPlan | null>(null);

  // 当前情况（只读，来自数据）
  const hist = getStudyHistory(4);
  const rep = generateReport();
  const learned = hist.learnedWords;
  const masteryPct = learned > 0 ? Math.round((hist.masteredCount / learned) * 100) : 0;
  const avgDailyMin = Math.round(hist.avgWeeklyStudySeconds / 60 / 7);

  const weeksUntil = examDate
    ? Math.max(1, Math.ceil((new Date(examDate + "T00:00:00").getTime() - Date.now()) / (7 * 86400000)))
    : null;

  const weeklyCap = Math.floor((dailyMinutes * 7) / 1.5);
  const customFeasible = target <= weeklyCap;

  const generate = () => {
    const p = generateStudyPlan({
      examDate,
      targetBand,
      currentBand,
      dailyMinutes,
      history: hist,
    });
    setPlan(p);
  };

  const adopt = () => {
    if (!plan) return;
    setTarget(plan.recommendedWeeklyWords);
    setDailyMinutes(plan.dailyMinutes);
    Taro.showToast({ title: "已填入建议", icon: "none" });
  };

  const save = () => {
    const profile: GoalProfile = {
      examDate,
      targetBand,
      currentBand,
      dailyMinutes,
      weeklyWordTarget: Math.max(1, Math.round(target)),
      setAt: init.setAt,
      plannedWeeks: init.plannedWeeks,
    };
    saveGoalProfile(profile);
    Taro.showToast({ title: "已保存", icon: "success" });
    setTimeout(() => {
      const pages = Taro.getCurrentPages();
      if (pages.length > 1) Taro.navigateBack();
      else Taro.switchTab({ url: "/pages/profile/index" });
    }, 350);
  };

  const back = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) Taro.navigateBack();
    else Taro.switchTab({ url: "/pages/profile/index" });
  };

  return (
    <View className="page">
      <View className="rp-top" style={{ paddingTop: nav.statusBarHeight }}>
        <View className="rp-top__back" onClick={back}>
          <Text className="rp-top__chev">‹</Text>
          <Text>返回</Text>
        </View>
        <Text className="rp-top__title">备考目标</Text>
      </View>

      <PageBody>
        {/* 1. 备考背景 */}
        <View className="section-label">备考背景</View>

        <View className="goal-field">
          <Text className="goal-field__k">考试日期</Text>
          <Picker
            mode="date"
            value={examDate ?? ""}
            start="2026-01-01"
            end="2032-12-31"
            onChange={(e: any) => setExamDate(e.detail.value || null)}
          >
            <View className="goal-pick">
              <Text className={examDate ? "" : "goal-pick__ph"}>
                {examDate ? examDate : "未设定"}
              </Text>
              <Text className="goal-pick__chev">›</Text>
            </View>
          </Picker>
        </View>
        {weeksUntil !== null && (
          <Text className="goal-inline-note">距今约 {weeksUntil} 周</Text>
        )}

        <View className="goal-field">
          <Text className="goal-field__k">目标总分</Text>
          <View className="goal-pills">
            {BAND_PRESETS.map((b) => (
              <View
                key={b}
                className={"goal-pill" + (targetBand === b ? " goal-pill--on" : "")}
                onClick={() => setTargetBand(b)}
              >
                <Text>{b.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className="goal-field">
          <Text className="goal-field__k">
            当前自估分 <Text className="goal-field__val">{currentBand.toFixed(1)}</Text>
          </Text>
          <Slider
            min={4}
            max={7}
            step={0.5}
            value={currentBand}
            onChange={(e: any) => setCurrentBand(e.detail.value)}
            activeColor="#7a2e2b"
            backgroundColor="#e3ddd0"
          />
          <Text className="goal-inline-note">凭感觉选即可，用于估算词汇缺口</Text>
        </View>

        <View className="goal-field">
          <Text className="goal-field__k">每日可投入时间</Text>
          <View className="goal-pills">
            {MIN_PRESETS.map((m) => (
              <View
                key={m.min}
                className={"goal-pill goal-pill--wide" + (dailyMinutes === m.min ? " goal-pill--on" : "")}
                onClick={() => setDailyMinutes(m.min)}
              >
                <Text className="goal-pill__t">{m.min} 分钟</Text>
                <Text className="goal-pill__n">{m.note}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 2. 当前情况（只读） */}
        <View className="section-label">当前情况</View>
        <View className="rp-tiles rp-tiles--3">
          <View className="rp-tile">
            <View className="rp-tile__num">
              <Text className="rp-tile__n">{learned}</Text>
              <Text className="rp-tile__u">词</Text>
            </View>
            <Text className="rp-tile__label">已学词数</Text>
          </View>
          <View className="rp-tile">
            <View className="rp-tile__num">
              <Text className="rp-tile__n">{masteryPct}%</Text>
            </View>
            <Text className="rp-tile__label">掌握率</Text>
          </View>
          <View className="rp-tile">
            <View className="rp-tile__num">
              <Text className="rp-tile__n">{avgDailyMin}</Text>
              <Text className="rp-tile__u">分</Text>
            </View>
            <Text className="rp-tile__label">近4周日均</Text>
          </View>
        </View>

        {/* 3. 智能建议 */}
        <View className="section-label">智能建议</View>
        <View className="btn btn--primary goal-gen" onClick={generate}>
          生成我的计划
        </View>
        {plan && (
          <View className="rp-card goal-plan">
            <View className="goal-plan__head">
              <Text className="goal-plan__big">{plan.recommendedWeeklyWords}</Text>
              <Text className="goal-plan__bigu">词 / 周</Text>
              <View className={"goal-plan__feas goal-plan__feas--" + plan.feasibility}>
                <Text>{FEAS_LABEL[plan.feasibility]}</Text>
              </View>
            </View>
            <Text className="goal-plan__sub">
              距考试约 {plan.weeksRemaining} 周 · 建议每日 {plan.dailyMinutes} 分钟
            </Text>

            <View className="goal-phase">
              {plan.phases.map((ph, i) => (
                <View className="goal-phase__seg" key={ph.name} style={{ flexGrow: ph.weeks }}>
                  <View className="goal-phase__bar" />
                  <Text className="goal-phase__name">{ph.name}</Text>
                  <Text className="goal-phase__w">{ph.weeks} 周</Text>
                  <Text className="goal-phase__c">
                    {ph.weeklyWords > 0 ? `${ph.weeklyWords} 词/周` : "只复习"}
                  </Text>
                </View>
              ))}
            </View>

            <Text className="goal-plan__note">{plan.note}</Text>
            {plan.adaptive && <Text className="goal-plan__tag">已按你的习惯自适应</Text>}

            <View className="btn btn--ghost goal-adopt" onClick={adopt}>
              采用此建议
            </View>
          </View>
        )}

        {/* 4. 自定义 */}
        <View className="section-label">自定义</View>
        <View className="rp-card">
          <View className="goal-step">
            <Text className="goal-step__k">每周目标词</Text>
            <View className="goal-step__ctrl">
              <View className="goal-step__btn" onClick={() => setTarget(Math.max(1, target - 10))}>
                <Text>−</Text>
              </View>
              <Text className="goal-step__v">{target}</Text>
              <View className="goal-step__btn" onClick={() => setTarget(target + 10)}>
                <Text>+</Text>
              </View>
            </View>
          </View>
          <View className="goal-step">
            <Text className="goal-step__k">每日分钟</Text>
            <View className="goal-step__ctrl">
              <View className="goal-step__btn" onClick={() => setDailyMinutes(Math.max(5, dailyMinutes - 5))}>
                <Text>−</Text>
              </View>
              <Text className="goal-step__v">{dailyMinutes}</Text>
              <View className="goal-step__btn" onClick={() => setDailyMinutes(dailyMinutes + 5)}>
                <Text>+</Text>
              </View>
            </View>
          </View>
          <Text className={"goal-custom-note" + (customFeasible ? "" : " goal-custom-note--warn")}>
            {customFeasible
              ? `按当前每日 ${dailyMinutes} 分钟，每周上限约 ${weeklyCap} 词，可行。`
              : `每周 ${target} 词超过当前投入上限（约 ${weeklyCap} 词），建议加时间或调低。`}
          </Text>
        </View>

        <View className="btn btn--primary goal-save" onClick={save}>
          保存
        </View>
        <View className="pf-note">灵犀 · IELTS — 个人主体 · 数据先存于本机</View>
      </PageBody>
    </View>
  );
}
