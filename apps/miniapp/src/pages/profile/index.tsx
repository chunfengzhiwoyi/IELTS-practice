import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import { useAuth, logout, MONOGRAM_COLORS } from "../../lib/auth";
import { generateReport, resetAll, getModelConfig, getImaConfig } from "@ielts/core";
import "../../styles/tokens.scss";
import "./index.scss";

export default function Profile() {
  const auth = useAuth();
  let report;
  try {
    report = generateReport();
  } catch {
    report = {
      newThisWeek: 0,
      reviewedThisWeek: 0,
      streak: 0,
      daysActiveThisWeek: 0,
      masteredCount: 0,
      weeklyActivity: [],
      recentMastered: [],
      weeklyGoal: 200,
      lastWeekTotal: 0,
      studySecondsThisWeek: 0,
      studySecondsLastWeek: 0,
      statusDistribution: { new: 0, learning: 0, reviewing: 0, mastered: 0 },
      reviewCorrectRate: 0,
    };
  }
  const initial = (auth.nickname || "灵").trim()[0] || "灵";
  const mono = MONOGRAM_COLORS[auth.monogramColor] ?? MONOGRAM_COLORS.ink;

  // —— 本周成就模块（柱状图 + 目标 + 连续 + 打卡 + 里程碑）——
  const total = report.newThisWeek + report.reviewedThisWeek;
  const goal = report.weeklyGoal;
  const goalPct = goal > 0 ? Math.round((total / goal) * 100) : 0;
  const dailyGoal = Math.round(goal / 7);
  const lastWeek = report.lastWeekTotal || 0;
  const deltaPct = lastWeek > 0 ? Math.round(((total - lastWeek) / lastWeek) * 100) : 0;
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
  const allActive = report.daysActiveThisWeek >= 7;

  const openEdit = () => Taro.navigateTo({ url: "/pages/profile-edit/index" });
  const openReport = () => Taro.navigateTo({ url: "/pages/report/index" });
  const openGoal = () => Taro.navigateTo({ url: "/pages/goal/index" });
  const openPrivacy = () => Taro.navigateTo({ url: "/pages/privacy/index" });
  const openModel = () => Taro.navigateTo({ url: "/pages/model-settings/index" });
  const openIma = () => Taro.navigateTo({ url: "/pages/ima-config/index" });
  const hasModel = !!getModelConfig()?.apiKey;
  const hasIma = !!getImaConfig()?.apiKey;

  const clearCache = () => {
    Taro.showModal({
      title: "清除缓存",
      content: "将清空本机学习进度与档案，且无法恢复。",
      confirmColor: "#7a2e2b",
      success: (r) => {
        if (r.confirm) {
          resetAll();
          Taro.showToast({ title: "已清除", icon: "success" });
        }
      },
    });
  };

  const doLogout = () => {
    Taro.showModal({
      title: "退出",
      content: "当前为匿名身份，退出仅清除本机标识。",
      confirmColor: "#7a2e2b",
      success: (r) => {
        if (r.confirm) {
          logout();
          Taro.showToast({ title: "已退出", icon: "success" });
        }
      },
    });
  };

  return (
    <View className="page">
      <NavBar />
      <PageBody>
        <View className="section-label">我的</View>

        {/* 身份行（紧凑） */}
        <View className="pf-identity" onClick={openEdit}>
          {auth.avatarUrl ? (
            <Image className="pf-identity__avatar" src={auth.avatarUrl} />
          ) : (
            <View
              className="pf-identity__avatar"
              style={{ background: mono.bg, color: mono.fg }}
            >
              {initial}
            </View>
          )}
          <View className="pf-identity__meta">
            <Text className="pf-identity__name">{auth.nickname || "未命名学习者"}</Text>
            <Text className="pf-identity__sub">
              {auth.anonymous ? "匿名 · 数据仅存于本机" : "已登录"}
            </Text>
          </View>
          <Text className="pf-identity__edit">编辑 ›</Text>
        </View>

        {/* 本周成就：柱状图 + 目标 + 连续 + 打卡 + 里程碑 */}
        <View className="pf-achieve">
          <View className="pf-achieve__head">
            <Text className="pf-achieve__kicker">本周成就</Text>
            <Text className="pf-achieve__range">{rangeLabel}</Text>
          </View>

          {/* 头部巨数（Apple Health 语法：数值与模式分离） */}
          <View className="pf-achieve__hero">
            <Text className="pf-achieve__num">{total}</Text>
            <Text className="pf-achieve__unit">词</Text>
          </View>
          <Text className="pf-achieve__herocap">本周学习总量</Text>

          {/* 对比注脚 + 新学/复习聚合（指标，非词表） */}
          <View className="pf-achieve__annot">
            {deltaPct >= 0 ? (
              <Text className="pf-achieve__delta">▲ {deltaPct}%</Text>
            ) : (
              <Text className="pf-achieve__delta pf-achieve__delta--neg">▼ {Math.abs(deltaPct)}%</Text>
            )}
            <Text className="pf-achieve__antext">较上周</Text>
            <Text className="pf-achieve__split">
              新学 <Text className="b">{report.newThisWeek}</Text> · 复习 <Text className="b">{report.reviewedThisWeek}</Text>
            </Text>
          </View>

          {/* 柱状图（核心，替代旧颜色刻度） */}
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

          {/* 目标完成（细进度尺，点击进入报告页设定） */}
          <View className="pf-goal" onClick={openReport}>
            <View className="pf-goal__top">
              <Text className="pf-goal__t">本周目标 <Text className="b">{goal}</Text> 词</Text>
              <Text className="pf-goal__pct">已完成 {goalPct}%</Text>
            </View>
            <View className="pf-goal__ruler">
              <View className="pf-goal__fill" style={{ width: Math.min(goalPct, 100) + "%" }} />
            </View>
          </View>

          {/* 连续学习 + 今日打卡确认 */}
          <View className="pf-streak">
            <View>
              <Text className="pf-streak__lab">连续学习</Text>
              <Text className="pf-streak__big">
                {report.streak}
                <Text className="pf-streak__u">天</Text>
              </Text>
            </View>
            <View className="pf-checkin">
              <Text>✓ 今日已打卡</Text>
            </View>
          </View>

          {/* 本周每日打卡（独立行，不与连续天数挤一行） */}
          <View className="pf-weekstrip">
            <View className="pf-weekstrip__cap">
              <Text>本周每日打卡</Text>
              <Text className="b">{allActive ? "7 天全勤" : `${report.daysActiveThisWeek} 天活跃`}</Text>
            </View>
            <View className="pf-weekdots">
              {report.weeklyActivity.map((d) => (
                <View
                  key={d.key}
                  className={
                    "pf-wd" +
                    (d.count > 0 ? " pf-wd--on" : "") +
                    (d.isToday ? " pf-wd--today" : "")
                  }
                >
                  <Text className="pf-wd__d">{d.label.replace("周", "")}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 里程碑（3 项互不重复） */}
          <View className="pf-miles">
            <View className={"pf-chip" + (goalPct >= 100 ? " pf-chip--hot" : "")}>
              <Text className="pf-chip__k">本周达标</Text>
              <Text className="pf-chip__t">
                {total} / {goal}
              </Text>
            </View>
            <View className="pf-chip">
              <Text className="pf-chip__k">满勤本周</Text>
              <Text className="pf-chip__t">{report.daysActiveThisWeek} 天全学</Text>
            </View>
            <View className="pf-chip">
              <Text className="pf-chip__k">新学词</Text>
              <Text className="pf-chip__t">{report.newThisWeek} 词</Text>
            </View>
          </View>
        </View>

        {/* 最近掌握：安静的列表，体现“积累” */}
        <View className="section-label">最近掌握</View>
        {report.recentMastered.length > 0 ? (
          <View className="pf-wordlist">
            {report.recentMastered.map((w) => (
              <View key={w.term} className="pf-word">
                <Text className="pf-word__t">{w.term}</Text>
                <Text className="pf-word__d">{w.meaning}</Text>
                <Text className="pf-word__check">已巩固</Text>
              </View>
            ))}
          </View>
        ) : (
          <View className="pf-empty">还没有掌握的词，去复习试试。</View>
        )}

        {/* 设置：分组 + 线描风格 */}
        <View className="section-label">设置</View>
        <View className="pf-settings">
          <View className="pf-set" onClick={openGoal}>
            <Text className="pf-set__t">备考目标</Text>
            <Text className="pf-set__chev">›</Text>
          </View>
          <View className="pf-set" onClick={openReport}>
            <Text className="pf-set__t">学习报告</Text>
            <Text className="pf-set__chev">›</Text>
          </View>
          <View className="pf-set" onClick={openModel}>
            <Text className="pf-set__t">模型设置</Text>
            {hasModel ? <Text className="pf-set__status pf-set__status--on">已配置</Text> : <Text className="pf-set__status">未配置</Text>}
            <Text className="pf-set__chev">›</Text>
          </View>
          <View className="pf-set" onClick={openIma}>
            <Text className="pf-set__t">ima 知识库</Text>
            {hasIma ? <Text className="pf-set__status pf-set__status--on">已配置</Text> : <Text className="pf-set__status">未配置</Text>}
            <Text className="pf-set__chev">›</Text>
          </View>
          <View className="pf-set" onClick={openPrivacy}>
            <Text className="pf-set__t">隐私协议</Text>
            <Text className="pf-set__chev">›</Text>
          </View>
          <View className="pf-set" onClick={clearCache}>
            <Text className="pf-set__t">清除缓存</Text>
            <Text className="pf-set__chev">›</Text>
          </View>
          <View className="pf-set" onClick={doLogout}>
            <Text className="pf-set__t">退出</Text>
            <Text className="pf-set__chev">›</Text>
          </View>
        </View>

        <View className="pf-note">灵犀 · IELTS — 个人主体 · 数据先存于本机</View>
      </PageBody>
    </View>
  );
}
