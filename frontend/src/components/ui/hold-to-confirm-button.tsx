"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const HOLD_MS = 3000;

export function HoldToConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  function start() {
    startRef.current = performance.now();
    const tick = (now: number) => {
      const pct = Math.min(100, ((now - startRef.current) / HOLD_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        onConfirm();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function cancel() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setProgress(0);
  }

  return (
    <button
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={start}
      onTouchEnd={cancel}
      className="relative h-12 w-full overflow-hidden rounded-full bg-danger text-sm font-semibold text-white"
    >
      <span
        className={cn("absolute inset-y-0 left-0 bg-black/25")}
        style={{ width: `${progress}%`, transition: progress === 0 ? "width 150ms ease-out" : "none" }}
        aria-hidden="true"
      />
      <span className="relative">{progress > 0 ? "Keep holding…" : label}</span>
    </button>
  );
}
