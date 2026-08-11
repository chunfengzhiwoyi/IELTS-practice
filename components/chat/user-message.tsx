"use client";

interface Props {
  text: string;
}

export function UserMessage({ text }: Props) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-contrast">
        {text}
      </div>
    </div>
  );
}
