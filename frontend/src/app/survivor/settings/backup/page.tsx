"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LifeBuoy } from "lucide-react";
import { SettingsSubpage } from "@/components/layout/settings-subpage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useSession } from "@/lib/context/session-context";

type Stage = "intro" | "reveal" | "verify" | "done" | "unavailable";

export default function BackupAccountPage() {
  const router = useRouter();
  const { identity } = useSession();
  const [stage, setStage] = useState<Stage>("intro");
  const [phrase, setPhrase] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    const stored = window.sessionStorage.getItem(`resilience.recovery.${identity.id}`);
    if (window.localStorage.getItem(`resilience.backed_up.${identity.id}`) === "1") {
      setStage("done");
    } else if (!stored) {
      setStage("unavailable");
    } else {
      setPhrase(stored);
    }
  }, [identity]);

  function handleVerify() {
    if (confirmInput.trim() === phrase) {
      if (identity) window.localStorage.setItem(`resilience.backed_up.${identity.id}`, "1");
      setStage("done");
    } else {
      setError("That doesn't match what was shown. Try again.");
    }
  }

  return (
    <SettingsSubpage title="Backup your account">
      {stage === "intro" && (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-sm text-foreground">
              We can&apos;t recover your account for you. If you lose this device without backing up, your account
              — and everything in it — is gone for good.
            </p>
          </Card>
          <Card className="bg-warning-tint">
            <p className="text-sm text-warning">
              No counselor or organization will ever ask you for your backup words. Anyone who does is trying to
              take over your account.
            </p>
          </Card>
          <Button onClick={() => setStage("reveal")}>Show my backup words</Button>
          <Button variant="ghost" onClick={() => router.push("/survivor/settings")}>
            Remind me later
          </Button>
        </div>
      )}

      {stage === "reveal" && phrase && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Write these down somewhere private and offline.</p>
          <Card className="bg-surface-muted">
            <p className="break-all text-center font-mono text-lg font-semibold text-foreground">{phrase}</p>
          </Card>
          <Button onClick={() => setStage("verify")}>I&apos;ve written it down</Button>
        </div>
      )}

      {stage === "verify" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Type your backup words to confirm you saved them.</p>
          <Field label="Backup words" htmlFor="confirm">
            <Input id="confirm" value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={handleVerify}>Confirm</Button>
        </div>
      )}

      {stage === "done" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
          <p className="font-semibold text-foreground">Your account is backed up</p>
        </div>
      )}

      {stage === "unavailable" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LifeBuoy className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold text-foreground">Backup words already shown</p>
          <p className="text-sm text-muted-foreground">
            For your security, backup words are only ever shown once, right when your account is created. If you
            didn&apos;t save them, consider starting fresh from Settings → My account may be compromised.
          </p>
        </div>
      )}
    </SettingsSubpage>
  );
}
