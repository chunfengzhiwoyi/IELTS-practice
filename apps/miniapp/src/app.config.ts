export default defineAppConfig({
  // 隐私合规强制开关（2023-10-17 起必填）。缺省会跳过平台隐私校验。
  __usePrivacyCheck__: true,
  pages: [
    "pages/index/index",
    "pages/learn/index",
    "pages/review/index",
    "pages/speaking/index",
    "pages/profile/index",
    "pages/report/index",
    "pages/goal/index",
    "pages/profile-edit/index",
    "pages/model-settings/index",
    "pages/ima-config/index",
    "pages/identity/index",
    "pages/privacy/index",
    "pages/wechat-scan-login/index",
  ],
  window: {
    navigationStyle: "custom",
    backgroundColor: "#faf8f4",
    backgroundTextStyle: "dark",
  },
  tabBar: {
    color: "#767067",
    selectedColor: "#7a2e2b",
    backgroundColor: "#faf8f4",
    borderStyle: "black",
    list: [
      {
        pagePath: "pages/index/index",
        text: "今日",
        iconPath: "assets/tabbar/today.png",
        selectedIconPath: "assets/tabbar/today-active.png",
      },
      {
        pagePath: "pages/learn/index",
        text: "学习",
        iconPath: "assets/tabbar/learn.png",
        selectedIconPath: "assets/tabbar/learn-active.png",
      },
      {
        pagePath: "pages/review/index",
        text: "复习",
        iconPath: "assets/tabbar/review.png",
        selectedIconPath: "assets/tabbar/review-active.png",
      },
      {
        pagePath: "pages/speaking/index",
        text: "口语",
        iconPath: "assets/tabbar/speaking.png",
        selectedIconPath: "assets/tabbar/speaking-active.png",
      },
      {
        pagePath: "pages/profile/index",
        text: "我的",
        iconPath: "assets/tabbar/profile.png",
        selectedIconPath: "assets/tabbar/profile-active.png",
      },
    ],
  },
});
