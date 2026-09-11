import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import { request } from "../../lib/api";
import "../../styles/tokens.scss";
import "./index.scss";

// 网页端（Next.js）根地址。真机/体验版需改为已部署的 HTTPS 地址，
// 且将该域名加入小程序后台「开发-开发设置-服务器域名-request 合法域名」白名单。
const WEB_BRIDGE_BASE = "http://localhost:3000";

type Phase = "loading" | "success" | "error";

/**
 * 微信扫码登录落地页
 * ------------------------------------------------------------
 * 用户用微信扫网页端展示的小程序码 → 微信打开本页 → 读取 scene 里的 state
 * → wx.login 拿 code → 回调网页端 /api/auth/wechat-login/confirm 完成登录。
 * 会话由网页端签发并暂存在 wechat_login_states，网页端轮询取走后自动登录。
 */
export default function WechatScanLogin() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [msg, setMsg] = useState("正在登录…");

  useEffect(() => {
    const run = async () => {
      const scene =
        (Taro.getCurrentInstance().router?.params?.scene as string | undefined) ?? "";
      const state = decodeURIComponent(scene || "");
      if (!state) {
        setPhase("error");
        setMsg("二维码无效（缺少登录标识）");
        return;
      }
      try {
        const loginRes = await Taro.login();
        const code = loginRes.code;
        if (!code) throw new Error("获取微信登录 code 失败");
        await request({
          url: `${WEB_BRIDGE_BASE}/api/auth/wechat-login/confirm`,
          method: "POST",
          data: { code, state },
          timeout: 20000,
        });
        setPhase("success");
        setMsg("登录成功，请返回网页继续");
      } catch (e) {
        setPhase("error");
        setMsg(e instanceof Error ? e.message : "登录失败，请重试");
      }
    };
    void run();
  }, []);

  return (
    <View className="page">
      <NavBar />
      <PageBody>
        <View className="scan-card">
          <View className="section-label">微信扫码登录</View>
          {phase === "loading" ? <View className="scan-spinner" /> : null}
          <Text className={phase === "success" ? "scan-msg scan-msg--ok" : "scan-msg"}>
            {msg}
          </Text>
          {phase === "success" ? (
            <View className="answer-note">可安全关闭小程序，回到网页已自动登录。</View>
          ) : null}
          {phase === "error" ? (
            <View className="cta-full cta-full--ghost" onClick={() => Taro.navigateBack()}>
              返回
            </View>
          ) : null}
        </View>
      </PageBody>
    </View>
  );
}
