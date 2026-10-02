"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";

export default function SafetyCheckPage() {
  const router = useRouter();

  return (
    <PublicShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-tint">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Are you safe right now?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Resilience is a private space built for survivors. Before anything else, we want to make sure
            you&apos;re somewhere safe to continue.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Button size="lg" className="w-full" onClick={() => router.push("/onboarding/promise")}>
            Yes, I&apos;m safe to continue
          </Button>
          <Button size="lg" variant="secondary" className="w-full" onClick={() => router.push("/emergency")}>
            No, I need help now
          </Button>
        </div>
      </div>
    </PublicShell>
  );
}
