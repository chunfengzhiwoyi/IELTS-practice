import { View, Image } from "@tarojs/components";
import { useState, useEffect } from "react";
import Taro from "@tarojs/taro";
import { formatCNDate } from "@ielts/core";
import { useNavHeight } from "../hooks/useNavHeight";
import "../styles/tokens.scss";
import "./navbar.scss";

/** 自定义导航栏：左印章 + 右日期，右侧预留胶囊宽度，避免与右上胶囊重叠。 */
export default function NavBar() {
  const [date, setDate] = useState(formatCNDate());
  const nav = useNavHeight();

  useEffect(() => {
    // 每分钟更新日期（处理跨午夜）
    const id = setInterval(() => setDate(formatCNDate()), 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <View
      className="navbar"
      style={{ paddingTop: `${nav.statusBarHeight}px` }}
    >
      <View
        className="navbar__inner"
        style={{
          height: `${nav.navBarHeight}px`,
          paddingRight: `${nav.menuButtonRight}px`,
        }}
      >
        <Image className="navbar__seal" src={require("../assets/seal.png")} />
        <View className="navbar__date">{date}</View>
      </View>
    </View>
  );
}
