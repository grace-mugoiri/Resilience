"use client";

import { useRouter } from "next/navigation";
import { ArrowRightCircle } from "lucide-react";

/**
 * NFR-SAF-002 (from the Figma design notes): tapping Exit must instantly
 * show the decoy screen with no confirmation dialog, no animation, and no
 * toast. router.replace (not push) so the sensitive screen isn't one
 * "back" tap away — see ARCHITECTURE.md for the browser limitations this
 * still can't fully close (history UI, session restore).
 */
export function QuickExitButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.replace("/decoy")}
      className={
        "inline-flex items-center gap-1.5 rounded-full bg-quick-exit px-4 py-2 text-sm font-semibold text-quick-exit-foreground shadow-sm hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quick-exit focus-visible:ring-offset-2 " +
        (className ?? "")
      }
      aria-label="Quick exit — leave this app immediately"
    >
      <ArrowRightCircle className="h-4 w-4" aria-hidden="true" />
      Exit
    </button>
  );
}
