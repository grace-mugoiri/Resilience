"use client";

import { WifiOff } from "lucide-react";
import { useOffline } from "@/lib/context/offline-context";

export function OfflineBanner() {
  const { isOnline, queue } = useOffline();
  if (isOnline && queue.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning/30 bg-warning-tint px-4 py-2 text-sm text-warning"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!isOnline
        ? "You're offline. Messages will send once you're back online."
        : `Syncing ${queue.length} queued message${queue.length === 1 ? "" : "s"}…`}
    </div>
  );
}
