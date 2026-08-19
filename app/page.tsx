import { TodayZone } from "@/components/home/today-zone";
import { FunctionCards } from "@/components/home/function-cards";
import { ProgressBand } from "@/components/home/progress-band";
import { LlmHomeStatus } from "@/components/home/llm-home-status";

export default function HomePage() {
  return (
    <main className="folio-page">
      <LlmHomeStatus />
      <TodayZone />
      <FunctionCards />
      <ProgressBand />
    </main>
  );
}
