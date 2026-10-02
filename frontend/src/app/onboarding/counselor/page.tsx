"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PinPad } from "@/components/safety/pin-pad";
import { useSession } from "@/lib/context/session-context";
import { createIdentity } from "@/lib/api/identity";
import { ApiError } from "@/lib/api/client";

export default function CounselorOnboardingPage() {
  const router = useRouter();
  const { setSession, lastIdentity } = useSession();
  const [pseudonym, setPseudonym] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"pin" | "confirm">("pin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirmed(finalPin: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await createIdentity("counselor", finalPin, pseudonym.trim() || undefined);
      setSession({ token: res.token, identity: res.identity });
      router.push("/onboarding/counselor/profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setStep("pin");
      setPin("");
      setConfirmPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Join as a counselor</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a pseudonymous counselor account. You&apos;ll set up your profile next.
          </p>
        </div>

        {step === "pin" && (
          <div className="flex flex-col gap-6">
            <Field label="Display name" htmlFor="pseudonym" hint="Shown to survivors browsing the directory.">
              <Input id="pseudonym" value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} maxLength={32} placeholder="e.g. Grace Wanjiru" />
            </Field>
            <div>
              <p className="mb-4 text-center text-sm font-medium text-foreground">Choose a 4-digit PIN</p>
              <PinPad
                value={pin}
                onChange={(v) => {
                  setPin(v);
                  if (v.length === 4) setStep("confirm");
                }}
              />
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div>
            <p className="mb-4 text-center text-sm font-medium text-foreground">Confirm your PIN</p>
            <PinPad
              value={confirmPin}
              onChange={(v) => {
                setConfirmPin(v);
                if (v.length === 4) {
                  if (v === pin) handleConfirmed(v);
                  else {
                    setError("PINs didn't match — try again.");
                    setPin("");
                    setConfirmPin("");
                    setStep("pin");
                  }
                }
              }}
            />
          </div>
        )}

        {error && <p className="text-center text-sm text-danger">{error}</p>}
        {submitting && <p className="text-center text-sm text-muted-foreground">Setting up your account…</p>}

        {lastIdentity && (
          <Button variant="link" className="mx-auto" onClick={() => router.push("/unlock")}>
            Already have an account? Sign in
          </Button>
        )}
      </div>
    </PublicShell>
  );
}
