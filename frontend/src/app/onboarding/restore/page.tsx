"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { PinPad } from "@/components/safety/pin-pad";
import { useSession } from "@/lib/context/session-context";
import { restoreIdentity } from "@/lib/api/identity";
import { ApiError } from "@/lib/api/client";

// The Figma design shows a 12-word grid; this prototype's mock recovery
// phrase is a shorter hyphenated token (see backend/app/security.py), so the
// entry field is a single text area rather than 12 discrete word boxes.
export default function RestoreAccountPage() {
  const router = useRouter();
  const { setSession } = useSession();
  const [phrase, setPhrase] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePinComplete(finalPin: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await restoreIdentity(phrase.trim(), finalPin);
      setSession({ token: res.token, identity: res.identity });
      router.push("/survivor");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "That recovery phrase wasn't recognized."
          : "Something went wrong. Please try again."
      );
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Restore your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your backup words exactly as they were shown to you. No counselor or organization will ever ask
            you for these.
          </p>
        </div>

        <Field label="Backup words" htmlFor="phrase">
          <Textarea
            id="phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            rows={3}
            placeholder="word-word-word-word-word-word"
          />
        </Field>

        <div>
          <p className="mb-4 text-center text-sm font-medium text-foreground">Choose a new PIN</p>
          <PinPad
            value={pin}
            onChange={(v) => {
              setPin(v);
              if (v.length === 4 && phrase.trim()) handlePinComplete(v);
            }}
          />
        </div>

        {error && <p className="text-center text-sm text-danger">{error}</p>}
        {submitting && <p className="text-center text-sm text-muted-foreground">Restoring your account…</p>}

        <Button variant="link" className="mx-auto" onClick={() => router.back()}>
          Back
        </Button>
      </div>
    </PublicShell>
  );
}
