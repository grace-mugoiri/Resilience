"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PinPad } from "@/components/safety/pin-pad";
import { useSession } from "@/lib/context/session-context";
import { loginIdentity } from "@/lib/api/identity";
import { ApiError } from "@/lib/api/client";

export default function UnlockPage() {
  const router = useRouter();
  const { lastIdentity, setSession } = useSession();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (lastIdentity === null) {
      const t = setTimeout(() => router.replace("/"), 0);
      return () => clearTimeout(t);
    }
  }, [lastIdentity, router]);

  if (!lastIdentity) return null;

  async function handlePinComplete(finalPin: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await loginIdentity(lastIdentity!.id, finalPin);
      setSession({ token: res.token, identity: res.identity });
      router.push(res.identity.role === "counselor" ? "/counselor" : "/survivor");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Incorrect PIN." : "Something went wrong.");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <Avatar seed={lastIdentity.avatar_seed} label={lastIdentity.pseudonym} size="lg" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Welcome back, {lastIdentity.pseudonym}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your PIN to continue.</p>
        </div>

        <PinPad
          value={pin}
          onChange={(v) => {
            setPin(v);
            if (v.length === 4) handlePinComplete(v);
          }}
        />

        {error && <p className="text-sm text-danger">{error}</p>}
        {submitting && <p className="text-sm text-muted-foreground">Checking…</p>}

        <Button variant="link" onClick={() => router.push("/onboarding/restore")}>
          Not you, or forgot your PIN?
        </Button>
      </div>
    </PublicShell>
  );
}
