import { PropsWithChildren } from "react";
import { useLaunch } from "@tarojs/taro";
import Taro from "@tarojs/taro";
import "./app.scss";
import { initAuth } from "./lib/auth";
import { loadFonts } from "./lib/fonts";
import { openPrivacyPopup } from "./lib/privacy";
import PrivacyPopup from "./components/PrivacyPopup";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    initAuth();
    loadFonts();

    // 全局隐私闸门：任意隐私接口（chooseAvatar / 昵称保存等）被调用时，
    // 微信会触发该事件；我们弹自定义隐私弹窗，用户选择后回传 resolve。
    // @ts-ignore —— 仅微信真机/真实 appid 下存在，H5 与 touristappid 下降级为无弹窗。
    if (typeof Taro.onNeedPrivacyAuthorization === "function") {
      // @ts-ignore
      Taro.onNeedPrivacyAuthorization((resolve: any) => {
        openPrivacyPopup(resolve);
      });
    }
  });

  return (
    <>
      {children}
      <PrivacyPopup />
    </>
  );
}

export default App;
