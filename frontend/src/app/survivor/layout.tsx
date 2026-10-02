"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/ui/states";
import { survivorNavItems } from "@/components/layout/nav-items";
import { useSession } from "@/lib/context/session-context";

const GUEST_FLAG = "resilience.guest";

export default function SurvivorLayout({ children }: { children: React.ReactNode }) {
  const { identity, isLoading, lastIdentity } = useSession();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (new URLSearchParams(window.location.search).get("guest") === "1") {
      window.sessionStorage.setItem(GUEST_FLAG, "1");
    }
    const isGuest = window.sessionStorage.getItem(GUEST_FLAG) === "1";

    if (!identity && !isGuest) {
      router.replace(lastIdentity ? "/unlock" : "/");
      return;
    }
    setReady(true);
  }, [identity, isLoading, lastIdentity, router]);

  if (isLoading || !ready) return <LoadingState label="Loading Resilience…" />;

  return (
    <AppShell navItems={survivorNavItems} title="Resilience">
      {children}
    </AppShell>
  );
}
