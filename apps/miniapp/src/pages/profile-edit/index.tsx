import { useState, useEffect } from "react";
import { View, Text, Image, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  useAuth,
  saveProfileInfo,
  requirePrivacy,
  MONOGRAM_COLORS,
  type MonogramColor,
} from "../../lib/auth";
import PageBody from "../../components/PageBody";
import "../../styles/tokens.scss";
import "./index.scss";

const COLOR_ORDER: MonogramColor[] = ["ink", "accent", "bronze"];

export default function ProfileEdit() {
  const auth = useAuth();
  const [nickname, setNickname] = useState(auth.nickname);
  const [avatarUrl, setAvatarUrl] = useState(auth.avatarUrl);
  const [color, setColor] = useState<MonogramColor>(auth.monogramColor);
  const [sb, setSb] = useState(44);

  useEffect(() => {
    try {
      const info =
        typeof Taro.getWindowInfo === "function"
          ? Taro.getWindowInfo()
          : // @ts-ignore
            Taro.getSystemInfoSync();
      if (info?.statusBarHeight) setSb(info.statusBarHeight);
    } catch {
      /* 兜底 44 */
    }
  }, []);

  const usingMonogram = !avatarUrl;
  const initial = (nickname || "灵").trim()[0] || "灵";
  const active = MONOGRAM_COLORS[color];

  const onChooseAvatar = (e: any) => {
    const url = e.detail?.avatarUrl as string;
    if (url) setAvatarUrl(url);
  };

  const back = () => Taro.navigateBack();

  const save = () => {
    requirePrivacy(() => {
      saveProfileInfo(nickname.trim(), avatarUrl, color);
      Taro.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 350);
    });
  };

  return (
    <View className="page">
      <View className="pe-head" style={{ paddingTop: `${sb}px` }}>
        <View className="pe-back" onClick={back}>
          ‹ 返回
        </View>
        <View className="pe-title">编辑档案</View>
        <View className="pe-head__spacer" />
      </View>

      <PageBody>
        {/* 实时预览 */}
        <View className="pe-preview">
          {usingMonogram ? (
            <View
              className="pe-preview__avatar"
              style={{ background: active.bg, color: active.fg }}
            >
              {initial}
            </View>
          ) : (
            <Image className="pe-preview__avatar pe-preview__avatar--img" src={avatarUrl} />
          )}
          <View className="pe-preview__meta">
            <Text className="pe-preview__name">{nickname || "未命名学习者"}</Text>
            <Text className="pe-preview__sub">
              {usingMonogram ? `字母头像 · ${active.label}` : "微信头像"}
            </Text>
          </View>
        </View>

        {/* 昵称 */}
        <View className="section-label">昵称</View>
        <View className="pe-field">
          <Input
            className="pe-input"
            type={"nickname" as any}
            placeholder="点击填入昵称"
            value={nickname}
            onInput={(e) => setNickname(e.detail.value)}
            maxlength={20}
          />
        </View>

        {/* 头像来源（让用户“选择”） */}
        <View className="section-label">头像</View>
        <View className="pe-choice-row">
          <Button
            className={"pe-choice" + (usingMonogram ? " pe-choice--on" : "")}
            onClick={() => setAvatarUrl("")}
          >
            字母头像
          </Button>
          <Button
            className={"pe-choice pe-choice--avatar" + (!usingMonogram ? " pe-choice--on" : "")}
            openType="chooseAvatar"
            onChooseAvatar={onChooseAvatar}
          >
            {usingMonogram ? "使用微信头像" : "更换微信头像"}
          </Button>
        </View>

        {/* 字母头像配色（仅字母头像时可选） */}
        {usingMonogram && (
          <>
            <View className="section-label">字母配色</View>
            <View className="pe-swatches">
              {COLOR_ORDER.map((c) => {
                const m = MONOGRAM_COLORS[c];
                const on = c === color;
                return (
                  <View
                    key={c}
                    className={"pe-swatch" + (on ? " pe-swatch--on" : "")}
                    onClick={() => setColor(c)}
                  >
                    <View className="pe-swatch__dot" style={{ background: m.bg }} />
                    <Text className="pe-swatch__label">{m.label}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View className="pe-save btn btn--primary" onClick={save}>
          保存
        </View>
        <View className="pe-hint">仅用于在本机展示你的学习档案，不获取手机号。</View>
      </PageBody>
    </View>
  );
}
