import { useRef, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import { getLearnDeck, submitLearnAnswer, getImaConfig, type LearnCard, type LearnSubmitResult } from "@ielts/core";
import { getAuth } from "../../lib/auth";
import { searchImaKnowledge } from "../../lib/ima";
import "../../styles/tokens.scss";
import "./index.scss";

const SWIPE = 60; // 位移阈值，防误触

export default function Learn() {
  const [deck] = useState<LearnCard[]>(() => getLearnDeck());
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [dx, setDx] = useState(0);
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<LearnSubmitResult | null>(null);
  const [imaText, setImaText] = useState("");
  const [imaLoading, setImaLoading] = useState(false);
  const startX = useRef(0);
  const startRef = useRef(Date.now());
  const imaCfg = getImaConfig();
  const hasImaKey = !!imaCfg?.apiKey;
  const hasImaKb = !!imaCfg?.knowledgeBaseId;

  // 从设置页返回后重新读取配置，使「待配置 → 已配置」状态即时生效
  const [, force] = useState(0);
  useDidShow(() => force((n) => n + 1));

  const card = deck[idx];
  const done = idx >= deck.length;

  const onTouchStart = (e: any) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: any) => {
    if (result) return;
    setDx(e.touches[0].clientX - startX.current);
  };
  const onTouchEnd = () => {
    if (result) return;
    if (dx > SWIPE) judge(true);
    else if (dx < -SWIPE) judge(false);
    else setDx(0);
  };

  const judge = (knows: boolean) => {
    if (!card) return;
    const r = submitLearnAnswer({
      itemId: card.itemId,
      answer: knows ? card.meaning : "",
      usedHint: hint,
      userId: getAuth().userId,
      durationMs: Date.now() - startRef.current,
    });
    setResult(r);
    setFlipped(true);
    setDx(0);
  };

  const next = () => {
    setIdx((i) => i + 1);
    setFlipped(false);
    setHint(false);
    setResult(null);
    setImaText("");
    setDx(0);
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

  const pronounce = () => Taro.showToast({ title: "示例读音（待接入）", icon: "none" });

  if (deck.length === 0) {
    return (
      <View className="page">
        <NavBar />
        <PageBody>
          <View className="empty">
            <View className="section-label">学习</View>
            <View className="pullquote">本期词库已收完。</View>
            <View className="note note--bronze">去复习页巩固，或明天再来收新表达。</View>
          </View>
        </PageBody>
      </View>
    );
  }

  return (
    <View className="page">
      <NavBar />
      <PageBody>
        {/* 进度细线 */}
        <View className="progress-rule">
          <View className="progress-rule__fill" style={{ width: `${((idx) / deck.length) * 100}%` }} />
        </View>
        <View className="learn__count">
          {Math.min(idx + 1, deck.length)} / {deck.length}
        </View>

        {!done && card && (
          <View
            className="wordcard"
            style={{
              transform: `translateX(${dx}px) rotate(${dx / 28}deg)`,
              transition: result ? "none" : "transform 0.12s ease",
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onClick={() => !result && setFlipped(true)}
          >
            {/* 拖拽时的方向提示（细线，无大动画） */}
            {!result && dx > 12 && <View className="wordcard__hint wordcard__hint--know">认识</View>}
            {!result && dx < -12 && <View className="wordcard__hint wordcard__hint--unknow">不认识</View>}

            <View className="wordcard__pos">{card.partOfSpeech}</View>
            <Text className="wordcard__term">{card.term}</Text>
            <Text className="wordcard__phon" onClick={pronounce}>
              {card.phonetic} · 点按发音
            </Text>

            {!flipped && !result && (
              <View className="wordcard__recall">
                <Text className="wordcard__recall-tip">先试着回想它的意思</Text>
                <View className="wordcard__actions">
                  <View className="btn btn--ghost" onClick={(e) => { e.stopPropagation(); setHint(true); setFlipped(true); }}>
                    查看提示
                  </View>
                  <View className="btn btn--ghost" onClick={(e) => { e.stopPropagation(); setFlipped(true); }}>
                    揭晓
                  </View>
                </View>
              </View>
            )}

            {(flipped || result) && (
              <View className="wordcard__reveal">
                {hint && !result && <View className="wordcard__clue">线索：{card.clue}</View>}
                <Text className="wordcard__meaning">{card.meaning}</Text>
                <Text className="wordcard__example">{card.exampleSentence}</Text>
                <Text className="wordcard__example-zh">{card.exampleTranslation}</Text>

                {!imaText && (
                  <View
                    className="btn btn--ghost wordcard__ima-cta"
                    onClick={(e) => {
                      e.stopPropagation();
                      lookupIma(card.term);
                    }}
                  >
                    {hasImaKey ? (hasImaKb ? "查我的知识库" : "用知识库查词（待选库）") : "用知识库查词（待配置）"}
                  </View>
                )}
                {imaLoading && <View className="answer-note">查询中…</View>}
                {imaText && (
                  <View className="note note--bronze wordcard__ima">
                    <Text className="wordcard__ima-title">来自我的知识库</Text>
                    <Text className="wordcard__ima-body">{imaText}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {done && (
          <View className="learn__done">
            <View className="pullquote">一组完成。</View>
            <View className="note note--bronze">下次复习已按你的判定排好。保持节奏就好。</View>
            <View className="cta-full" onClick={() => Taro.switchTab({ url: "/pages/review/index" })}>
              去看看复习
            </View>
          </View>
        )}

        {result && !done && (
          <View className="learn__feedback">
            <View className="note note--accent">{result.feedback}</View>
            <View className="cta-full" onClick={next}>
              下一词
            </View>
          </View>
        )}

        {!result && !done && (
          <View className="learn__swipe-tip">左右滑动判定 · 右滑认识 / 左滑不认识</View>
        )}
      </PageBody>
    </View>
  );
}
