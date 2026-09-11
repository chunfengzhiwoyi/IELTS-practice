import { View } from "@tarojs/components";
import { useNavHeight } from "../hooks/useNavHeight";

/**
 * PageBody — 页面主体容器，自动为自定义导航栏留出正确间距。
 *
 * 替代原来硬编码 padding-top 的 `<View className="page__body pad">`。
 * 内部保留 .pad 的左右内边距，顶部 padding 由动态计算得出。
 */
interface PageBodyProps {
  className?: string;
  children?: React.ReactNode;
}

export default function PageBody({ className = "", children }: PageBodyProps) {
  const nav = useNavHeight();

  return (
    <View
      className={`page__body pad ${className}`}
      style={{ paddingTop: `${nav.totalHeight}px` }}
    >
      {children}
    </View>
  );
}
