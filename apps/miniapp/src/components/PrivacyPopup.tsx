import { useState, useEffect } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  subscribePrivacy,
  getPrivacyResolve,
  closePrivacyPopup,
  reportPrivacyExposure,
} from "../lib/privacy";
import "../styles/tokens.scss";
import "./PrivacyPopup.scss";

/**
 * 自定义隐私协议弹窗（学术编辑风，底部抽屉式）。
 * 不用微信默认弹窗：默认样式与品牌不符、且不可控强弱。
 * 显示时机由 app.tsx 的 onNeedPrivacyAuthorization 全局监听控制。
 */
export default function PrivacyPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => subscribePrivacy(setOpen), []);

  useEffect(() => {
    if (open) reportPrivacyExposure();
  }, [open]);

  if (!open) return null;

  const resolve = getPrivacyResolve();

  const agree = () => {
    resolve?.({ event: "agree" });
    closePrivacyPopup();
  };
  const disagree = () => {
    resolve?.({ event: "disagree" });
    closePrivacyPopup();
  };
  const viewFull = () => {
    // @ts-ignore
    if (typeof Taro.openPrivacyContract === "function") {
      // @ts-ignore
      Taro.openPrivacyContract({ fail: () => {} });
    } else {
      Taro.showToast({ title: "请在微信后台配置隐私指引", icon: "none" });
    }
  };

  return (
    <View className="privacy-mask">
      <View className="privacy-card">
        <Text className="privacy-card__title">隐私协议</Text>
        <Text className="privacy-card__body">
          我们仅收集你主动设置的头像、昵称，以及你的学习进度，用于为你安排复习。不获取手机号，数据先存于本机。
        </Text>
        <View className="privacy-card__actions">
          <View className="privacy-card__link" onClick={viewFull}>
            查看完整协议
          </View>
          <View className="privacy-card__btns">
            <View className="btn btn--ghost privacy-btn" onClick={disagree}>
              拒绝
            </View>
            <View className="btn btn--primary privacy-btn" onClick={agree}>
              同意并继续
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
