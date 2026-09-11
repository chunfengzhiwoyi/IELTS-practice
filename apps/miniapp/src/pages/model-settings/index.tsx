import { useState } from "react";
import { View, Text, Input } from "@tarojs/components";
import Taro from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import {
  getModelConfig,
  saveModelConfig,
  modelStatus,
  PROVIDER_CATALOG,
  PROVIDER_GROUP_LABEL,
  findProvider,
  type ModelConfig,
  type LlmProtocol,
  type ProviderGroup,
} from "@ielts/core";
import { callUserModel } from "../../lib/llm-client";
import "../../styles/tokens.scss";
import "./index.scss";

const GROUPS: ProviderGroup[] = ["cn", "overseas", "custom"];
const PROTOCOLS: { value: LlmProtocol; label: string }[] = [
  { value: "openai", label: "OpenAI 兼容" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
];

const STATUS_TEXT: Record<string, string> = {
  ready: "模型已就绪",
  configured: "已配置未测",
  off: "未配置模型",
};

export default function ModelSettings() {
  const saved = getModelConfig();
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? "");
  const [modelName, setModelName] = useState(saved?.modelName ?? "");
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [protocol, setProtocol] = useState<LlmProtocol>(saved?.protocol ?? "openai");
  const [lastTestOk, setLastTestOk] = useState<boolean>(saved?.lastTestOk ?? false);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [search, setSearch] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const valid = baseUrl.trim() && modelName.trim() && apiKey.trim();
  const isCustom = selectedKey === "custom" || selectedKey === "";
  const authHint = protocolHint(protocol);

  const pickProvider = (key: string) => {
    const p = findProvider(key);
    if (!p) return;
    setSelectedKey(p.key);
    if (p.key !== "custom") {
      setBaseUrl(p.baseUrl);
      setModelName(p.model);
      setProtocol(p.protocol);
    }
    setJustSaved(false);
    setTestMsg(null);
  };

  const save = () => {
    if (!valid) {
      Taro.showToast({ title: "三项都要填", icon: "none" });
      return;
    }
    const cfg: ModelConfig = {
      baseUrl: baseUrl.trim(),
      modelName: modelName.trim(),
      apiKey: apiKey.trim(),
      protocol,
      lastTestOk,
    };
    saveModelConfig(cfg);
    setJustSaved(true);
    setTestMsg(null);
    Taro.showToast({ title: "已保存", icon: "success" });
  };

  const testConn = async () => {
    if (!valid) {
      Taro.showToast({ title: "先填好三项", icon: "none" });
      return;
    }
    setTesting(true);
    setTestMsg(null);
    const cfg: ModelConfig = {
      baseUrl: baseUrl.trim(),
      modelName: modelName.trim(),
      apiKey: apiKey.trim(),
      protocol,
    };
    try {
      const r = await callUserModel(cfg, "你是配置测试助手，只回复两个字：ok", "ping", {
        jsonMode: false,
        timeout: 20000,
      });
      if (r != null) {
        setLastTestOk(true);
        saveModelConfig({ ...cfg, lastTestOk: true });
        setTestMsg("连接成功，已记录为可用。");
      } else {
        setLastTestOk(false);
        saveModelConfig({ ...cfg, lastTestOk: false });
        setTestMsg("连接失败：检查端点、密钥与模型名是否匹配所选协议。");
      }
    } catch {
      setLastTestOk(false);
      setTestMsg("连接失败：检查端点、密钥与模型名是否匹配所选协议。");
    } finally {
      setTesting(false);
    }
  };

  const filtered = PROVIDER_CATALOG.filter(
    (p) => p.label.includes(search.trim()) || p.key.includes(search.trim().toLowerCase()),
  );

  return (
    <View className="page">
      <NavBar />
      <PageBody>
        <View className="section-label">模型设置</View>
        <View className="note note--bronze">
          用自己的大模型 Key 驱动真实口语分析。Key 仅存于本机，不离开你的设备。
        </View>

        <View className="status-line">
          <View className={`status-dot status-dot--${modelStatus(saved)}`} />
          <Text className="status-text">{STATUS_TEXT[modelStatus(saved)]}</Text>
        </View>

        <View className="section-label">模型提供商（搜索或点选）</View>
        <Input
          className="field-input"
          value={search}
          onInput={(e) => setSearch(e.detail.value)}
          placeholder="搜索厂商，如 DeepSeek / Claude / Gemini"
        />
        <View className="provider-groups">
          {GROUPS.map((g) => {
            const inGroup = filtered.filter((p) => p.group === g);
            if (inGroup.length === 0) return null;
            return (
              <View key={g} className="provider-group">
                <View className="group-label">{PROVIDER_GROUP_LABEL[g]}</View>
                <View className="preset-row">
                  {inGroup.map((p) => (
                    <View
                      key={p.key}
                      className={`preset${selectedKey === p.key ? " preset--on" : ""}`}
                      onClick={() => pickProvider(p.key)}
                    >
                      {p.label}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        {isCustom && (
          <View className="protocol-row">
            <View className="group-label">接口协议</View>
            <View className="preset-row">
              {PROTOCOLS.map((pr) => (
                <View
                  key={pr.value}
                  className={`preset${protocol === pr.value ? " preset--on" : ""}`}
                  onClick={() => {
                    setProtocol(pr.value);
                    setJustSaved(false);
                    setTestMsg(null);
                  }}
                >
                  {pr.label}
                </View>
              ))}
            </View>
          </View>
        )}
        {!isCustom && (
          <View className="note">
            协议 · {PROTOCOLS.find((p) => p.value === protocol)?.label}（选择厂商已自动设定）
          </View>
        )}

        <View className="field">
          <Text className="field__label">API 地址</Text>
          <Input
            className="field-input"
            value={baseUrl}
            onInput={(e) => {
              setBaseUrl(e.detail.value);
              setJustSaved(false);
              setTestMsg(null);
            }}
            placeholder="https://api.deepseek.com/v1"
          />
        </View>
        <View className="field">
          <Text className="field__label">模型名</Text>
          <Input
            className="field-input"
            value={modelName}
            onInput={(e) => {
              setModelName(e.detail.value);
              setJustSaved(false);
              setTestMsg(null);
            }}
            placeholder="deepseek-ai/DeepSeek-V3"
          />
        </View>
        <View className="field">
          <Text className="field__label">API Key</Text>
          <Input
            className="field-input"
            value={apiKey}
            onInput={(e) => {
              setApiKey(e.detail.value);
              setJustSaved(false);
              setTestMsg(null);
            }}
            placeholder="sk-..."
            password
          />
        </View>

        <View className="note note--bronze">{authHint}</View>

        <View className="cta-full" onClick={save}>
          保存
        </View>
        <View className="cta-full cta-full--ghost" onClick={testConn}>
          {testing ? "测试中…" : "测试连接"}
        </View>
        {testMsg && (
          <View className={`note${lastTestOk ? " note--accent" : " note--bronze"}`}>{testMsg}</View>
        )}
        {justSaved && (
          <View className="note">
            配置已保存。口语分析、报告生成等将优先使用你的接口；调用失败时自动回退离线逻辑。
          </View>
        )}
        <View className="answer-note">
          体验版需在本小程序后台「开发-开发设置-服务器域名」白名单中加入该 API 域名（如
          api.deepseek.com）。Claude / Gemini 等海外端点同样需加入白名单。
        </View>
      </PageBody>
    </View>
  );
}

function protocolHint(p: LlmProtocol): string {
  if (p === "openai") return "OpenAI 兼容接口：请求头带 Authorization: Bearer <你的 Key>。";
  if (p === "anthropic") return "Anthropic 原生接口：以 x-api-key 头传密钥，并需 anthropic-version: 2023-06-01。";
  return "Google 原生接口：API Key 直接拼入 URL（?key=...），无需 Bearer。";
}
