import type { Milestone } from "@/lib/client/report-narrative";

export function MilestoneLine({ milestone }: { milestone: Milestone | null }) {
  if (!milestone) return null;
  return (
    <section className="milestone">
      <hr className="rule rule--bronze milestone__rule" />
      <p className="milestone__line">
        {milestone.text}
        {milestone.numeral && <em className="milestone__num">{milestone.numeral}</em>}
        {milestone.sub}
      </p>
    </section>
  );
}
