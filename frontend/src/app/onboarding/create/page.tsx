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

export default function CreateAccountPage() {
  const router = useRouter();
  const { setSession } = useSession();
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
      const res = await createIdentity("survivor", finalPin, pseudonym.trim() || undefined);
      setSession({ token: res.token, identity: res.identity });
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(`resilience.recovery.${res.identity.id}`, res.recovery_phrase);
      }
      router.push("/survivor");
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
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a nickname you like — it&apos;s how others in Resilience will see you. Never use your real name.
          </p>
        </div>

        {step === "pin" && (
          <div className="flex flex-col gap-6">
            <Field label="Nickname (optional)" htmlFor="pseudonym" hint="Leave blank and we'll pick one for you.">
              <Input id="pseudonym" value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} maxLength={32} placeholder="e.g. QuietRiver12" />
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

        <Button variant="link" className="mx-auto" onClick={() => router.back()}>
          Back
        </Button>
      </div>
    </PublicShell>
  );
}
