import { useState, useRef } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import {
  getReviewQueue,
  submitReviewRating,
  getImaConfig,
  type ReviewTask,
  type ReviewRating,
  type ReviewSubmitResult,
} from "@ielts/core";
import { getAuth } from "../../lib/auth";
import { searchImaKnowledge } from "../../lib/ima";
import "../../styles/tokens.scss";
import "./index.scss";

export default function Review() {
  const [tasks, setTasks] = useState<ReviewTask[]>(() => getReviewQueue().tasks);
  const [idx, setIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [result, setResult] = useState<ReviewSubmitResult | null>(null);
  const [imaText, setImaText] = useState("");
  const [imaLoading, setImaLoading] = useState(false);
  const startRef = useRef(Date.now());
  const imaCfg = getImaConfig();
  const hasImaKey = !!imaCfg?.apiKey;
  const hasImaKb = !!imaCfg?.knowledgeBaseId;

  // 每次进入复习页都重新读取队列：避免首屏存储适配未就绪 / 跨页学习后进度未刷新的情况
  useDidShow(() => {
    setTasks(getReviewQueue().tasks);
    setIdx(0);
    setShowHint(false);
    setResult(null);
    setImaText("");
    startRef.current = Date.now();
  });

  const task = tasks[idx];
  const done = idx >= tasks.length;

  const rate = (rating: ReviewRating) => {
    if (!task) return;
    const r = submitReviewRating({
      itemId: task.itemId,
      rating,
      userId: getAuth().userId,
      task,
      usedHint: showHint,
      durationMs: Date.now() - startRef.current,
    });
    setResult(r);
  };

  const next = () => {
    setIdx((i) => i + 1);
    setShowHint(false);
    setResult(null);
    setImaText("");
  };

  const lookupIma = async (term: string) => {
    if (imaLoading) return;
    const cfg = getImaConfig();
    if (!cfg?.apiKey) {
      Taro.showToast({ title: "请先在「我的 → ima 知识库」配置", icon: "none" });
      Taro.navigateTo({ url: "/pages/ima-config/index" });
      return;
    }
    if (!cfg.knowledgeBaseId) {
      Taro.showToast({ title: "请先在设置中选择知识库", icon: "none" });
      Taro.navigateTo({ url: "/pages/ima-config/index" });
      return;
    }
    setImaLoading(true);
    try {
      const t = await searchImaKnowledge(term, cfg);
      setImaText(t);
    } catch (e) {
      if ((e as Error)?.message === "NO_KB") {
        Taro.showToast({ title: "请先在设置中选择知识库", icon: "none" });
      }
      // 其他失败静默（下层已 toast）
    } finally {
      setImaLoading(false);
    }
  };

  if (tasks.length === 0) {
    return (
      <View className="page">
        <NavBar />
        <PageBody>
          <View className="section-label">复习</View>
          <View className="pullquote">没有到期词。</View>
          <View className="note note--bronze">系统会按你的判定安排下次复习时点，到时再来。</View>
        </PageBody>
      </View>
    );
  }

  return (
    <View className="page">
      <NavBar />
      <PageBody>
        <View className="section-label">
          待复习 {tasks.length} 个 · 约 {Math.ceil(tasks.length * 0.5)} 分钟
        </View>
        <View className="progress-rule">
          <View className="progress-rule__fill" style={{ width: `${(idx / tasks.length) * 100}%` }} />
        </View>

        {!done && task && (
          <View className="recall-card">
            <Text className="recall-card__term">{task.term}</Text>
            <Text className="recall-card__prompt">{task.prompt}</Text>

            {!result && (
              <View
                className="btn btn--ghost recall-card__hint"
                onClick={() => setShowHint((v) => !v)}
              >
                {showHint ? "隐藏提示 ▴" : "查看提示 ▾"}
              </View>
            )}
            {showHint && !result && (
              <View className="recall-card__clue-panel">
                <Text className="recall-card__clue-label">线索</Text>
                <Text className="recall-card__clue">{task.clue}</Text>
                <Text className="recall-card__clue-note">这是线索，不是完整答案。</Text>
              </View>
            )}

            {!imaText && !result && (
              <View className="btn btn--ghost recall-card__ima-cta" onClick={() => lookupIma(task.term)}>
                {hasImaKey ? (hasImaKb ? "查我的知识库" : "用知识库查词（待选库）") : "用知识库查词（待配置）"}
              </View>
            )}
            {imaLoading && <View className="answer-note">查询中…</View>}
            {imaText && (
              <View className="note note--bronze recall-card__ima">
                <Text className="recall-card__ima-title">来自我的知识库</Text>
                <Text className="recall-card__ima-body">{imaText}</Text>
              </View>
            )}

            {!result && (
              <View className="rating">
                <View className="rating__label">你回忆得怎么样？</View>
                <View className="rating__row">
                  <View className="rating__btn rating__btn--rough" onClick={() => rate("ROUGH")}>
                    生疏
                  </View>
                  <View className="rating__btn rating__btn--fuzzy" onClick={() => rate("FUZZY")}>
                    模糊
                  </View>
                  <View className="rating__btn rating__btn--skilled" onClick={() => rate("SKILLED")}>
                    熟练
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {result && (
          <View className="review__feedback">
            <View className="feedback-card">
              <View className="feedback-card__rule" />
              <Text className="feedback-card__title">下次复习</Text>
              <Text className="feedback-card__when">{whenText(result.nextReviewAt)}</Text>
              <Text className="feedback-card__body">{result.feedback}</Text>
            </View>
            <View className="cta-full" onClick={next}>
              {idx + 1 < tasks.length ? "下一个" : "完成"}
            </View>
          </View>
        )}

        {done && (
          <View className="review__done">
            <View className="pullquote">复习完成。</View>
            <View className="note note--bronze">错词已回到队列，下次更早出现。</View>
            <View className="cta-full" onClick={() => Taro.switchTab({ url: "/pages/index/index" })}>
              回到今日
            </View>
          </View>
        )}
      </PageBody>
    </View>
  );
}

function whenText(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const h = diff / 3600000;
  if (h >= 24) return `${Math.round(h / 24)} 天后`;
  if (h >= 1) return `${Math.round(h)} 小时后`;
  return "稍后";
}
