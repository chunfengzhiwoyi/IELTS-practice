import { useState } from "react";
import { View, Text, Textarea, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import {
  createSpeakingSession,
  analyzeSpeakingLocally,
  getModelConfig,
  getImaConfig,
  type SpeakingPart,
  type SpeakingAnalysisResult,
} from "@ielts/core";
import { getAuth } from "../../lib/auth";
import { analyzeSpeakingWithLLM } from "../../lib/speaking-llm";
import { searchImaKnowledge } from "../../lib/ima";
import "../../styles/tokens.scss";
import "./index.scss";

const PARTS: { key: SpeakingPart; label: string }[] = [
  { key: "P1", label: "P1" },
  { key: "P2", label: "P2" },
  { key: "P3", label: "P3" },
];

export default function Speaking() {
  const [part, setPart] = useState<SpeakingPart>("P1");
  const [session, setSession] = useState(() => createSpeakingSession("P1", getAuth().userId));
  const sessionId = session.session.id;
  const question = session.questionData;
  const [answer, setAnswer] = useState("");
  const [analysis, setAnalysis] = useState<SpeakingAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"llm" | "offline" | null>(null);

  const startPart = (p: SpeakingPart) => {
    if (p === part) return;
    setSession(createSpeakingSession(p, getAuth().userId));
    setPart(p);
    setAnswer("");
    setAnalysis(null);
  };

  const submit = async () => {
    if (loading) return;
    if (!answer.trim()) {
      Taro.showToast({ title: "先写一段回答", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      const cfg = getModelConfig();
      if (cfg && cfg.apiKey) {
        let imaCtx = "";
        const ima = getImaConfig();
        if (ima && ima.apiKey) {
          try {
            imaCtx = await searchImaKnowledge(question.keyTopicWords.join(" ") || question.topic, ima);
          } catch {
            imaCtx = "";
          }
        }
        const a = await analyzeSpeakingWithLLM(answer, question, cfg, imaCtx);
        setAnalysis(a);
        setSource("llm");
        setLoading(false);
        return;
      }
    } catch {
      // 模型调用失败 → 降级离线
    }
    const { analysis: a } = analyzeSpeakingLocally(sessionId, answer, false);
    setAnalysis(a);
    setSource("offline");
    setLoading(false);
  };

  const reset = () => {
    setSession(createSpeakingSession(part, getAuth().userId));
    setAnswer("");
    setAnalysis(null);
  };

  const openModel = () => Taro.navigateTo({ url: "/pages/model-settings/index" });
  const noModel = !getModelConfig()?.apiKey;

  return (
    <View className="page">
      <NavBar />
      <PageBody>
        <View className="part-switch">
          {PARTS.map((p) => (
            <View
              key={p.key}
              className={"part-switch__item" + (part === p.key ? " part-switch__item--on" : "")}
              onClick={() => startPart(p.key)}
            >
              {p.label}
            </View>
          ))}
        </View>

        <View className="question-card">
          <View className="question-card__tag">{question.topic}</View>
          <Text className="question-card__q">{question.questionZh}</Text>
          <View className="prep-block">
            <View className="prep-block__title">准备提示</View>
            <Text className="prep-block__item">关键词：{question.keyTopicWords.join("、")}</Text>
            <Text className="prep-block__item">可连接：{question.goodConnectors.slice(0, 3).join("、")}</Text>
            {question.followUps.length > 0 && (
              <Text className="prep-block__item">追问：{question.followUps[0]}</Text>
            )}
          </View>
        </View>

        {!analysis && (
          <View className="answer-box">
            <Textarea
              className="answer-input"
              placeholder="写一段回答（可唤起微信语音键盘转写，非录音）"
              value={answer}
              onInput={(e) => setAnswer(e.detail.value)}
              maxlength={2000}
            />
            {loading && <View className="answer-note">分析中…</View>}
            <View className="cta-full" onClick={submit}>
              {loading ? "分析中…" : "提交分析"}
            </View>
            {noModel ? (
              <View className="answer-note speak-cfg-hint" onClick={openModel}>
                未配置模型 · 当前为离线启发式分析，点此去「模型设置」开启真实 LLM
              </View>
            ) : (
              <View className="answer-note">分析克制呈现：流利 / 衔接 / 句式，不显示综合分与百分比。</View>
            )}
          </View>
        )}

        {analysis && (
          <View className="analysis">
            <View className="analysis__badge">
              {source === "llm" ? "真实 LLM 分析" : "离线启发式分析"}
              {source === "offline" && (
                <Text className="analysis__badge-link" onClick={openModel}> · 去配置模型</Text>
              )}
            </View>
            <View className="analysis__rows">
              <View className="analysis__row">
                <Text className="analysis__k">流利</Text>
                <Text className="analysis__v">{analysis.metrics.wordCount} 词</Text>
              </View>
              <View className="analysis__row">
                <Text className="analysis__k">衔接</Text>
                <Text className="analysis__v">{analysis.metrics.connectorCount} 连接词</Text>
              </View>
              <View className="analysis__row">
                <Text className="analysis__k">句式</Text>
                <Text className="analysis__v">{analysis.metrics.sentenceCount} 句</Text>
              </View>
            </View>
            <View className="note note--accent">{analysis.summary}</View>
            <View className="micro-drill">
              <View className="micro-drill__title">微训练</View>
              <Text className="micro-drill__prompt">{analysis.microDrill.prompt}</Text>
            </View>
            <View className="cta-full" onClick={reset}>
              重新作答
            </View>
          </View>
        )}
      </PageBody>
    </View>
  );
}
