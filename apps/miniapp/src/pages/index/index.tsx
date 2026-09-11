import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import { useAuth } from "../../lib/auth";
import { getTodaySummary } from "@ielts/core";
import "../../styles/tokens.scss";
import "./index.scss";

export default function Today() {
  const auth = useAuth();
  const [s, setS] = useState(() => getTodaySummary());
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => setS(getTodaySummary());

  usePullDownRefresh(() => {
    refresh();
    Taro.stopPullDownRefresh();
  });

  const go = (url: string) => Taro.switchTab({ url });
  const cta = () =>
    go(s.hasDue ? "/pages/review/index" : "/pages/learn/index");

  const ticks = Array.from({ length: 7 });

  // 兜底：如果渲染出错，显示错误信息而非白屏
  if (err) {
    return (
      <View className="page" style={{ padding: '40px 28px', background: '#fee' }}>
        <Text style={{ fontSize: 28, color: 'red', display: 'block' }}>页面渲染异常：{err}</Text>
        <Text
          style={{ fontSize: 26, color: '#7a2e2b', display: 'block', marginTop: '16px' }}
          onClick={() => setErr(null)}
        >
          点击重试 →
        </Text>
      </View>
    );
  }

  try {
    return (
      <View className="page">
        <NavBar />
        <PageBody>
          {/* 周节奏刻度（替代火焰 / 贡献格） */}
          <View className="week-rule">
            {ticks.map((_, i) => (
              <View
                key={i}
                className={
                  "week-rule__tick" +
                  (i === 6 ? " week-rule__tick--today" : i % 2 === 0 ? " week-rule__tick--on" : "")
                }
              />
            ))}
          </View>

          {/* 今日主区块 */}
          <View className="today">
            <View className="section-label">Today · 第 {s.dayNumber} 天</View>
            <View className="today__title">{s.hasDue ? "继续复习" : "学一个新表达"}</View>
            <View className="today__sub">
              {s.hasDue
                ? `${s.due} 个到期 · 约 ${s.minutes} 分钟`
                : "今天先收一个表达，主动回想比多看更有效。"}
            </View>

            <View className="cta-full" onClick={cta}>
              {s.hasDue ? "开始复习" : "开始学习"}
            </View>

            <View className="today__links">
              <Text className="link" onClick={() => go("/pages/review/index")}>
                去复习 ({s.due}) →
              </Text>
              <Text className="link" onClick={() => go("/pages/speaking/index")}>
                口语练习 →
              </Text>
              <Text className="link" onClick={() => go("/pages/learn/index")}>
                学习手记 →
              </Text>
            </View>
          </View>

          {/* 下一步建议（克制、无百分比） */}
          <View className="note note--bronze">
            <Text className="note__title">{s.nextStep.title}</Text>
            <Text className="note__body">{s.nextStep.body}</Text>
          </View>

          {/* 首次轻提示（非阻断）：未设昵称时引导补全档案，可跳过 */}
          {!auth.nickname && (
            <View
              className="note note--accent identity-prompt"
              onClick={() => Taro.navigateTo({ url: "/pages/identity/index" })}
            >
              <Text className="note__title">完善你的学习档案（可选）</Text>
              <Text className="note__body">设置头像与昵称，让学习更有归属感。不获取手机号 ›</Text>
            </View>
          )}

          <View className="today__meta">
            <View className="meta">
              <Text className="meta__num">{s.streak}</Text>
              <Text className="meta__label">连续天数</Text>
            </View>
            <View className="meta">
              <Text className="meta__num">{s.newCount}</Text>
              <Text className="meta__label">本期已学</Text>
            </View>
            <View className="meta">
              <Text className="meta__num">{s.speakingCount}</Text>
              <Text className="meta__label">口语已练</Text>
            </View>
          </View>
        </PageBody>
      </View>
    );
  } catch (e: any) {
    // 同步错误兜底（不应触发，但防止白屏）
    requestAnimationFrame(() => setErr(e?.message || String(e)));
    return <View />;
  }
}
