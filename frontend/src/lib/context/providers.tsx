"use client";

import { SessionProvider } from "./session-context";
import { OfflineProvider } from "./offline-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OfflineProvider>{children}</OfflineProvider>
    </SessionProvider>
  );
}
