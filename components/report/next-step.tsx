import Link from "next/link";
import type { NextStep } from "@/lib/client/report-narrative";

export function NextStep({ nextStep }: { nextStep: NextStep }) {
  return (
    <section className="today-zone">
      <span className="section-label" style={{ margin: 0 }}>
        下一步
      </span>
      <h2 className="today-zone__title" style={{ marginTop: 10 }}>
        {nextStep.title}
      </h2>
      <p className="today-zone__sub">{nextStep.sub}</p>
      <Link href={nextStep.href} className="btn btn--primary">
        {nextStep.cta}
      </Link>
      <div className="today-zone__secondary">
        {nextStep.secondary.map((s, i) => (
          <Link key={i} href={s.href}>
            {s.text}
          </Link>
        ))}
      </div>
    </section>
  );
}
