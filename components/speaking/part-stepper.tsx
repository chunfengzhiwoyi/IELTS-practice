"use client";

import type { SpeakingPart } from "@/lib/speaking/types";

const PARTS: SpeakingPart[] = ["P1", "P2", "P3"];

interface Props {
  current: SpeakingPart | null;
  visited: SpeakingPart[];
  onSelect: (part: SpeakingPart) => void;
}

export function PartStepper({ current, visited, onSelect }: Props) {
  const idx = current ? PARTS.indexOf(current) : -1;
  return (
    <div className="part-stepper" role="group" aria-label="口语 Part 切换">
      {PARTS.map((p, i) => {
        const state =
          i === idx ? "current" : visited.includes(p) ? "visited" : "todo";
        return (
          <button
            key={p}
            type="button"
            aria-pressed={i === idx}
            className={`part-stepper__item part-stepper__item--${state}`}
            onClick={() => onSelect(p)}
          >
            <span className="part-stepper__dot" aria-hidden />
            {p}
          </button>
        );
      })}
    </div>
  );
}
