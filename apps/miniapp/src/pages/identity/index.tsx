import { useState } from "react";
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import IdentityCard from "../../components/IdentityCard";
import { useAuth, saveProfileInfo, requirePrivacy } from "../../lib/auth";
import "../../styles/tokens.scss";
import "./index.scss";

/**
 * 身份补全页（非阻塞式"登录页"）。
 * 用户首次进入且未设昵称时从首页/我的引导至此；可"稍后"跳过，保持匿名可用。
 */
export default function Identity() {
  const auth = useAuth();
  const [nickname, setNickname] = useState(auth.nickname);
  const [avatarUrl, setAvatarUrl] = useState(auth.avatarUrl);

  const onChooseAvatar = (e: any) => {
    const url = e.detail?.avatarUrl as string;
    if (url) setAvatarUrl(url);
  };

  const save = () => {
    requirePrivacy(() => {
      saveProfileInfo(nickname.trim(), avatarUrl);
      Taro.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 400);
    });
  };

  return (
    <View className="page">
      <NavBar />
      <PageBody className="identity">
        <View className="sub-back" onClick={() => Taro.navigateBack()}>
          ‹ 返回
        </View>
        <View className="section-label">设置档案</View>
        <View className="identity__lead">
          设置头像与昵称，让你的学习档案更有归属感。这一步完全可选。
        </View>

        <IdentityCard
          nickname={nickname}
          avatarUrl={avatarUrl}
          onChooseAvatar={onChooseAvatar}
          onNickname={setNickname}
          onSave={save}
        />

        <View className="identity__later" onClick={() => Taro.navigateBack()}>
          稍后再说
        </View>
      </PageBody>
    </View>
  );
}
