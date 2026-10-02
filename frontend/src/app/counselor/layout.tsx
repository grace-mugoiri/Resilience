"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { counselorNavItems } from "@/components/layout/nav-items";
import { useSession } from "@/lib/context/session-context";

export default function CounselorLayout({ children }: { children: React.ReactNode }) {
  const { identity, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!identity) router.replace("/onboarding/counselor");
  }, [identity, isLoading, router]);

  if (isLoading) return <LoadingState label="Loading…" />;
  if (!identity) return null;
  if (identity.role !== "counselor") {
    return <ErrorState title="This area is for counselor accounts" description="Sign in with a counselor identity to continue." />;
  }

  return (
    <AppShell navItems={counselorNavItems} title="Resilience for counselors">
      {children}
    </AppShell>
  );
}
