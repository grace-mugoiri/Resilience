"use client";

import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";

export default function ChooseContinuePage() {
  const router = useRouter();

  return (
    <PublicShell>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Choose how to continue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You can explore first, or set up a pseudonymous account whenever you&apos;re ready.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button size="lg" className="w-full" onClick={() => router.push("/onboarding/create")}>
            Create an account
          </Button>
          <Button size="lg" variant="secondary" className="w-full" onClick={() => router.push("/survivor?guest=1")}>
            Continue without an account
          </Button>
          <Button size="lg" variant="ghost" className="w-full" onClick={() => router.push("/onboarding/restore")}>
            I already have an account
          </Button>
        </div>

        <Button variant="link" className="mx-auto" onClick={() => router.push("/onboarding/counselor")}>
          I&apos;m a counselor
        </Button>
      </div>
    </PublicShell>
  );
}
