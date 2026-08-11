import Link from "next/link";

// 四个核心功能入口（冻结决策：首页主入口）
// 与子页轻导航、TodayZone 的情境化 CTA 共同构成单一、清晰的进入路径
const CARDS = [
  {
    folio: "01",
    href: "/learn",
    title: "新词学习",
    desc: "输入真题高频词与语块，生成词卡并完成主动回忆。",
  },
  {
    folio: "02",
    href: "/review",
    title: "今日复习",
    desc: "按记忆曲线巩固到期词汇，系统自动判定掌握度。",
  },
  {
    folio: "03",
    href: "/speaking",
    title: "口语训练",
    desc: "真实考题 + 录音四维反馈，每轮聚焦一个改善点。",
  },
  {
    folio: "04",
    href: "/report",
    title: "学习报告",
    desc: "分项表现与薄弱项建议，看清下一步最值得做。",
  },
];

export function FunctionCards() {
  return (
    <section aria-labelledby="func-label">
      <p id="func-label" className="section-label">
        学习区
      </p>
      <div className="ability-shelf">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="entry">
            <span className="folio">{c.folio}</span>
            <span className="entry__body">
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </span>
            <span className="entry__more">进入 →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
