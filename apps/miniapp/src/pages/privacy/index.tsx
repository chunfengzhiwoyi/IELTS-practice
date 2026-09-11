import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import NavBar from "../../components/NavBar";
import PageBody from "../../components/PageBody";
import "../../styles/tokens.scss";
import "./index.scss";

const SECTIONS: { h: string; b: string[] }[] = [
  {
    h: "我们收集的信息",
    b: [
      "微信 openid（匿名登录标识）",
      "头像、昵称（你主动设置）",
      "学习 / 复习记录与进度",
      "口语练习文本（你输入的内容）",
    ],
  },
  {
    h: "我们不收集",
    b: [
      "手机号、位置、相册、通讯录、麦克风录音",
      "口语为文本输入，不录音；个人主体下不获取手机号",
    ],
  },
  {
    h: "信息用途",
    b: [
      "用于为你提供学习进度、间隔复习排程与个性化展示",
      "不用于营销，不与任何第三方共享",
    ],
  },
  {
    h: "存储与保留",
    b: [
      "当前版本数据存于你本机",
      "你可随时在「我的」中「清除缓存」或「退出」删除全部本地数据",
    ],
  },
  {
    h: "你的权利",
    b: ["查看、清除、退出", "数据先存于本机，你始终拥有控制权"],
  },
  {
    h: "主体说明",
    b: [
      "当前为个人主体，功能与数据范围受限",
      "部分能力（如口语 AI 分析）将在合规就绪后开放",
    ],
  },
];

export default function Privacy() {
  const openOfficial = () => {
    // @ts-ignore
    if (typeof Taro.openPrivacyContract === "function") {
      // @ts-ignore
      Taro.openPrivacyContract({ fail: () => {} });
    } else {
      Taro.showToast({ title: "请在微信后台配置隐私指引", icon: "none" });
    }
  };

  return (
    <View className="page">
      <NavBar />
      <PageBody className="subpage">
        <View className="sub-back" onClick={() => Taro.navigateBack()}>
          ‹ 返回
        </View>
        <View className="section-label">隐私协议</View>
        <View className="privacy__title">灵犀 · IELTS 隐私保护指引</View>
        <View className="privacy__updated">最后更新：2026 年 8 月</View>

        {SECTIONS.map((s) => (
          <View className="privacy__sec" key={s.h}>
            <Text className="privacy__h">{s.h}</Text>
            <View className="privacy__b">
              {s.b.map((line, i) => (
                <Text className="privacy__line" key={i}>
                  · {line}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <View className="privacy__official" onClick={openOfficial}>
          查看微信官方隐私协议 ›
        </View>
      </PageBody>
    </View>
  );
}
