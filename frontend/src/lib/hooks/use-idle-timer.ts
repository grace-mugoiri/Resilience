"use client";

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;

/** Calls onIdle after `idleMs` of no user activity. Resets on any listed event. */
export function useIdleTimer(onIdle: () => void, idleMs: number, enabled = true) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function reset() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(onIdle, idleMs);
    }

    reset();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, reset));
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset));
    };
  }, [onIdle, idleMs, enabled]);
}
