"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "backspace"];

export function PinPad({
  value,
  onChange,
  length = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
}) {
  function press(key: string) {
    if (key === "backspace") {
      onChange(value.slice(0, -1));
    } else if (key && value.length < length) {
      onChange(value + key);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex gap-3" role="status" aria-label={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border-2 border-primary",
              i < value.length ? "bg-primary" : "bg-transparent"
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              aria-label={key === "backspace" ? "Delete digit" : `Digit ${key}`}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted text-xl font-semibold text-foreground hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {key === "backspace" ? <Delete className="h-5 w-5" aria-hidden="true" /> : key}
            </button>
          )
        )}
      </div>
    </div>
  );
}
