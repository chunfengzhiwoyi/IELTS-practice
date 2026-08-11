import { TodayZone } from "@/components/home/today-zone";
import { FunctionCards } from "@/components/home/function-cards";
import { ProgressBand } from "@/components/home/progress-band";
import { AssistantMargin } from "@/components/home/assistant-margin";

export default function HomePage() {
  return (
    <main className="folio-page">
      <TodayZone />
      <FunctionCards />
      <ProgressBand />
      <AssistantMargin />
    </main>
  );
}
