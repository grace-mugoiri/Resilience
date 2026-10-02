"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useIdleTimer } from "@/lib/hooks/use-idle-timer";
import { Button } from "@/components/ui/button";

const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // demo-friendly; a real deployment would tune this
const COUNTDOWN_SECONDS = 15;

/** Mounted once around authenticated survivor/counselor screens. After a
 * period of inactivity, confirms a real person is still present before
 * leaving sensitive content visible — mirrors the Figma "Still there?" R-58
 * inactivity check, with the same auto-exit-to-decoy fallback as Quick Exit. */
export function StillThereGuard() {
  const router = useRouter();
  const [prompting, setPrompting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  const onIdle = useCallback(() => {
    setSecondsLeft(COUNTDOWN_SECONDS);
    setPrompting(true);
  }, []);

  useIdleTimer(onIdle, IDLE_THRESHOLD_MS, !prompting);

  useEffect(() => {
    if (!prompting) return;
    if (secondsLeft <= 0) {
      router.replace("/decoy");
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [prompting, secondsLeft, router]);

  if (!prompting) return null;

  const progress = (secondsLeft / COUNTDOWN_SECONDS) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div role="alertdialog" aria-modal="true" aria-label="Are you still there?" className="w-full max-w-xs rounded-2xl bg-surface p-6 text-center shadow-xl">
        <div
          className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(var(--color-primary) ${progress}%, var(--color-surface-muted) 0)` }}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-xl font-semibold text-foreground">
            {secondsLeft}
          </div>
        </div>
        <p className="mb-1 font-semibold text-foreground">Still there?</p>
        <p className="mb-5 text-sm text-muted-foreground">
          For your safety, this will close automatically.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => setPrompting(false)}>I&apos;m still here</Button>
          <Button variant="ghost" onClick={() => router.replace("/decoy")}>
            Close now
          </Button>
        </div>
      </div>
    </div>
  );
}
