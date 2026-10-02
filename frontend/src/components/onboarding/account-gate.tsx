"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/context/session-context";

/** Gates a feature behind having a real (non-guest) identity. Mirrors the
 * Figma "Account needed" prompt (R-57) shown when a guest reaches a
 * feature — like messaging, wallet, circle, or records — that requires a
 * pseudonymous account to make sense. */
export function AccountGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { identity } = useSession();
  const router = useRouter();

  if (identity) return <>{children}</>;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-tint">
        <Lock className="h-6 w-6 text-primary" aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold text-foreground">You&apos;ll need an account for {feature}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Creating a pseudonymous account takes under a minute and keeps this feature private to you.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button className="w-full" onClick={() => router.push("/onboarding/create")}>
          Create an account
        </Button>
        <Button variant="link" onClick={() => router.push("/survivor")}>
          Not now
        </Button>
      </div>
    </div>
  );
}
