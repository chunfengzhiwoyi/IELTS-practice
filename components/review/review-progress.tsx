"use client";

interface Props {
  current: number;
  total: number;
}

export function ReviewProgress({ current, total }: Props) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>题目 {current}/{total}</span>
        <span>{percentage}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
