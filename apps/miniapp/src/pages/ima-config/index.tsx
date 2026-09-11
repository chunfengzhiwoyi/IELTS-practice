import { useState } from "react";
import { View, Text, Input } from "@tarojs/components";
import Taro from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import { getImaConfig, saveImaConfig, type ImaConfig } from "@ielts/core";
import { listImaKnowledgeBases } from "../../lib/ima";
import "../../styles/tokens.scss";
import "./index.scss";

export default function ImaConfig() {
  const saved = getImaConfig();
  const [clientId, setClientId] = useState(saved?.clientId ?? "");
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [kbId, setKbId] = useState(saved?.knowledgeBaseId ?? "");
  const [bases, setBases] = useState<{ id: string; name: string }[]>([]);
  const [loadingBases, setLoadingBases] = useState(false);

  const valid = clientId.trim() && apiKey.trim();

  const loadBases = async () => {
    if (!valid) {
      Taro.showToast({ title: "先填 clientId / apiKey", icon: "none" });
      return;
    }
    setLoadingBases(true);
    try {
      const list = await listImaKnowledgeBases({ clientId: clientId.trim(), apiKey: apiKey.trim() });
      setBases(list);
      Taro.showToast({ title: `找到 ${list.length} 个知识库`, icon: "none" });
    } catch {
      Taro.showToast({ title: "获取知识库失败", icon: "none" });
    } finally {
      setLoadingBases(false);
    }
  };

  const save = () => {
    if (!valid) {
      Taro.showToast({ title: "clientId / apiKey 必填", icon: "none" });
      return;
    }
    const cfg: ImaConfig = {
      clientId: clientId.trim(),
      apiKey: apiKey.trim(),
      knowledgeBaseId: kbId.trim() || undefined,
    };
    saveImaConfig(cfg);
    Taro.showToast({ title: "已保存", icon: "success" });
  };

  return (
    <View className="page">
      <NavBar />
      <PageBody>
        <View className="section-label">ima 知识库</View>
        <View className="note note--bronze">
          用你的 ima 知识库增强释义与口语上下文。凭证仅存本机，从 ima.qq.com/agent-interface 获取。
        </View>

        <View className="field">
          <Text className="field__label">Client ID</Text>
          <Input
            className="field-input"
            value={clientId}
            onInput={(e) => setClientId(e.detail.value)}
            placeholder="ima-openapi-clientid"
          />
        </View>
        <View className="field">
          <Text className="field__label">API Key</Text>
          <Input
            className="field-input"
            value={apiKey}
            onInput={(e) => setApiKey(e.detail.value)}
            placeholder="ima-openapi-apikey"
            password
          />
        </View>
        <View className="field">
          <Text className="field__label">知识库 ID（可选）</Text>
          <Input
            className="field-input"
            value={kbId}
            onInput={(e) => setKbId(e.detail.value)}
            placeholder="留空则用默认"
          />
        </View>

        <View className="cta-full cta-full--ghost" onClick={loadBases}>
          {loadingBases ? "获取中…" : "获取我的知识库"}
        </View>
        {bases.length > 0 && (
          <View className="kb-list">
            {bases.map((b) => (
              <View
                key={b.id}
                className={"kb" + (kbId === b.id ? " kb--on" : "")}
                onClick={() => setKbId(b.id)}
              >
                <Text className="kb__name">{b.name}</Text>
                {kbId === b.id && <Text className="kb__check">已选</Text>}
              </View>
            ))}
          </View>
        )}

        <View className="cta-full" onClick={save}>
          保存
        </View>
        <View className="answer-note">
          体验版需在小程序后台「服务器域名」白名单中加入 ima.qq.com。
        </View>
      </PageBody>
    </View>
  );
}
