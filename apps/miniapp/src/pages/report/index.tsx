import { useState, useDidShow } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  generateReport,
  getGoalProfile,
  generateStudyPlan,
  getStudyHistory,
  type MiniReport,
  type GoalProfile,
} from "@ielts/core";
import PageBody from "../../components/PageBody";
import { useNavHeight } from "../../hooks/useNavHeight";
import "../../styles/tokens.scss";
import "./index.scss";

export default function Report() {
  const nav = useNavHeight();
  const [report, setReport] = useState<MiniReport>(() => generateReport());
  const [goal, setGoal] = useState<number>(() => getGoalProfile().weeklyWordTarget);
  const [goalProfile, setGoalProfile] = useState<GoalProfile>(() => getGoalProfile());

  const reload = () => {
    setReport(generateReport());
    const gp = getGoalProfile();
    setGoal(gp.weeklyWordTarget);
    setGoalProfile(gp);
  };
  useDidShow(reload);

  const total = report.newThisWeek + report.reviewedThisWeek;
  const lastWeek = report.lastWeekTotal || 0;
  const deltaPct = lastWeek > 0 ? Math.round(((total - lastWeek) / lastWeek) * 100) : 0;
  const dailyGoal = Math.round(goal / 7);
  const maxCount = Math.max(1, ...report.weeklyActivity.map((d) => d.count), dailyGoal);
  const barPct = (c: number) => (c / maxCount) * 100;
  const goalBottomPct = (dailyGoal / maxCount) * 100;

  const fmtMd = (key: string) => {
    const p = key ? key.split("-") : [];
    return p.length === 3 ? `${Number(p[1])}.${Number(p[2])}` : key;
  };
  const rangeLabel =
    report.weeklyActivity.length >= 2
      ? `${fmtMd(report.weeklyActivity[0].key)} – ${fmtMd(report.weeklyActivity[report.weeklyActivity.length - 1].key)}`
      : "近 7 天";

  // 学习时长（分钟）
  const studyMin = Math.round(report.studySecondsThisWeek / 60);
  const lastStudyMin = Math.round(report.studySecondsLastWeek / 60);
  const studyDelta = lastStudyMin > 0 ? Math.round(((studyMin - lastStudyMin) / lastStudyMin) * 100) : 0;

  // 概览瓷片
  const tiles = [
    { num: `${studyMin}`, unit: "分钟", label: "学习时长", delta: studyDelta },
    { num: `${report.newThisWeek}`, unit: "词", label: "新学词", delta: null as number | null },
    { num: `${report.reviewedThisWeek}`, unit: "次", label: "复习次数", delta: null as number | null },
    { num: `${report.masteredCount}`, unit: "词", label: "已掌握", delta: null as number | null },
    { num: `${report.streak}`, unit: "天", label: "连续学习", delta: null as number | null },
  ];

  // 掌握分布
  const sd = report.statusDistribution;
  const sdTotal = sd.new + sd.learning + sd.reviewing + sd.mastered;
  const seg = (n: number) => (sdTotal > 0 ? (n / sdTotal) * 100 : 0);

  const openGoal = () => {
    Taro.navigateTo({ url: "/pages/goal/index" });
  };

  // 备考目标概览（若有考试日期，展示倒计时 + 阶段进度）
  const plan = goalProfile.examDate
    ? generateStudyPlan({
        examDate: goalProfile.examDate,
        targetBand: goalProfile.targetBand,
        currentBand: goalProfile.currentBand,
        dailyMinutes: goalProfile.dailyMinutes,
        history: getStudyHistory(4),
      })
    : null;
  const weeksUntil = plan ? plan.weeksRemaining : null;
  let curPhase = 0;
  let elapsedWeeks = 0;
  if (plan && weeksUntil !== null) {
    const planned = goalProfile.plannedWeeks ?? plan.weeksRemaining;
    if (goalProfile.setAt) {
      elapsedWeeks = Math.max(0, Math.round((Date.now() - new Date(goalProfile.setAt).getTime()) / (7 * 86400000)));
    }
    elapsedWeeks = Math.min(elapsedWeeks, planned);
    let acc = 0;
    for (let i = 0; i < plan.phases.length; i++) {
      const frac = plan.phases[i].weeks / plan.weeksRemaining; // 阶段占比，稳定
      const bound = acc + frac * planned;
      if (elapsedWeeks < bound) {
        curPhase = i;
        break;
      }
      acc = bound;
    }
  }

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
        <Text className="rp-top__title">学习报告</Text>
      </View>
      <PageBody>
        {/* 1. 目标（与本周成就联动） */}
        <View className="rp-card rp-goal-board" onClick={openGoal}>
          <View className="rp-card__head">
            <Text className="rp-card__kicker">备考目标</Text>
            <Text className="rp-goal-board__set">查看 / 调整 ›</Text>
          </View>
          {weeksUntil !== null && plan ? (
            <>
              <View className="rp-goal-board__top">
                <Text className="rp-goal-board__t">
                  距考试 <Text className="b">{weeksUntil}</Text> 周
                  {goalProfile.setAt ? (
                    <> · 已坚持 <Text className="b">{elapsedWeeks}</Text> 周</>
                  ) : null}
                  · 每周 {goal} 词
                </Text>
                <Text className="rp-goal-board__pct">{plan.feasibility === "atRisk" ? "有风险" : plan.feasibility === "tight" ? "偏紧" : "从容"}</Text>
              </View>
              <View className="rp-goal-phases">
                {plan.phases.map((ph, i) => (
                  <Text
                    key={ph.name}
                    className={"rp-goal-phase" + (i === curPhase ? " rp-goal-phase--on" : "")}
                  >
                    {ph.name}
                  </Text>
                ))}
              </View>
            </>
          ) : (
            <View className="rp-goal-board__top">
              <Text className="rp-goal-board__t">尚未设定备考目标</Text>
              <Text className="rp-goal-board__pct">去设定 ›</Text>
            </View>
          )}
        </View>

        {/* 2. 学习数据概览 */}
        <View className="section-label">学习数据概览</View>
        <View className="rp-tiles">
          {tiles.map((t) => (
            <View className="rp-tile" key={t.label}>
              <View className="rp-tile__num">
                <Text className="rp-tile__n">{t.num}</Text>
                <Text className="rp-tile__u">{t.unit}</Text>
              </View>
              <Text className="rp-tile__label">{t.label}</Text>
              {t.delta !== null ? (
                <Text className={"rp-tile__delta" + (t.delta >= 0 ? "" : " rp-tile__delta--neg")}>
                  {t.delta >= 0 ? "▲" : "▼"} {Math.abs(t.delta)}%
                </Text>
              ) : (
                <Text className="rp-tile__delta rp-tile__delta--na">—</Text>
              )}
            </View>
          ))}
        </View>

        {/* 3. 学习趋势分析 */}
        <View className="section-label">学习趋势分析</View>
        <View className="rp-card">
          <View className="rp-card__head">
            <Text className="rp-card__kicker">每日学习量</Text>
            <Text className="rp-card__range">{rangeLabel}</Text>
          </View>
          <View className="pf-chart">
            <View className="pf-chart__goal" style={{ bottom: goalBottomPct + "%" }}>
              <Text className="pf-chart__goallab">日目标 {dailyGoal}</Text>
            </View>
            {report.weeklyActivity.map((d) => (
              <View key={d.key} className={"pf-col" + (d.isToday ? " pf-col--today" : "")}>
                <Text className="pf-col__v">{d.count}</Text>
                <View className="pf-col__bar" style={{ height: barPct(d.count) + "%" }} />
                <Text className="pf-col__lab">{d.label.replace("周", "")}</Text>
              </View>
            ))}
          </View>
          <View className="rp-trend-foot">
            {deltaPct >= 0 ? (
              <Text className="rp-trend-foot__delta">▲ {deltaPct}%</Text>
            ) : (
              <Text className="rp-trend-foot__delta rp-trend-foot__delta--neg">▼ {Math.abs(deltaPct)}%</Text>
            )}
            <Text className="rp-trend-foot__cap">本周总量 {total} 词 · 较上周 {lastWeek} 词</Text>
          </View>
        </View>

        {/* 4. 知识点掌握情况 */}
        <View className="section-label">知识点掌握情况</View>
        <View className="rp-card">
          <View className="rp-stack">
            <View className="rp-stack__seg rp-stack__seg--new" style={{ width: seg(sd.new) + "%" }} />
            <View className="rp-stack__seg rp-stack__seg--learning" style={{ width: seg(sd.learning) + "%" }} />
            <View className="rp-stack__seg rp-stack__seg--reviewing" style={{ width: seg(sd.reviewing) + "%" }} />
            <View className="rp-stack__seg rp-stack__seg--mastered" style={{ width: seg(sd.mastered) + "%" }} />
          </View>
          <View className="rp-legend">
            <View className="rp-leg">
              <View className="rp-leg__dot rp-leg__dot--new" />
              <Text>新学 {sd.new}</Text>
            </View>
            <View className="rp-leg">
              <View className="rp-leg__dot rp-leg__dot--learning" />
              <Text>学习中 {sd.learning}</Text>
            </View>
            <View className="rp-leg">
              <View className="rp-leg__dot rp-leg__dot--reviewing" />
              <Text>复习中 {sd.reviewing}</Text>
            </View>
            <View className="rp-leg">
              <View className="rp-leg__dot rp-leg__dot--mastered" />
              <Text>已掌握 {sd.mastered}</Text>
            </View>
          </View>
        </View>

        {/* 5. 复习正确率 */}
        <View className="section-label">复习正确率</View>
        <View className="rp-card">
          <View className="rp-rate">
            <Text className="rp-rate__num">{report.reviewCorrectRate}%</Text>
            <Text className="rp-rate__cap">本周复习判定通过率</Text>
          </View>
          <View className="rp-goal__ruler">
            <View className="rp-goal__fill" style={{ width: report.reviewCorrectRate + "%" }} />
          </View>
          <Text className="rp-note-sm">基于本周 {report.reviewedThisWeek} 次复习判定</Text>
        </View>

        {/* 6. 下一步 */}
        <View className="section-label">下一步</View>
        <View className="note note--bronze rp-next">
          <Text className="rp-next__t">{report.nextStep.title}</Text>
          <Text className="rp-next__b">{report.nextStep.body}</Text>
        </View>

        <View className="pf-note">灵犀 · IELTS — 个人主体 · 数据先存于本机</View>
      </PageBody>
    </View>
  );
}
